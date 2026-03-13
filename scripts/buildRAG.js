#!/usr/bin/env node
// ========== RAG 知识库构建脚本 ==========

import path from "path";
import { fileURLToPath } from "url";
import { createEmbeddings } from '../llm.js';
import { buildRAGKnowledgeBase, checkVectorDBExists } from '../utils/ragBuilder.js';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🏗️  RAG 知识库构建工具");
  console.log("=".repeat(70) + "\n");

  const projectRoot = path.join(__dirname, "..");
  const vectorDbPath = path.join(projectRoot, "vector_db");
  const knowledgeBasePath = path.join(projectRoot, "knowledge_base");

  // 检查是否强制重建
  const forceRebuild = process.argv.includes("--force");

  try {
    // 检查知识库目录
    if (!fs.existsSync(knowledgeBasePath)) {
      console.error(`❌ 知识库目录不存在: ${knowledgeBasePath}`);
      console.log("\n💡 请先创建 knowledge_base 目录并添加文档文件：");
      console.log("   - 支持格式：.txt、.md、.pdf、.epub");
      console.log("   - 建议至少添加 3-5 个文档\n");
      process.exit(1);
    }

    const files = fs.readdirSync(knowledgeBasePath);
    const docFiles = files.filter(f => 
      f.endsWith('.txt') || f.endsWith('.md') || 
      f.endsWith('.pdf') || f.endsWith('.epub')
    );

    if (docFiles.length === 0) {
      console.error(`❌ 知识库目录为空: ${knowledgeBasePath}`);
      console.log("\n💡 请添加文档文件到 knowledge_base 目录\n");
      process.exit(1);
    }

    console.log(`📚 发现 ${docFiles.length} 个文档文件：`);
    docFiles.forEach((file, i) => {
      console.log(`   ${i + 1}. ${file}`);
    });
    console.log("");

    // 检查现有向量数据库
    const vectorDBExists = checkVectorDBExists(vectorDbPath);

    if (vectorDBExists && !forceRebuild) {
      console.log("⚠️  检测到已存在的向量数据库");
      console.log(`   路径: ${vectorDbPath}`);
      console.log("\n💡 如需重建，请使用: npm run rebuild:rag\n");
      process.exit(0);
    }

    if (forceRebuild && vectorDBExists) {
      console.log("🔄 强制重建模式：删除现有向量数据库...\n");
      fs.rmSync(vectorDbPath, { recursive: true, force: true });
    }

    // 创建 embeddings
    const embeddings = createEmbeddings();

    // 构建知识库
    await buildRAGKnowledgeBase({
      knowledgeBasePath,
      vectorDbPath,
      embeddings,
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    console.log("=".repeat(70));
    console.log("✅ 知识库构建成功！");
    console.log("=".repeat(70));
    console.log("\n💡 现在可以运行以下命令启动 Agent：");
    console.log("   npm run dev\n");

  } catch (error) {
    console.error("\n❌ 构建失败:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
