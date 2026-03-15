import crypto from "node:crypto";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// 这个文件处理“文本基础能力”：
// - stableId(): 生成稳定的短 id（用于 Document/Chunk 的唯一标识）
// - chunkText(): 文本分块（RAG 的第一步）

export function stableId(input) {
  // 用 sha256 的前 24 位作为短 id。
  // 好处：同一个输入永远得到相同 id，方便重复运行 ingest 时 MERGE 去重。
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

export async function chunkText(text, { chunkSize = 1200, chunkOverlap = 150 } = {}) {
  // RecursiveCharacterTextSplitter 是一种“通用切分器”。
  // 它会尽量按段落/句子边界切分（内部有分隔符优先级），效果通常比纯定长切更好。
  //
  // chunkSize/overlap 是经验值：
  // - chunkSize 太小：上下文不够，抽三元组/回答容易断裂
  // - chunkSize 太大：模型抽取成本高，噪声多
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });
  const docs = await splitter.createDocuments([text]);
  return docs.map((d) => d.pageContent);
}
