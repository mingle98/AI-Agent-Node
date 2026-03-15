// RAG 优化学习专题 - 第七部分
// 主题：数据源侧优化 - 元数据（Metadata）
//
// 运行方式：
// node demos/rag_smart_chunking/metadataRag.js

import { Document } from "@langchain/core/documents";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { LocalHashEmbeddings } from "./sharedRagDemoUtils.js";

/**
 * 构造带 metadata 的教学文档。
 *
 * metadata 字段示例：
 * - topic: 主题（退款/物流/会员）
 * - audience: 适用人群（all/vip/new_user）
 * - channel: 发布渠道（official/forum）
 * - updatedAt: 更新时间（用于新旧版本过滤）
 */
function buildDocsWithMetadata() {
  return [
    new Document({
      pageContent: "退款政策V1：支持7天无理由退货，退款一般3个工作日到账。",
      metadata: {
        id: "refund-v1",
        title: "退款政策V1",
        topic: "refund",
        audience: "all",
        channel: "official",
        updatedAt: "2024-01-15",
      },
    }),
    new Document({
      pageContent: "退款政策V2：支持7天无理由退货，退款一般1到2个工作日到账，VIP优先处理。",
      metadata: {
        id: "refund-v2",
        title: "退款政策V2",
        topic: "refund",
        audience: "all",
        channel: "official",
        updatedAt: "2025-06-30",
      },
    }),
    new Document({
      pageContent: "社区帖子：有用户反馈退款审核可能需要5天，仅供参考，以官方政策为准。",
      metadata: {
        id: "refund-forum",
        title: "退款经验贴",
        topic: "refund",
        audience: "all",
        channel: "forum",
        updatedAt: "2023-10-10",
      },
    }),
    new Document({
      pageContent: "物流说明：普通快递3到5天，特快次日达，大促会有延迟。",
      metadata: {
        id: "shipping-v1",
        title: "物流说明",
        topic: "shipping",
        audience: "all",
        channel: "official",
        updatedAt: "2025-02-20",
      },
    }),
    new Document({
      pageContent: "VIP权益：95折、快速退款、专属客服通道。",
      metadata: {
        id: "vip-benefits",
        title: "VIP权益",
        topic: "vip",
        audience: "vip",
        channel: "official",
        updatedAt: "2025-05-01",
      },
    }),
  ];
}

/**
 * 元数据过滤：
 * - topic 精确匹配
 * - channel 白名单
 * - updatedAfter 按日期过滤（只看新文档）
 */
function filterByMetadata(docs, { topic, channels, updatedAfter }) {
  return docs.filter((doc) => {
    const byTopic = topic ? doc.metadata.topic === topic : true;
    const byChannel = channels?.length ? channels.includes(doc.metadata.channel) : true;
    const byTime = updatedAfter
      ? new Date(doc.metadata.updatedAt) >= new Date(updatedAfter)
      : true;

    return byTopic && byChannel && byTime;
  });
}

function printDocs(label, docs) {
  console.log(`\n${label}`);
  docs.forEach((doc, i) => {
    console.log(
      `- Top${i + 1}: [${doc.metadata.id}] ${doc.metadata.title} | topic=${doc.metadata.topic} | channel=${doc.metadata.channel} | updatedAt=${doc.metadata.updatedAt}`
    );
    console.log(`  ${doc.pageContent}`);
  });
}

async function searchTopK(query, docs, k = 3) {
  const embeddings = new LocalHashEmbeddings(128);
  const store = await FaissStore.fromDocuments(docs, embeddings);
  return store.similaritySearch(query, k);
}

async function main() {
  const allDocs = buildDocsWithMetadata();
  const query = "退款多久到账，哪个规则最新最准确？";

  // A) 不做元数据过滤
  const noFilterTop = await searchTopK(query, allDocs, 3);

  // B) 做元数据过滤：
  // 只看官方渠道 + 2025年后的文档 + 退款主题
  const filteredDocs = filterByMetadata(allDocs, {
    topic: "refund",
    channels: ["official"],
    updatedAfter: "2025-01-01",
  });
  const withFilterTop = await searchTopK(query, filteredDocs, 3);

  console.log("\n==============================");
  console.log("🏷️ 元数据过滤 RAG 示例");
  console.log("==============================");
  console.log(`查询：${query}`);
  console.log(`总文档数：${allDocs.length}`);
  console.log(`过滤后文档数：${filteredDocs.length}`);

  printDocs("A) 不过滤直接检索 Top3", noFilterTop);
  printDocs("B) 元数据过滤后检索 Top3", withFilterTop);

  console.log("\n✅ 结论：元数据过滤可减少噪声文档，让检索更稳定命中“最新且可信”的来源。\n");
}

main().catch((error) => {
  console.error("❌ 元数据RAG示例运行失败:", error.message);
});
