// RAG 优化学习专题 - 第六部分
// 主题：检索侧优化 - 混合检索（关键词 + 向量）
//
// 运行方式：
// node demos/rag_smart_chunking/hybridSearch.js

import { FaissStore } from "@langchain/community/vectorstores/faiss";
import {
  LocalHashEmbeddings,
  buildDemoDocs,
  keywordScore,
} from "./sharedRagDemoUtils.js";

/**
 * 关键词检索：基于 query 与文档内容的词频匹配。
 */
function keywordRetrieve(query, docs, topK = 5) {
  return docs
    .map((doc) => ({
      id: doc.metadata.id,
      title: doc.metadata.title,
      text: doc.pageContent,
      keyword: keywordScore(query, doc.pageContent),
    }))
    .sort((a, b) => b.keyword - a.keyword)
    .slice(0, topK);
}

/**
 * 向量检索
 */
async function vectorRetrieve(query, vectorStore, topK = 5) {
  const docs = await vectorStore.similaritySearch(query, topK);
  return docs.map((doc, idx) => ({
    id: doc.metadata.id,
    title: doc.metadata.title,
    text: doc.pageContent,
    // similaritySearch 已按相关度排序，使用 rank 近似映射为分数
    vector: 1 / (idx + 1),
  }));
}

/**
 * 混合融合：
 * final = alpha * keyword_norm + beta * vector_norm
 */
function hybridFuse(keywordList, vectorList, alpha = 0.2, beta = 0.8) {
  const map = new Map();

  const maxKeyword = Math.max(...keywordList.map((x) => x.keyword), 1e-9);
  const maxVector = Math.max(...vectorList.map((x) => x.vector), 1e-9);

  keywordList.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, { id: item.id, title: item.title, text: item.text, keyword: 0, vector: 0 });
    }
    map.get(item.id).keyword = item.keyword / maxKeyword;
  });

  vectorList.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, { id: item.id, title: item.title, text: item.text, keyword: 0, vector: 0 });
    }
    map.get(item.id).vector = item.vector / maxVector;
  });

  const fused = [];
  for (const value of map.values()) {
    const score = alpha * value.keyword + beta * value.vector;
    fused.push({ ...value, score });
  }

  return fused.sort((a, b) => b.score - a.score);
}

async function main() {
  const docs = buildDemoDocs();
  const embeddings = new LocalHashEmbeddings(128);
  const vectorStore = await FaissStore.fromDocuments(docs, embeddings);

  const query = "我想了解退款到账时间和无理由退货限制";

  const keywordTop = keywordRetrieve(query, docs, 5);
  const vectorTop = await vectorRetrieve(query, vectorStore, 5);
  const hybridTop = hybridFuse(keywordTop, vectorTop, 0.2, 0.8).slice(0, 5);

  console.log("\n==============================");
  console.log("⚖️ 混合检索示例（关键词20% + 向量80%）");
  console.log("==============================");
  console.log(`查询：${query}`);

  console.log("\nA) 关键词检索 Top5");
  keywordTop.forEach((x, i) => {
    console.log(`- Top${i + 1}: [${x.id}] ${x.title} (kw=${x.keyword.toFixed(4)})`);
  });

  console.log("\nB) 向量检索 Top5");
  vectorTop.forEach((x, i) => {
    console.log(`- Top${i + 1}: [${x.id}] ${x.title} (vec=${x.vector.toFixed(4)})`);
  });

  console.log("\nC) 混合融合 Top5");
  hybridTop.forEach((x, i) => {
    console.log(
      `- Top${i + 1}: [${x.id}] ${x.title} (score=${x.score.toFixed(4)}, kw=${x.keyword.toFixed(4)}, vec=${x.vector.toFixed(4)})`
    );
  });

  console.log("\n✅ 结论：混合检索可兼顾关键词精确匹配与语义召回鲁棒性。\n");
}

main().catch((error) => {
  console.error("❌ 混合检索示例运行失败:", error.message);
});
