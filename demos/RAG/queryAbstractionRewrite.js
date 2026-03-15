// RAG 优化学习专题 - 第五部分
// 主题：输入侧优化 - 用户问题抽象改写（具体问题 -> 抽象查询）
//
// 运行方式：
// node demos/rag_smart_chunking/queryAbstractionRewrite.js

import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { LocalHashEmbeddings, buildDemoDocs } from "./sharedRagDemoUtils.js";

/**
 * 教学版“问题抽象改写”。
 *
 * 场景：用户问得非常具体，导致检索只命中局部词，
 *       将问题抽象后更容易命中规则文档。
 */
function abstractQuery(query) {
  const rules = [
    {
      pattern: /(ORD\d+|订单\s*\d+)/gi,
      replace: "订单",
    },
    {
      pattern: /(昨天|今天|明天|这周|下周|本月|下月)/g,
      replace: "时间",
    },
    {
      pattern: /(能不能|可不可以|怎么|如何)/g,
      replace: "规则",
    },
  ];

  let rewritten = query;
  rules.forEach((r) => {
    rewritten = rewritten.replace(r.pattern, r.replace);
  });

  // 如果包含“退”相关，补全更抽象表达
  if (rewritten.includes("退")) {
    rewritten = `${rewritten} 退款规则 退货条件`;
  }

  return rewritten.replace(/\s+/g, " ").trim();
}

function printResults(label, docs) {
  console.log(`\n${label}`);
  docs.forEach((doc, i) => {
    console.log(`- Top${i + 1}: [${doc.metadata.id}] ${doc.metadata.title}`);
    console.log(`  ${doc.pageContent.slice(0, 90)}...`);
  });
}

async function main() {
  const docs = buildDemoDocs();
  const embeddings = new LocalHashEmbeddings(128);
  const vectorStore = await FaissStore.fromDocuments(docs, embeddings);

  const specificQuery = "我昨天买的ORD003手机壳不太喜欢，能不能退，多久到账？";
  const abstractedQuery = abstractQuery(specificQuery);

  const resultSpecific = await vectorStore.similaritySearch(specificQuery, 3);
  const resultAbstract = await vectorStore.similaritySearch(abstractedQuery, 3);

  console.log("\n==============================");
  console.log("🧠 问题抽象改写示例");
  console.log("==============================");
  console.log(`原始问题：${specificQuery}`);
  console.log(`抽象改写：${abstractedQuery}`);

  printResults("A) 直接检索（原始问题）", resultSpecific);
  printResults("B) 抽象后检索", resultAbstract);

  console.log("\n✅ 结论：对过于具体的问题做抽象改写，通常更容易命中规则型文档。\n");
}

main().catch((error) => {
  console.error("❌ 问题抽象改写示例运行失败:", error.message);
});
