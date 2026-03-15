// RAG 优化学习专题 - 第一部分
// 主题：数据源侧优化 - 智能分块（语义段落 + 句子）
//
// 运行方式：
// node demos/rag_smart_chunking/intelligentChunking.js
//
// 说明：
// 1) 先按“段落”切，尽量保持完整语义单元
// 2) 段落过长时，再按“句子”细分
// 3) 最后使用 LangChain 的 RecursiveCharacterTextSplitter 做统一边界控制，
//    确保 chunk 长度稳定，并保留 overlap，便于检索召回上下文

import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

/**
 * 将原始文本做基础清洗：
 * - 统一换行符
 * - 合并多余空格
 * - 保留段落结构（双换行）
 */
function normalizeText(rawText) {
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 按句号、问号、感叹号切句。
 * 同时兼容中文和英文标点。
 */
function splitIntoSentences(paragraph) {
  return paragraph
    .split(/(?<=[。！？.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 将句子按长度进行“语义聚合”
 * 目标：尽量让每个块由完整句子组成，而不是硬截断。
 */
function mergeSentencesBySize(sentences, maxSize) {
  const merged = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length <= maxSize) {
      current = candidate;
      continue;
    }

    if (current) {
      merged.push(current);
    }
    current = sentence;
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * 智能分块主流程（段落优先 -> 句子兜底 -> LangChain 边界约束）
 */
export async function intelligentChunkByParagraphAndSentence({
  text,
  source = "demo-source",
  chunkSize = 300,
  chunkOverlap = 60,
}) {
  const cleaned = normalizeText(text);

  // 第一步：段落级切分（保留最强语义结构）
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const semanticUnits = [];

  // 第二步：段落过长时，按句子进一步拆分并聚合
  for (const paragraph of paragraphs) {
    if (paragraph.length <= chunkSize) {
      semanticUnits.push(paragraph);
      continue;
    }

    const sentences = splitIntoSentences(paragraph);
    const merged = mergeSentencesBySize(sentences, chunkSize);
    semanticUnits.push(...merged);
  }

  // 先把语义单元转成 Document，写入 metadata 便于后续追踪
  const semanticDocs = semanticUnits.map((unit, index) => {
    return new Document({
      pageContent: unit,
      metadata: {
        source,
        semanticUnitIndex: index,
        chunkStrategy: "paragraph-sentence",
      },
    });
  });

  // 第三步：LangChain 递归切分器做最终边界约束（必要时再细分）
  // 分隔符顺序非常关键：从“最有语义”的边界到“最弱”的边界逐级回退
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", " ", ""],
  });

  return splitter.splitDocuments(semanticDocs);
}

async function main() {
  const sampleText = `
RAG（检索增强生成）在企业知识问答中非常常见。最基础的方案通常是固定长度切片，然后把切片向量化存到向量数据库里。

但固定切片会遇到一个问题：段落语义可能被切断。比如一段描述“故障现象”，下一段描述“排查步骤”，如果边界切在中间，召回时可能只拿到半段信息，导致回答不完整。

智能分块的思路是先尊重文本结构。优先保留标题、段落，再处理句子级别边界。这样每个 chunk 更像一个完整知识单元，对检索和重排都更友好。

在真实项目中，你可以继续叠加 metadata，比如文档标题、章节、发布时间、产品线。后续检索时就可以做过滤和加权，提高准确率。
  `;

  const chunks = await intelligentChunkByParagraphAndSentence({
    text: sampleText,
    source: "rag-learning-note",
    chunkSize: 120,
    chunkOverlap: 20,
  });

  console.log("\n📌 智能分块结果预览：");
  console.log(`共生成 ${chunks.length} 个 chunk\n`);

  chunks.forEach((doc, i) => {
    console.log(`--- Chunk ${i + 1} ---`);
    console.log(`长度: ${doc.pageContent.length}`);
    console.log("metadata:", doc.metadata);
    console.log(doc.pageContent);
    console.log("");
  });
}

main().catch((error) => {
  console.error("❌ 智能分块示例运行失败:", error.message);
});
