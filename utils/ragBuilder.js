// ========== RAG 知识库构建工具 ==========

import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 检查向量数据库是否存在
 */
export function checkVectorDBExists(vectorDbPath) {
  try {
    // FAISS 会生成 faiss.index 和 docstore.json 文件
    const indexPath = path.join(vectorDbPath, "faiss.index");
    const docstorePath = path.join(vectorDbPath, "docstore.json");
    return fs.existsSync(indexPath) && fs.existsSync(docstorePath);
  } catch (error) {
    return false;
  }
}

/**
 * 构建 RAG 知识库
 * @param {Object} options - 配置选项
 * @param {string} options.knowledgeBasePath - 知识库文档路径
 * @param {string} options.vectorDbPath - 向量数据库保存路径
 * @param {Object} options.embeddings - Embeddings 实例
 * @param {number} options.chunkSize - 文本块大小
 * @param {number} options.chunkOverlap - 文本块重叠大小
 */
export async function buildRAGKnowledgeBase(options) {
  const {
    knowledgeBasePath,
    vectorDbPath,
    embeddings,
    chunkSize = 1000,
    chunkOverlap = 200,
  } = options;

  try {
    console.log("\n🏗️  开始构建 RAG 知识库...\n");

    // 步骤1: 导入文件目录（支持多种文件格式）
    console.log("📁 步骤1/4: 加载文档...");
    
    // 检查知识库目录是否存在
    if (!fs.existsSync(knowledgeBasePath)) {
      throw new Error(`知识库目录不存在: ${knowledgeBasePath}`);
    }

    const loader = new DirectoryLoader(
      knowledgeBasePath,
      {
        ".txt": (filePath) => new TextLoader(filePath),
        ".md": (filePath) => new TextLoader(filePath),
        ".pdf": (filePath) => new PDFLoader(filePath),
        ".epub": (filePath) => new EPubLoader(filePath, {
          splitChapters: true,
        }),
      }
    );
    
    const docs = await loader.load();
    console.log(`   ✅ 加载了 ${docs.length} 个文档\n`);

    if (docs.length === 0) {
      throw new Error(`知识库目录为空: ${knowledgeBasePath}\n   请添加 .txt、.md、.pdf 或 .epub 文件`);
    }

    // 步骤2: 内容切分（滑动窗口策略）
    console.log("✂️  步骤2/4: 切分文档...");
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? "],
    });
    const splitDocs = await textSplitter.splitDocuments(docs);
    console.log(`   ✅ 切分成 ${splitDocs.length} 个文本块\n`);

    // 步骤3: 向量化（Embedding嵌入）
    console.log("🔢 步骤3/4: 向量化文本...");
    console.log(`   📡 使用 text-embedding-v4 模型\n`);

    // 步骤4: 存储到向量数据库
    console.log("💾 步骤4/4: 存储到向量数据库...");
    const vectorStore = await FaissStore.fromDocuments(splitDocs, embeddings);
    
    // 确保目录存在
    if (!fs.existsSync(vectorDbPath)) {
      fs.mkdirSync(vectorDbPath, { recursive: true });
    }
    
    await vectorStore.save(vectorDbPath);
    console.log(`   ✅ 向量数据库已保存到: ${vectorDbPath}\n`);

    console.log("🎉 RAG 知识库构建完成！\n");
    
    return vectorStore;
  } catch (error) {
    console.error("❌ 构建知识库失败:", error.message);
    throw error;
  }
}

/**
 * 加载或构建向量数据库
 * @param {Object} options - 配置选项
 */
export async function loadOrBuildVectorStore(options) {
  const { vectorDbPath, embeddings, knowledgeBasePath, forceRebuild = false } = options;

  try {
    // 检查是否需要重建
    if (forceRebuild) {
      console.log("🔄 强制重建模式：删除现有向量数据库...\n");
      if (fs.existsSync(vectorDbPath)) {
        fs.rmSync(vectorDbPath, { recursive: true, force: true });
      }
    }

    // 检查向量数据库是否存在
    const vectorDBExists = checkVectorDBExists(vectorDbPath);

    if (vectorDBExists) {
      // 存在则直接加载
      console.log("📂 检测到已存在的向量数据库，直接加载...");
      const vectorStore = await FaissStore.load(vectorDbPath, embeddings);
      console.log("✅ 知识库加载成功\n");
      return vectorStore;
    } else {
      // 不存在则构建
      console.log("⚠️  未找到向量数据库，开始自动构建...");
      const vectorStore = await buildRAGKnowledgeBase({
        knowledgeBasePath,
        vectorDbPath,
        embeddings,
      });
      return vectorStore;
    }
  } catch (error) {
    console.error("❌ 加载/构建向量数据库失败:", error.message);
    console.log("💡 提示：部分功能将受限（知识库检索功能不可用）\n");
    return null;
  }
}
