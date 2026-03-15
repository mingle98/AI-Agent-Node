import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import neo4j from "neo4j-driver";
import { createChatModel } from "./llm.js";
import { extractEntitiesFromQuestion } from "./extract.js";
import { withSession } from "./neo4j.js";

// 这个脚本是“GraphRAG 查询入口”。
//
// 核心思路（非常典型的 GraphRAG）：
// 1) 用 LLM 从问题里抽 seed entities
// 2) 在 Neo4j 里找匹配实体（模糊包含匹配）
// 3) 从这些实体出发做多跳扩展，拿到一批“图三元组”作为结构化上下文
// 4) 同时把这些实体关联到的 chunk 文本召回，作为非结构化证据
// 5) 把【三元组 + chunk 原文】喂给 LLM，让它基于证据回答

function parseArgs(argv) {
  const args = { q: "", limitEntities: 5, hop: 2, limitChunks: 8 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--q") args.q = argv[++i];
    else if (a === "--limitEntities") args.limitEntities = Number(argv[++i] || 5);
    else if (a === "--hop") args.hop = Number(argv[++i] || 2);
    else if (a === "--limitChunks") args.limitChunks = Number(argv[++i] || 8);
  }
  return args;
}

async function fetchSubgraph({ seedEntities, hop, limitChunks }) {
  // 输入：
  // - seedEntities：从问题里抽出来的实体名（可能与图里实体不完全一致）
  // - hop：图扩展的跳数
  // - limitChunks：最多召回多少 chunk
  //
  // 输出：
  // - matchedEntities：图里最终命中的实体
  // - triples：扩展子图里的边（source/type/target）
  // - chunks：与这些实体有关的文本证据
  return await withSession(async (session) => {
    return await session.executeRead(async (tx) => {
      // 1) 把 seed entity 映射到 Neo4j 里的实体节点。
      // 这里用 contains 做宽松匹配（学习 demo 够用），生产可改为：
      // - 全文索引
      // - 同义词表
      // - embedding 相似度
      const entityRes = await tx.run(
        `MATCH (e:Entity)
         WHERE any(s IN $seeds WHERE toLower(e.name) CONTAINS toLower(s))
         RETURN e.name AS name
         LIMIT $limitEntities`,
        {
          seeds: seedEntities,
          // Neo4j 的 LIMIT/SKIP 需要 INTEGER 类型；JS number 可能会被当成 FLOAT(6.0)
          // 所以这里显式用 neo4j.int 包一层。
          limitEntities: neo4j.int(Math.max(1, Math.min(20, seedEntities.length * 3))),
        }
      );

      const matchedEntities = entityRes.records.map((r) => r.get("name"));

      // 2) 图扩展：从命中实体出发，向外多跳，把 REL 边取出来。
      // 这里同时做正向/反向扩展，避免漏召回。
      const relRes = await tx.run(
        `MATCH (e:Entity)
         WHERE e.name IN $entities
         CALL {
           WITH e
           MATCH p=(e)-[:REL*1..${hop}]->(n:Entity)
           RETURN p
           UNION
           WITH e
           MATCH p=(n:Entity)-[:REL*1..${hop}]->(e)
           RETURN p
         }
         WITH collect(p) AS paths
         UNWIND paths AS p
         UNWIND relationships(p) AS r
         WITH startNode(r) AS s, endNode(r) AS t, r AS rel
         RETURN s.name AS source, rel.type AS type, t.name AS target, coalesce(rel.count, 1) AS count
         ORDER BY count DESC
         LIMIT 60`,
        { entities: matchedEntities }
      );

      const triples = relRes.records.map((r) => ({
        source: r.get("source"),
        type: r.get("type"),
        target: r.get("target"),
        count: r.get("count"),
      }));

      // 3) 召回 chunk：把命中实体关联到的 Chunk 按“被多少实体命中”排序。
      // 这是最简单的图检索打分方式：count(*) 越大说明这个 chunk 覆盖的相关实体越多。
      const chunkRes = await tx.run(
        `MATCH (e:Entity)-[:MENTIONED_IN]->(c:Chunk)
         WHERE e.name IN $entities
         RETURN c.id AS id, c.text AS text, c.docId AS docId, c.chunkIndex AS chunkIndex, count(*) AS score
         ORDER BY score DESC, chunkIndex ASC
         LIMIT $limitChunks`,
        { entities: matchedEntities, limitChunks: neo4j.int(limitChunks) }
      );

      const chunks = chunkRes.records.map((r) => ({
        id: r.get("id"),
        text: r.get("text"),
        docId: r.get("docId"),
        chunkIndex: r.get("chunkIndex"),
        score: r.get("score"),
      }));

      return { matchedEntities, triples, chunks };
    });
  });
}

async function answerWithContext(question, context) {
  // 4) 用 LLM 把“结构化三元组 + 非结构化 chunk 文本”融合成最终回答。
  // 这里不做复杂的 prompt 工程，目标是让你看清 GraphRAG 的核心数据拼装方式。
  const llm = createChatModel({ temperature: 0.2 });
  const system = new SystemMessage(
    "You are a helpful assistant. Use the provided graph triples and source text chunks as grounding. If the answer is not supported, say you are not sure."
  );

  const triplesText = context.triples
    .slice(0, 60)
    .map((t) => `${t.source} -[${t.type}]-> ${t.target} (count=${t.count})`)
    .join("\n");

  const chunksText = context.chunks
    .slice(0, 8)
    .map((c) => `# Chunk docId=${c.docId} idx=${c.chunkIndex}\n${c.text}`)
    .join("\n\n");

  const user = new HumanMessage(
    `Question:\n${question}\n\nGraph Triples:\n${triplesText}\n\nSource Chunks:\n${chunksText}`
  );

  const res = await llm.invoke([system, user]);
  return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
}

async function main() {
  const { q, hop, limitChunks } = parseArgs(process.argv);
  if (!q) throw new Error("Usage: node query.js --q \"your question\" [--hop 2] [--limitChunks 8]");

  // 1) 从问题抽实体
  const seedEntities = await extractEntitiesFromQuestion(q);
  if (seedEntities.length === 0) throw new Error("No entities extracted from question. Try rephrasing.");

  // 2) 图检索（子图 + chunk 证据）
  const context = await fetchSubgraph({ seedEntities, hop, limitChunks });

  // 3) 基于证据回答
  const answer = await answerWithContext(q, context);

  process.stdout.write(`Entities: ${context.matchedEntities.join(", ")}\n\n`);
  process.stdout.write(answer + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
