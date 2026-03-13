import path from "path";
import { fileURLToPath } from "url";
import { createLLM, createEmbeddings, createFallbackLLM } from './llm.js';
import { customerServiceDemo } from './demos/customerService.js';
import { loadOrBuildVectorStore } from './utils/ragBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 主函数 ==========

async function main(mode = "full") {
  console.log("\n🚀 生产级 AI Agent 完整演示");
  console.log("基于原生消息数组 + RAG + 工具调用 + Skill技能 + 上下文管理\n");
  
  try {
    const llm = createLLM();
    const fallbackLlm = createFallbackLLM();
    const embeddings = createEmbeddings();
    const runtimeOptions = {
      fallbackLlm,
      llmTimeoutMs: 25000,
      toolTimeoutMs: 8000,
      llmRetries: 2,
      toolRetries: 2,
    };
    
    // 智能加载或构建知识库
    const vectorDbPath = path.join(__dirname, "vector_db");
    const knowledgeBasePath = path.join(__dirname, "knowledge_base");
    
    const vectorStore = await loadOrBuildVectorStore({
      vectorDbPath,
      knowledgeBasePath,
      embeddings,
      forceRebuild: false,  // 设为 true 可强制重建
    });

    // 仅运行客服demo场景
    console.log("📌 运行模式: 完整客服场景（含 Tool + Skill）\n");
    await customerServiceDemo(llm, vectorStore, embeddings, runtimeOptions);
      
  } catch (error) {
    console.error("\n❌ 错误:", error.message);
  }
}

// 运行主函数
const mode = process.argv[2] || 'customer';
main(mode).catch(console.error);
