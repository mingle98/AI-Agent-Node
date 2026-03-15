// RAG 优化学习专题 - 第二部分
// 主题：数据源侧优化 - 从文档构建问答对（Doc -> QA Pair）
//
// 运行方式：
// node demos/rag_smart_chunking/docQaPairsEnhancement.js

import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { LocalHashEmbeddings, buildDemoDocs } from "./sharedRagDemoUtils.js";

/**
 * 从文档 chunk 生成教学用 QA 样本。
 *
 * 注意：
 * - 生产中建议用高质量 LLM + 人工抽检
 * - 本示例使用规则生成，目的是展示“检索增强思路”
 */
function generateQaPairsFromChunks(chunks) {
  const qaDocs = [];

  for (const chunk of chunks) {
    const title = chunk.metadata.title || "未命名文档";
    const answer = chunk.pageContent;

    const questions = [
      `关于${title}，核心规则是什么？`,
      `${title}有什么注意事项？`,
      `如何理解：${title}？`,
    ];

    for (const q of questions) {
      qaDocs.push(
        new Document({
          pageContent: `问题：${q}\n答案：${answer}`,
          metadata: {
            ...chunk.metadata,
            docType: "synthetic_qa",
            syntheticQuestion: q,
          },
        })
      );
    }
  }

  return qaDocs;
}

/**
 * 打印检索结果，观察检索质量变化。
 */
function printTopDocs(label, docs) {
  console.log(`\n${label}`);
  docs.forEach((doc, i) => {
    console.log(`- Top${i + 1}: [${doc.metadata.title || "无标题"}] (${doc.metadata.docType || "raw_chunk"})`);
    console.log(`  ${doc.pageContent.slice(0, 100)}...`);
  });
}

async function main() {
  // 1) 构造基础语料
  const rawDocs = buildDemoDocs();

  // 2) 文档切分：尽量贴近真实 RAG 流程
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 120,
    chunkOverlap: 20,
    separators: ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", " ", ""],
  });
  const chunks = await splitter.splitDocuments(rawDocs);

  // 3) 基于 chunk 构建问答对样本（数据增强）
  const qaDocs = generateQaPairsFromChunks(chunks);

  // 4) 建立两个索引：
  //    A. 仅原文 chunk
  //    B. 原文 chunk + QA 样本
  const embeddings = new LocalHashEmbeddings(128);
  const baseStore = await FaissStore.fromDocuments(chunks, embeddings);
  const enhancedStore = await FaissStore.fromDocuments([...chunks, ...qaDocs], embeddings);

  // 5) 对比同一查询在两个索引中的召回差异
  const query = "退货一般多久到账？有哪些限制？";
  const baseResults = await baseStore.similaritySearch(query, 3);
  const enhancedResults = await enhancedStore.similaritySearch(query, 3);

  console.log("\n==============================");
  console.log("📚 文档问答对增强检索对比");
  console.log("==============================");
  console.log(`查询：${query}`);
  console.log(`原始 chunk 数：${chunks.length}`);
  console.log(`新增 QA 样本数：${qaDocs.length}`);

  printTopDocs("\nA) 仅原文索引 Top3", baseResults);
  printTopDocs("\nB) 原文 + QA 增强索引 Top3", enhancedResults);

  console.log("\n✅ 结论：当用户问题更接近问句表达时，QA 样本通常能提升召回相关性。\n");
}

main().catch((error) => {
  console.error("❌ 文档问答对增强示例运行失败:", error.message);
});
