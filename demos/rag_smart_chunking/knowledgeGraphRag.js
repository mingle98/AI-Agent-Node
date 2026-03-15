// RAG 优化学习专题 - 第三部分
// 主题：数据源侧优化 - 知识图谱 RAG（Graph + Vector）
//
// 运行方式：
// node demos/rag_smart_chunking/knowledgeGraphRag.js

import { Document } from "@langchain/core/documents";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { LocalHashEmbeddings, buildDemoDocs, tokenize } from "./sharedRagDemoUtils.js";

/**
 * 教学用关系图（实体三元组）
 */
const TRIPLES = [
  ["退款政策", "适用", "7天无理由"],
  ["退款政策", "不适用", "生鲜商品"],
  ["退款政策", "不适用", "定制商品"],
  ["退款政策", "到账时效", "3个工作日"],
  ["VIP会员", "享受", "95折"],
  ["VIP会员", "享受", "快速退款通道"],
  ["物流时效", "普通快递", "3到5天"],
  ["物流时效", "特快专递", "次日达"],
];

/**
 * 构建简单图索引：
 * key = 实体或关系词
 * value = 相关三元组集合
 */
function buildGraphIndex(triples) {
  const index = new Map();

  const add = (key, triple) => {
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key).push(triple);
  };

  triples.forEach((triple) => {
    const [s, p, o] = triple;
    add(s, triple);
    add(p, triple);
    add(o, triple);
  });

  return index;
}

/**
 * 图谱召回：如果查询命中实体或关系词，就返回相关三元组
 */
function graphRetrieve(query, graphIndex) {
  const hits = [];
  const qTokens = tokenize(query);

  for (const [key, triples] of graphIndex.entries()) {
    if (qTokens.some((t) => key.toLowerCase().includes(t) || t.includes(key.toLowerCase()))) {
      hits.push(...triples);
    }
  }

  // 去重
  const dedup = new Map();
  hits.forEach((triple) => {
    const k = triple.join("|");
    dedup.set(k, triple);
  });

  return [...dedup.values()];
}

/**
 * 将三元组转成可用于生成的文本上下文
 */
function triplesToDocuments(triples) {
  return triples.map((triple, i) =>
    new Document({
      pageContent: `图谱事实${i + 1}：${triple[0]} - ${triple[1]} - ${triple[2]}`,
      metadata: {
        source: "knowledge-graph",
        triple: triple.join(" -> "),
      },
    })
  );
}

function printDocs(label, docs) {
  console.log(`\n${label}`);
  docs.forEach((doc, i) => {
    console.log(`- Top${i + 1}: ${doc.pageContent}`);
  });
}

async function main() {
  const baseDocs = buildDemoDocs();
  const embeddings = new LocalHashEmbeddings(128);
  const vectorStore = await FaissStore.fromDocuments(baseDocs, embeddings);

  const graphIndex = buildGraphIndex(TRIPLES);

  const query = "VIP退款有什么优先权益？多久到账？";

  // 向量召回
  const vectorHits = await vectorStore.similaritySearch(query, 2);

  // 图谱召回
  const graphTriples = graphRetrieve(query, graphIndex);
  const graphDocs = triplesToDocuments(graphTriples).slice(0, 3);

  // 融合上下文（Graph + Vector）
  const fused = [...graphDocs, ...vectorHits];

  console.log("\n==============================");
  console.log("🕸️ 知识图谱 RAG 检索示例");
  console.log("==============================");
  console.log(`查询：${query}`);

  printDocs("\nA) 仅向量召回", vectorHits);
  printDocs("\nB) 图谱召回", graphDocs);
  printDocs("\nC) 融合上下文（用于最终生成）", fused);

  console.log("\n✅ 结论：关系型问题（规则、时效、适用条件）加入图谱事实后，更容易给出结构化答案。\n");
}

main().catch((error) => {
  console.error("❌ 知识图谱RAG示例运行失败:", error.message);
});
