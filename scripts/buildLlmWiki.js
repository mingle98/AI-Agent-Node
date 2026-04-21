#!/usr/bin/env node
// ========== LLM Wiki 构建脚本 ==========

import path from "path";
import { fileURLToPath } from "url";
import { createEmbeddings, createLLMWikiBuilderLLM } from "../llm.js";
import { loadOrBuildLLMWiki } from "../utils/llmWikiBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🧠 LLM Wiki 构建工具");
  console.log("=".repeat(70) + "\n");

  const projectRoot = path.join(__dirname, "..");
  const knowledgeBasePath = path.join(projectRoot, "knowledge_base");
  const wikiPath = path.join(projectRoot, "llm_wiki");
  const forceRebuild = process.argv.includes("--force");

  try {
    const llm = createLLMWikiBuilderLLM();
    const embeddings = createEmbeddings();

    const result = await loadOrBuildLLMWiki({
      knowledgeBasePath,
      wikiPath,
      llm,
      embeddings,
      forceRebuild,
      maxChunks: 18,
      maxConceptsPerChunk: 4,
    });

    console.log("=".repeat(70));
    console.log("✅ LLM Wiki 准备完成！");
    console.log("=".repeat(70));
    console.log(`\n📄 总页面数: ${result.pageCount}`);
    console.log(`📁 Wiki 目录: ${result.wikiPath}`);
    console.log("\n💡 后续可运行: npm run wiki:review  查看候选池，或直接启动服务体验 llm_wiki 检索\n");
  } catch (error) {
    console.error("\n❌ 构建失败:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);