// 工具: 知识库检索

import path from "path";
import { CONFIG } from '../config.js';

export async function searchKnowledgeBase(vectorStore, query) {
  console.log(`\n  🔧 [工具调用] 知识库检索: "${query}"`);
  const docs = await vectorStore.similaritySearch(query, CONFIG.ragTopK);
  if (docs.length === 0) {
    return "知识库中未找到相关信息";
  }
  return docs.map((doc, i) => 
    `[${i + 1}] ${doc.pageContent.substring(0, 150)}...\n来源: ${path.basename(doc.metadata.source)}`
  ).join("\n\n");
}
