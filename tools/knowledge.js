// 工具: 知识库检索

import path from "path";
import { CONFIG } from '../config.js';

function formatKnowledgeDocs(docs = []) {
  if (!Array.isArray(docs) || docs.length === 0) {
    return "知识库中未找到相关信息";
  }

  return docs.map((doc, i) => {
    const sourceName = doc?.metadata?.source
      ? path.basename(doc.metadata.source)
      : (doc?.metadata?.title || "未知来源");
    return `[${i + 1}] ${doc.pageContent}\n来源: ${sourceName}`;
  }).join("\n\n");
}

async function searchWithVectorStore(vectorStore, query) {
  if (!vectorStore) {
    throw new Error("RAG 向量库未初始化");
  }
  console.log(`  📚 [knowledge] 使用 RAG 向量检索，topK=${CONFIG.ragTopK}`);
  const docs = await vectorStore.similaritySearch(query, CONFIG.ragTopK);
  return formatKnowledgeDocs(docs);
}

async function searchWithLLMWiki(knowledgeRetriever, query) {
  if (!knowledgeRetriever?.retrieve) {
    throw new Error("LLM Wiki 检索器未初始化");
  }
  const topK = CONFIG.llmWikiTopK || CONFIG.ragTopK;
  console.log(`  🧠 [knowledge] 使用 LLM Wiki 检索，topK=${topK}`);
  const result = await knowledgeRetriever.retrieve(query, topK);
  return formatKnowledgeDocs(result?.docs || []);
}

export async function searchKnowledgeBase(searchBackend, query) {
  console.log(`\n  🔧 [工具调用] 知识库检索(${CONFIG.knowledgeSearchProvider}): "${query}"`);

  if (CONFIG.knowledgeSearchProvider === 'llm_wiki') {
    return searchWithLLMWiki(searchBackend?.knowledgeRetriever, query);
  }

  return searchWithVectorStore(searchBackend?.vectorStore ?? searchBackend, query);
}
