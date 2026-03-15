// RAG 优化学习专题 - 第四部分
// 主题：输入侧优化 - 用户输入扩展 + RRF 排序融合
//
// 运行方式：
// node demos/rag_smart_chunking/queryExpansionRrf.js

import { FaissStore } from "@langchain/community/vectorstores/faiss";
import {
  LocalHashEmbeddings,
  buildDemoDocs,
  rrfFuse,
} from "./sharedRagDemoUtils.js";

/**
 * 教学版 Query Expansion。
 *
 * 说明：
 * - 生产中通常由 LLM 动态扩展同义问法
 * - 本示例用规则扩展，重点演示“多路检索 + RRF 融合”流程
 */
function expandQuery(query) {
  const expansions = [query];

  if (query.includes("退款")) {
    expansions.push("退货多久到账");
    expansions.push("退款时效和限制");
    expansions.push("无理由退货规则");
  }

  if (query.includes("会员")) {
    expansions.push("VIP权益");
    expansions.push("会员折扣和专属服务");
  }

  // 去重
  return [...new Set(expansions)];
}

/**
 * 对单个查询执行向量检索，并返回带 id 的排序列表
 */
async function retrieveWithId(vectorStore, query, topK = 3) {
  const docs = await vectorStore.similaritySearch(query, topK);
  return docs.map((doc) => ({
    id: doc.metadata.id,
    text: doc.pageContent,
    title: doc.metadata.title,
    query,
  }));
}

async function main() {
  const docs = buildDemoDocs();
  const embeddings = new LocalHashEmbeddings(128);
  const vectorStore = await FaissStore.fromDocuments(docs, embeddings);

  const userQuery = "会员退款有什么规则？";
  const expandedQueries = expandQuery(userQuery);

  // 多路检索：原始 query + 扩展 query
  const rankedLists = [];
  for (const q of expandedQueries) {
    const list = await retrieveWithId(vectorStore, q, 3);
    rankedLists.push(list);
  }

  // RRF 融合
  const fused = rrfFuse(rankedLists, 60).slice(0, 5);

  console.log("\n==============================");
  console.log("🔎 输入扩展 + RRF 融合示例");
  console.log("==============================");
  console.log(`用户原始问题：${userQuery}`);
  console.log(`扩展查询：${expandedQueries.join(" | ")}`);

  rankedLists.forEach((list, i) => {
    console.log(`\n子查询${i + 1}: ${expandedQueries[i]}`);
    list.forEach((item, rankIdx) => {
      console.log(`- rank${rankIdx + 1}: [${item.id}] ${item.title}`);
    });
  });

  console.log("\nRRF 融合 Top5：");
  fused.forEach((item, i) => {
    console.log(`- Top${i + 1}: [${item.id}] ${item.title} (rrf=${item.score.toFixed(4)})`);
  });

  console.log("\n✅ 结论：扩展查询可提高召回覆盖，RRF 可稳定融合多路结果。\n");
}

main().catch((error) => {
  console.error("❌ 输入扩展与RRF示例运行失败:", error.message);
});
