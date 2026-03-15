// ========== 示例场景：知识图谱RAG问答机器人 ==========

import neo4j from "neo4j-driver";

import { extractEntitiesFromQuestion } from "./neo4j-graph-rag/extract.js";
import { withSession } from "./neo4j-graph-rag/neo4j.js";
import { createChatModel } from "./neo4j-graph-rag/llm.js";

// --------------------
// GraphRAG 检索层（复用 neo4j-graph-rag/query.js 的逻辑）
// --------------------

async function fetchSubgraph({ seedEntities, hop = 2, limitChunks = 8, limitTriples = 60 }) {
  // 输入：
  // - seedEntities：从问题里抽出来的实体（用于图检索）
  // - hop：图扩展跳数（控制子图大小）
  // - limitChunks：最多召回多少个证据 chunk
  // - limitTriples：最多取多少条三元组（避免上下文过长）
  //
  // 输出：
  // - matchedEntities：图里最终匹配到的实体名
  // - triples：子图里的边（source/type/target/count）
  // - chunks：关联的原文证据（带 docId/idx/score）
  return await withSession(async (session) => {
    return await session.executeRead(async (tx) => {
      const entityRes = await tx.run(
        `MATCH (e:Entity)
         WHERE any(s IN $seeds WHERE toLower(e.name) CONTAINS toLower(s))
         RETURN e.name AS name
         LIMIT $limitEntities`,
        {
          seeds: seedEntities,
          limitEntities: neo4j.int(Math.max(1, Math.min(20, seedEntities.length * 3))),
        }
      );

      const matchedEntities = entityRes.records.map((r) => r.get("name"));
      // 如果没有匹配实体，直接返回空结果，避免后续 Cypher 报错
      if (matchedEntities.length === 0) return { matchedEntities: [], triples: [], chunks: [] };

      // 图扩展：从匹配实体出发，向外多跳，把 REL 边取出来
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
         LIMIT $limitTriples`,
        { entities: matchedEntities, limitTriples: neo4j.int(limitTriples) }
      );

      const triples = relRes.records.map((r) => ({
        source: r.get("source"),
        type: r.get("type"),
        target: r.get("target"),
        count: r.get("count"),
      }));

      // 召回证据 chunk：与匹配实体关联的 Chunk，按“被多少实体命中”排序
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

// --------------------
// 格式化工具：把三元组/chunk 变成文本，方便喂给 LLM
// --------------------

function formatTriples(triples) {
  // 把三元组数组变成人类可读的字符串，用于提示词
  return triples.map((t) => `${t.source} -[${t.type}]-> ${t.target} (count=${t.count})`).join("\n");
}

function formatChunks(chunks, { maxLen = 900 } = {}) {
  // 把 chunk 数组变成带元数据的文本，并裁剪长度（避免 LLM 上下文溢出）
  return chunks
    .map((c) => {
      const text = String(c.text || "");
      const clipped = text.length > maxLen ? text.slice(0, maxLen) + "\n..." : text;
      return `# Chunk docId=${c.docId} idx=${c.chunkIndex} score=${c.score}\n${clipped}`;
    })
    .join("\n\n");
}

// --------------------
// LLM 生成层：把检索结果变成业务风格的回答
// --------------------

async function answerBusinessStyle({ question, conversationSummary, context }) {
  // 输入：
  // - question：用户当前问题
  // - conversationSummary：多轮对话摘要（每 4 轮生成一次）
  // - context：fetchSubgraph 的结果（matchedEntities/triples/chunks）
  //
  // 输出：业务风格的回答（结论+依据+建议）
  const llm = createChatModel({ temperature: 0.2 });

  // System Prompt：定义机器人身份、知识来源限制、回答风格
  const systemText =
    "你是一个企业内部的\"AI Agent 技术顾问机器人\"。\n" +
    "你的知识来源只允许使用：图谱三元组(结构化) + 原文分块(证据)。\n" +
    "如果证据不足，请明确说\"依据当前资料无法确定\"，并给出你需要补充的信息。\n" +
    "回答风格：\n" +
    "- 先给结论（3-6条要点）\n" +
    "- 再给依据（引用 chunk 的 docId/idx）\n" +
    "- 最后给可落地建议（如果问题是工程/产品类）";

  const triplesText = formatTriples(context.triples.slice(0, 60));
  const chunksText = formatChunks(context.chunks.slice(0, 8));

  // User Prompt：把所有上下文拼成一段文本
  const userText =
    `【对话摘要】\n${conversationSummary || "(无)"}\n\n` +
    `【用户问题】\n${question}\n\n` +
    `【图谱三元组】\n${triplesText || "(无)"}\n\n` +
    `【证据原文Chunks】\n${chunksText || "(无)"}`;

  const res = await llm.invoke([
    { role: "system", content: systemText },
    { role: "user", content: userText },
  ]);

  return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
}

// --------------------
// 对话摘要：防止多轮对话上下文无限膨胀
// --------------------

async function summarizeConversation(llm, turns) {
  // 目的：每 N 轮对话后，把历史压缩成摘要，减少 LLM 上下文长度
  // 这里 N=4，你可以根据业务调整
  if (!turns.length) return "";
  const text = turns
    .slice(-12)
    .map((t) => `${t.role === "user" ? "用户" : "机器人"}：${t.content}`)
    .join("\n");

  const res = await llm.invoke([
    {
      role: "system",
      content: "请把多轮对话压缩成 5-10 行要点摘要，保留用户目标、约束、已确认事实、未决问题。",
    },
    { role: "user", content: text },
  ]);
  return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
}

// --------------------
// 主 demo：批量测试 + 统计（风格同 customerService.js）
// --------------------

export async function graphRAGDemo(runtimeOptions = {}) {
  console.log("\n" + "=".repeat(70));
  console.log("📊 示例场景：知识图谱RAG问答机器人（基于 Neo4j + 通义千问）");
  console.log("=".repeat(70));
  console.log("\n功能演示：");
  console.log("✅ 从问题抽取实体（LLM）");
  console.log("✅ Neo4j 图检索（实体匹配 + 多跳子图扩展）");
  console.log("✅ 召回原文证据（Chunk）");
  console.log("✅ 融合图谱+原文生成业务风格答案\n");

  const { hop = 2, limitChunks = 8, showEvidence = true } = runtimeOptions;

  // 示例问题（围绕你已导入的白皮书）
  const questions = [
    "这份白皮书里 AI Agent 的核心组件有哪些？",
    "白皮书里提到的 orchestration 包含哪些推理范式？",
    "AI Agent 与大语言模型的关系是什么？",
    "白皮书里对 Tool 的定义有哪些分类？",
    "认知架构（cognitive architecture）在白皮书里如何描述？",
    "白皮书里提到哪些部署平台或实现技术？",
    "RAG 在白皮书里属于哪个组件或能力？",
    "白皮书对 Agent 的安全性和可观测性有什么说法？",
    "LangChain 在白皮书里的定位是什么？",
    "白皮书里对未来 Agent 发展趋势的展望是什么？",
  ];

  console.log("=".repeat(70));
  console.log("开始问答...\n");

  const stats = {
    totalQuestions: questions.length,
    answered: 0,
    totalMatchedEntities: 0,
    totalTriples: 0,
    totalChunks: 0,
  };

  for (let i = 0; i < questions.length; i++) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`💬 第 ${i + 1} 轮问答`);
    console.log("─".repeat(70));
    console.log(`👤 问题：${questions[i]}\n`);

    try {
      // 1) 抽实体
      const seedEntities = await extractEntitiesFromQuestion(questions[i]);

      // 2) 图检索
      const context = await fetchSubgraph({
        seedEntities,
        hop,
        limitChunks,
      });

      // 3) 生成答案（这里不带多轮摘要，保持简洁）
      const answer = await answerBusinessStyle({
        question: questions[i],
        conversationSummary: "",
        context,
      });

      // 4) 输出答案
      console.log(`🤖 回答：\n${answer}`);

      // 5) 可选证据输出
      if (showEvidence) {
        console.log("\n🔍 证据（命中实体/三元组/Chunk）");
        console.log(`👉 命中实体：${context.matchedEntities.join(", ") || "(无)"}`);
        console.log("\n[Triples]");
        console.log(formatTriples(context.triples.slice(0, 30)) || "(无)");
        console.log("\n[Chunks]");
        console.log(formatChunks(context.chunks.slice(0, 5)) || "(无)");
      }

      // 6) 统计更新
      if (context.matchedEntities.length) stats.answered++;
      stats.totalMatchedEntities += context.matchedEntities.length;
      stats.totalTriples += context.triples.length;
      stats.totalChunks += context.chunks.length;
    } catch (err) {
      console.error(`❌ 错误: ${err.message}`);
    }

    // 每3轮输出一次中间统计
    if ((i + 1) % 3 === 0) {
      console.log(`\n📊 当前进度: ${i + 1}/${questions.length} 已问答`);
    }
  }

  // 最终统计
  console.log("\n" + "=".repeat(70));
  console.log("📊 最终统计");
  console.log("=".repeat(70));
  console.log(`总问题数: ${stats.totalQuestions}`);
  console.log(`成功命中实体并回答: ${stats.answered}`);
  console.log(`总命中实体数: ${stats.totalMatchedEntities}`);
  console.log(`总召回三元组数: ${stats.totalTriples}`);
  console.log(`总召回Chunk数: ${stats.totalChunks}`);
  console.log(`平均每轮命中实体: ${(stats.totalMatchedEntities / stats.totalQuestions).toFixed(2)}`);
  console.log(`平均每轮召回Chunk: ${(stats.totalChunks / stats.totalQuestions).toFixed(2)}`);

  console.log("\n" + "=".repeat(70));
  console.log("🎯 GraphRAG 关键要点总结");
  console.log("=".repeat(70));
  console.log("\n📎 图检索优势:");
  console.log("  - 实体匹配比纯文本检索更精准");
  console.log("  - 多跳子图扩展带来结构化上下文");
  console.log("  - 关系三元组帮助 LLM 理解概念关联");
  
  console.log("\n🎯 原文证据作用:");
  console.log("  - Chunk 提供可溯源的文本证据");
  console.log("  - 避免模型“胡编乱造”");
  console.log("  - 支持答案可解释性");
  
  console.log("\n💡 业务价值:");
  console.log("  ✅ 适合知识密集型问答（技术文档、白皮书、法规）");
  console.log("  ✅ 支持复杂概念关联查询");
  console.log("  ✅ 可扩展为多文档、多租户知识库");
}

// 如果直接运行此文件，执行 demo
if (import.meta.url === `file://${process.argv[1]}`) {
  graphRAGDemo({ hop: 2, limitChunks: 8, showEvidence: true }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}