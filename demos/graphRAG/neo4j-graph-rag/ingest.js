import path from "node:path";
import { extractPdfText } from "./pdf.js";
import { chunkText, stableId } from "./text.js";
import { extractTriplesFromChunk } from "./extract.js";
import { initSchema, withSession } from "./neo4j.js";

// 这个脚本是“入库（ingestion）入口”：
//
// PDF -> text -> chunk -> (LLM 抽实体/关系) -> 写入 Neo4j
//
// 写入后的图谱结构：
// - (d:Document {id})-[:HAS_CHUNK]->(c:Chunk {id, docId, chunkIndex, text})
// - (e:Entity {name})-[:MENTIONED_IN]->(c:Chunk)
// - (s:Entity)-[:REL {type, count}]->(t:Entity)
//
// 注意：
// - 这里的 REL 用“属性 type 表示关系类型”，而不是动态创建关系类型。
//   优点：Cypher 简单；缺点：关系类型不可直接用 Neo4j 的类型索引。
//   学习阶段推荐先这样跑通。

function parseArgs(argv) {
  const args = { pdf: "", docId: "", limitChunks: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pdf") args.pdf = argv[++i];
    else if (a === "--docId") args.docId = argv[++i];
    else if (a === "--limitChunks") args.limitChunks = Number(argv[++i] || 0);
  }
  return args;
}

async function upsertChunkAndMentions({ docId, chunkId, chunkIndex, text, entities, relations }) {
  // 这个函数把“一个 chunk 的信息”写入 Neo4j：
  // 1) MERGE Document / Chunk，并建立 HAS_CHUNK
  // 2) MERGE Entity，并建立 MENTIONED_IN
  // 3) MERGE 三元组关系 REL（累计出现次数 count）
  await withSession(async (session) => {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (d:Document {id: $docId})
         MERGE (c:Chunk {id: $chunkId})
         SET c.text = $text,
             c.chunkIndex = $chunkIndex,
             c.docId = $docId
         MERGE (d)-[:HAS_CHUNK]->(c)`
        ,
        { docId, chunkId, chunkIndex: Number(chunkIndex), text }
      );

      // 记录“实体在哪些 chunk 被提到”（后续 query 会用它召回 chunk）
      for (const name of entities) {
        await tx.run(
          `MERGE (e:Entity {name: $name})
           WITH e
           MATCH (c:Chunk {id: $chunkId})
           MERGE (e)-[:MENTIONED_IN]->(c)`
          ,
          { name, chunkId }
        );
      }

      // 写入实体之间的关系三元组。
      // 这里把关系统一存成 :REL，然后用 rel.type 表示关系类型。
      for (const r of relations) {
        await tx.run(
          `MERGE (s:Entity {name: $source})
           MERGE (t:Entity {name: $target})
           MERGE (s)-[rel:REL {type: $type}]->(t)
           ON CREATE SET rel.count = 1
           ON MATCH SET rel.count = coalesce(rel.count, 0) + 1`
          ,
          { source: r.source, target: r.target, type: r.type }
        );
      }
    });
  });
}

async function main() {
  const { pdf, docId, limitChunks } = parseArgs(process.argv);
  if (!pdf) throw new Error("Usage: node ingest.js --pdf <path-to-pdf> [--docId <id>] [--limitChunks <N>]");

  // 创建约束/索引，避免重复 + 提升 MERGE 性能
  await initSchema();

  const absPdf = path.isAbsolute(pdf) ? pdf : path.resolve(process.cwd(), pdf);
  // docId 默认用 pdfPath 的 stableId，保证重复跑 ingest 时写入同一个 Document
  const resolvedDocId = docId || stableId(absPdf);

  // 1) PDF -> text
  const text = await extractPdfText(absPdf);

  // 2) text -> chunks
  const chunks = await chunkText(text);

  // 可选：只取前 N 个 chunk，方便快速验证链路
  const selected = limitChunks > 0 ? chunks.slice(0, limitChunks) : chunks;

  for (let i = 0; i < selected.length; i++) {
    const chunk = selected[i];
    const chunkId = stableId(`${resolvedDocId}:${i}`);

    // 3) 每个 chunk 调用 LLM 抽取实体和关系三元组
    const { entities, relations } = await extractTriplesFromChunk(chunk);

    // 4) 写入 Neo4j
    await upsertChunkAndMentions({
      docId: resolvedDocId,
      chunkId,
      chunkIndex: i,
      text: chunk,
      entities,
      relations,
    });

    process.stdout.write(`Ingested chunk ${i + 1}/${selected.length} (entities=${entities.length}, relations=${relations.length})\n`);
  }

  process.stdout.write(`Done. docId=${resolvedDocId}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
