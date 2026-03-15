// RAG 优化学习专题 - 第四部分
// 主题：输入侧优化 - 用户输入扩展 + RRF 排序融合
//
// 运行方式：
// node demos/rag_smart_chunking/queryExpansionRrf.js

import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { BaseRetriever } from "@langchain/core/retrievers";
import { EnsembleRetriever } from "@langchain/classic/retrievers/ensemble";
import {
  LocalHashEmbeddings,
  buildDemoDocs,
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

class FixedQueryVectorRetriever extends BaseRetriever {
  constructor({ vectorStore, fixedQuery, topK = 3 }) {
    super({});
    this.vectorStore = vectorStore;
    this.fixedQuery = fixedQuery;
    this.topK = topK;
  }

  async _getRelevantDocuments() {
    const docs = await this.vectorStore.similaritySearch(this.fixedQuery, this.topK);
    return docs.map((doc) => {
      return {
        ...doc,
        metadata: {
          ...doc.metadata,
          subQuery: this.fixedQuery,
        },
      };
    });
  }
}

async function main() {
  const docs = buildDemoDocs();
  const embeddings = new LocalHashEmbeddings(128);
  const vectorStore = await FaissStore.fromDocuments(docs, embeddings);

  const userQuery = "会员退款有什么规则？";
  const expandedQueries = expandQuery(userQuery);

  // 多路检索：每个扩展 query 对应一个 retriever
  const retrievers = expandedQueries.map((q) => {
    return new FixedQueryVectorRetriever({
      vectorStore,
      fixedQuery: q,
      topK: 3,
    });
  });

  // 使用 LangChain 内置 EnsembleRetriever 进行 RRF 融合
  // c=60 是 RRF 常见默认值
  const ensembleRetriever = new EnsembleRetriever({
    retrievers,
    c: 60,
  });
  const fusedDocs = await ensembleRetriever.invoke(userQuery);
  const fusedTop = fusedDocs.slice(0, 5);

  console.log("\n==============================");
  console.log("🔎 输入扩展 + RRF 融合示例（LangChain内置EnsembleRetriever）");
  console.log("==============================");
  console.log(`用户原始问题：${userQuery}`);
  console.log(`扩展查询：${expandedQueries.join(" | ")}`);

  for (let i = 0; i < expandedQueries.length; i += 1) {
    const q = expandedQueries[i];
    const docsBySubQuery = await vectorStore.similaritySearch(q, 3);
    console.log(`\n子查询${i + 1}: ${q}`);
    docsBySubQuery.forEach((item, rankIdx) => {
      console.log(`- rank${rankIdx + 1}: [${item.metadata.id}] ${item.metadata.title}`);
    });
  }

  console.log("\nRRF 融合 Top5（内置融合器不直接暴露分数，仅返回排序结果）：");
  fusedTop.forEach((item, i) => {
    console.log(
      `- Top${i + 1}: [${item.metadata.id}] ${item.metadata.title} (来自子查询: ${item.metadata.subQuery || "unknown"})`
    );
  });

  console.log("\n✅ 结论：扩展查询可提高召回覆盖，RRF 可稳定融合多路结果。\n");
}

main().catch((error) => {
  console.error("❌ 输入扩展与RRF示例运行失败:", error.message);
});
