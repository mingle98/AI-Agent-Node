// ========== RAG 知识库构建工具 ==========

import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VECTOR_DB_FILENAME = "vector-store.json";

function ensureVectorDbDir(vectorDbPath) {
  if (!fs.existsSync(vectorDbPath)) {
    fs.mkdirSync(vectorDbPath, { recursive: true });
  }
}

function getVectorDbFilePath(vectorDbPath) {
  return path.join(vectorDbPath, VECTOR_DB_FILENAME);
}

function cosineSimilarity(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return -1;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const valueA = Number(a[i]) || 0;
    const valueB = Number(b[i]) || 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) {
    return -1;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class LocalVectorStore {
  constructor(embeddings, items = []) {
    this.embeddings = embeddings;
    this.items = items;
  }

  static async fromDocuments(documents, embeddings) {
    const texts = documents.map((doc) => doc.pageContent || "");
    const vectors = await embeddings.embedDocuments(texts);
    const items = documents.map((doc, index) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata || {},
      embedding: vectors[index],
    }));
    return new LocalVectorStore(embeddings, items);
  }

  static async load(vectorDbPath, embeddings) {
    const filePath = getVectorDbFilePath(vectorDbPath);
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return new LocalVectorStore(embeddings, Array.isArray(parsed.items) ? parsed.items : []);
  }

  async addDocuments(documents) {
    const texts = documents.map((doc) => doc.pageContent || "");
    const vectors = await this.embeddings.embedDocuments(texts);
    const newItems = documents.map((doc, index) => ({
      pageContent: doc.pageContent,
      metadata: doc.metadata || {},
      embedding: vectors[index],
    }));
    this.items.push(...newItems);
    return newItems;
  }

  async save(vectorDbPath) {
    ensureVectorDbDir(vectorDbPath);
    const filePath = getVectorDbFilePath(vectorDbPath);
    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      count: this.items.length,
      items: this.items,
    };
    await fs.promises.writeFile(filePath, JSON.stringify(payload), "utf-8");
  }

  async similaritySearch(query, topK = 4) {
    if (!query || this.items.length === 0) {
      return [];
    }

    const queryEmbedding = await this.embeddings.embedQuery(query);
    return this.items
      .map((item) => ({
        score: cosineSimilarity(queryEmbedding, item.embedding),
        doc: {
          pageContent: item.pageContent,
          metadata: item.metadata || {},
        },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((entry) => entry.doc);
  }

  asRetriever(options = {}) {
    const k = typeof options === "number" ? options : (options.k || 4);
    return {
      getRelevantDocuments: (query) => this.similaritySearch(query, k),
      invoke: (query) => this.similaritySearch(query, k),
    };
  }
}

/**
 * 检查向量数据库是否存在
 */
export function checkVectorDBExists(vectorDbPath) {
  try {
    return fs.existsSync(getVectorDbFilePath(vectorDbPath));
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
    console.log("   📡 使用 text-embedding-v4 模型\n");

    // 步骤4: 存储到本地向量数据库
    console.log("💾 步骤4/4: 存储到本地向量数据库...");
    const vectorStore = await LocalVectorStore.fromDocuments(splitDocs, embeddings);
    await vectorStore.save(vectorDbPath);
    console.log(`   ✅ 向量数据库已保存到: ${getVectorDbFilePath(vectorDbPath)}\n`);

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
    if (forceRebuild) {
      console.log("🔄 强制重建模式：删除现有向量数据库...\n");
      if (fs.existsSync(vectorDbPath)) {
        fs.rmSync(vectorDbPath, { recursive: true, force: true });
      }
    }

    const vectorDBExists = checkVectorDBExists(vectorDbPath);

    if (vectorDBExists) {
      console.log("📂 检测到已存在的向量数据库，直接加载...");
      const vectorStore = await LocalVectorStore.load(vectorDbPath, embeddings);
      console.log("✅ 知识库加载成功\n");
      return vectorStore;
    }

    console.log("⚠️  未找到向量数据库，开始自动构建...");
    return await buildRAGKnowledgeBase({
      knowledgeBasePath,
      vectorDbPath,
      embeddings,
    });
  } catch (error) {
    console.error("❌ 加载/构建向量数据库失败:", error.message);
    console.log("💡 提示：部分功能将受限（知识库检索功能不可用）\n");
    return null;
  }
}
