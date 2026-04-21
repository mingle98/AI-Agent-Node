// ========== RAG 知识库构建工具 ==========

import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { JSONLoader } from "@langchain/classic/document_loaders/fs/json";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from "path";
import fs from "fs";

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
  // 保留兼容性：如果输入不是数组或长度不匹配，返回 -1
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return -1;
  }

  // 假设向量已被归一化（调用者会归一化），直接返回点积作为 cosine
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += (Number(a[i]) || 0) * (Number(b[i]) || 0);
  }
  return dot;
}

function normalizeVector(v = []) {
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) {
    const val = Number(v[i]) || 0;
    norm += val * val;
  }
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => (Number(x) || 0) / norm);
}

function tokenizeText(text = "", options = {}) {
  const {
    unique = true,
    includeChineseUnigrams = true,
    includeChineseBigrams = true,
    includeChineseFragments = true,
  } = options;

  const s = String(text || "").toLowerCase();
  const parts = s.split(/[^a-z0-9\u4e00-\u9fff]+/).filter((w) => w && w.length > 0);
  const tokens = [];

  parts.forEach((p) => {
    if (/[\u4e00-\u9fff]/.test(p)) {
      if (includeChineseUnigrams) {
        for (const ch of p) {
          tokens.push(ch);
        }
      }
      if (includeChineseBigrams && p.length >= 2) {
        for (let i = 0; i < p.length - 1; i += 1) {
          tokens.push(p.slice(i, i + 2));
        }
      }
      if (includeChineseFragments) {
        tokens.push(p);
      }
    } else if (p.length > 1) {
      tokens.push(p);
    }
  });

  return unique ? Array.from(new Set(tokens)) : tokens;
}

function buildTokenStats(text = "") {
  const lexicalTokens = tokenizeText(text, { unique: false });
  const tokenFreq = {};
  lexicalTokens.forEach((token) => {
    tokenFreq[token] = (tokenFreq[token] || 0) + 1;
  });

  return {
    tokens: Array.from(new Set(lexicalTokens)),
    tokenFreq,
    length: lexicalTokens.length,
  };
}

function extractMetadataText(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return "";

  const values = [];
  Object.values(metadata).forEach((value) => {
    if (typeof value === "string") {
      values.push(value);
    }
  });

  return values.join(" ");
}

function bm25Score(queryTokens = [], item, lexicalIndex) {
  if (!Array.isArray(queryTokens) || queryTokens.length === 0 || !item) return 0;

  const k1 = 1.5;
  const b = 0.75;
  const idf = (lexicalIndex && lexicalIndex.idf) || {};
  const avgLen = (lexicalIndex && lexicalIndex.avgLen) || 1;
  const N = (lexicalIndex && lexicalIndex.N) || 1;
  const docLen = item.length || (item.tokens || []).length || 1;

  let score = 0;
  for (const token of queryTokens) {
    const termIdf = idf[token] || Math.log((N + 1) / 1);
    const tf = (item.tokenFreq && item.tokenFreq[token]) ? item.tokenFreq[token] : 0;
    if (!tf) continue;
    const denom = tf + k1 * (1 - b + b * (docLen / avgLen));
    score += termIdf * ((tf * (k1 + 1)) / (denom || 1));
  }

  return score;
}

function overlapScore(queryTokens = [], itemTokens = []) {
  if (!queryTokens.length || !itemTokens.length) return 0;
  const itemTokenSet = itemTokens instanceof Set ? itemTokens : new Set(itemTokens);
  let hitCount = 0;
  for (const token of queryTokens) {
    if (itemTokenSet.has(token)) hitCount += 1;
  }
  return hitCount / queryTokens.length;
}

function jaccardSimilarity(setA, setB) {
  if (!setA || !setB) return 0;
  const a = new Set(setA);
  const b = new Set(setB);
  let inter = 0;
  for (const v of a) if (b.has(v)) inter += 1;
  const union = new Set([...a, ...b]).size || 1;
  return inter / union;
}

function buildItemRecord(doc = {}, embedding = []) {
  const pageContent = doc.pageContent || "";
  const metadata = doc.metadata || {};
  const metadataText = extractMetadataText(metadata);
  const tokenStats = buildTokenStats(pageContent);
  const metadataTokenStats = buildTokenStats(metadataText);

  return {
    pageContent,
    metadata,
    embedding: normalizeVector(Array.isArray(embedding) ? embedding : []),
    tokens: tokenStats.tokens,
    tokenFreq: tokenStats.tokenFreq,
    length: tokenStats.length,
    metadataTokens: metadataTokenStats.tokens,
    metadataTokenFreq: metadataTokenStats.tokenFreq,
    metadataLength: metadataTokenStats.length,
  };
}

export class LocalVectorStore {
  constructor(embeddings, items = []) {
    this.embeddings = embeddings;
    this.items = items;
  }

  static async fromDocuments(documents, embeddings) {
    const texts = documents.map((doc) => doc.pageContent || "");
    const vectors = await embeddings.embedDocuments(texts);
    const items = documents.map((doc, index) => buildItemRecord(doc, vectors[index]));
    const store = new LocalVectorStore(embeddings, items);
    // 默认启用动态权重 'auto'（可被调用者覆盖为数值或自定义函数）
    store.alpha = 'auto';
    store._buildLexicalIndex();
    return store;
  }

  static async load(vectorDbPath, embeddings) {
    const filePath = getVectorDbFilePath(vectorDbPath);
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((item) => buildItemRecord(item, item.embedding))
      : [];
    const store = new LocalVectorStore(embeddings, items);
    // 默认启用动态权重 'auto'（可被调用者覆盖为数值或自定义函数）
    store.alpha = 'auto';
    store._buildLexicalIndex();
    return store;
  }

  async addDocuments(documents) {
    const texts = documents.map((doc) => doc.pageContent || "");
    const vectors = await this.embeddings.embedDocuments(texts);
    const newItems = documents.map((doc, index) => buildItemRecord(doc, vectors[index]));
    this.items.push(...newItems);
    this._buildLexicalIndex();
    return newItems;
  }

  setEmbeddings(embeddings) {
    this.embeddings = embeddings;
  }

  _buildLexicalIndex() {
    const df = {};
    let totalLen = 0;

    this.items.forEach((item) => {
      totalLen += (item.length || 0);
      item.tokenSet = new Set(item.tokens || []);
      const seen = item.tokenSet;
      seen.forEach((token) => {
        df[token] = (df[token] || 0) + 1;
      });
    });

    const N = this.items.length || 1;
    const idf = {};
    Object.keys(df).forEach((token) => {
      idf[token] = Math.log((N - df[token] + 0.5) / (df[token] + 0.5) + 1);
    });

    this.lexicalIndex = {
      idf,
      avgLen: this.items.length ? totalLen / this.items.length : 1,
      N,
    };
  }

  async save(vectorDbPath) {
    ensureVectorDbDir(vectorDbPath);
    const filePath = getVectorDbFilePath(vectorDbPath);
    const payload = {
      version: 2,
      createdAt: new Date().toISOString(),
      count: this.items.length,
      items: this.items,
    };
    await fs.promises.writeFile(filePath, JSON.stringify(payload), "utf-8");
  }

  async similaritySearch(query, topK = 4, options = {}) {
    if (!query || this.items.length === 0) return [];

    const candidateMultiplier = Number(options.candidateMultiplier || 8) || 8;
    const candidateCount = Math.min(
      this.items.length,
      Math.max(topK * candidateMultiplier, Number(options.candidateCount || options.topN || topK * 8) || topK * 8)
    );
    const lexicalCandidateCount = Math.min(
      this.items.length,
      Math.max(topK * 4, Number(options.lexicalCandidateCount || Math.ceil(candidateCount * 0.7)) || Math.ceil(candidateCount * 0.7))
    );
    const vectorCandidateCount = Math.min(
      this.items.length,
      Math.max(topK * 4, Number(options.vectorCandidateCount || Math.ceil(candidateCount * 0.7)) || Math.ceil(candidateCount * 0.7))
    );

    let queryEmbedding = null;
    if (this.embeddings && typeof this.embeddings.embedQuery === "function") {
      const queryEmbeddingRaw = await this.embeddings.embedQuery(query);
      queryEmbedding = normalizeVector(Array.isArray(queryEmbeddingRaw) ? queryEmbeddingRaw : []);
    }

    const queryTokens = tokenizeText(query);
    const metadataTokens = tokenizeText(query, { includeChineseFragments: false });

    let alpha;
    if (typeof this.alpha === "number") alpha = Math.max(0, Math.min(1, this.alpha));
    else if (typeof this.alpha === "function") {
      try {
        alpha = Number(this.alpha(queryTokens));
        if (!Number.isFinite(alpha)) alpha = 0.35;
        alpha = Math.max(0, Math.min(1, alpha));
      } catch (error) {
        alpha = 0.35;
      }
    } else if (this.alpha === "auto") {
      const qlen = queryTokens.length || 0;
      if (qlen <= 2) alpha = 0.2;
      else if (qlen <= 6) alpha = 0.35;
      else alpha = 0.5;
    } else {
      alpha = 0.35;
    }

    const scored = this.items.map((item, index) => {
      const lexicalScoreRaw = bm25Score(queryTokens, item, this.lexicalIndex);
      const metadataItem = {
        tokenFreq: item.metadataTokenFreq || {},
        length: item.metadataLength || 0,
      };
      const metadataScoreRaw = bm25Score(metadataTokens, metadataItem, this.lexicalIndex);
      const overlap = overlapScore(queryTokens, item.tokenSet || item.tokens || []);

      let embScore = 0;
      if (queryEmbedding && Array.isArray(item.embedding) && item.embedding.length === queryEmbedding.length) {
        const dot = cosineSimilarity(queryEmbedding, item.embedding);
        embScore = Math.max(0, Math.min(1, (dot + 1) / 2));
      }

      return {
        index,
        item,
        lexicalScoreRaw,
        metadataScoreRaw,
        overlap,
        embScore,
      };
    });

    let maxLex = 0;
    let maxMeta = 0;
    scored.forEach((entry) => {
      if (entry.lexicalScoreRaw > maxLex) maxLex = entry.lexicalScoreRaw;
      if (entry.metadataScoreRaw > maxMeta) maxMeta = entry.metadataScoreRaw;
    });
    if (maxLex === 0) maxLex = 1;
    if (maxMeta === 0) maxMeta = 1;

    const lexicalCandidates = scored
      .slice()
      .sort((a, b) => b.lexicalScoreRaw - a.lexicalScoreRaw)
      .slice(0, lexicalCandidateCount);

    const vectorCandidates = queryEmbedding
      ? scored
          .slice()
          .sort((a, b) => b.embScore - a.embScore)
          .slice(0, vectorCandidateCount)
      : [];

    const candidateMap = new Map();
    lexicalCandidates.forEach((entry) => {
      candidateMap.set(entry.index, { ...entry, recallSources: ["lexical"] });
    });
    vectorCandidates.forEach((entry) => {
      if (candidateMap.has(entry.index)) {
        candidateMap.get(entry.index).recallSources.push("vector");
      } else {
        candidateMap.set(entry.index, { ...entry, recallSources: ["vector"] });
      }
    });

    const candidates = Array.from(candidateMap.values())
      .map((entry) => {
        const lexicalScore = entry.lexicalScoreRaw / maxLex;
        const metadataScore = entry.metadataScoreRaw / maxMeta;
        const lexicalBlend = Math.max(
          lexicalScore,
          lexicalScore * 0.75 + entry.overlap * 0.25,
          lexicalScore * 0.7 + metadataScore * 0.2 + entry.overlap * 0.1
        );
        const finalScore = lexicalBlend * (1 - alpha) + entry.embScore * alpha;

        return {
          score: finalScore,
          lexicalScore,
          metadataScore,
          overlap: entry.overlap,
          embScore: entry.embScore,
          recallSources: entry.recallSources,
          doc: {
            pageContent: entry.item.pageContent,
            metadata: {
              ...(entry.item.metadata || {}),
              _score: Number(finalScore.toFixed(6)),
              _debug: {
                lexicalScore: Number(lexicalScore.toFixed(6)),
                metadataScore: Number(metadataScore.toFixed(6)),
                overlap: Number(entry.overlap.toFixed(6)),
                embScore: Number(entry.embScore.toFixed(6)),
                recallSources: entry.recallSources,
              },
            },
          },
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, candidateCount);

    return candidates.slice(0, topK).map((entry) => entry.doc);
  }

  asRetriever(options = {}) {
    const k = typeof options === "number" ? options : (options.k || 4);
    const searchOptions = typeof options === "number" ? {} : options;
    return {
      getRelevantDocuments: (query) => this.similaritySearch(query, k, searchOptions),
      invoke: (query) => this.similaritySearch(query, k, searchOptions),
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
    chunkSize = 600,
    chunkOverlap = 100,
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
        ".json": (filePath) => new JSONLoader(filePath),
        ".pdf": (filePath) => new PDFLoader(filePath),
        ".epub": (filePath) => new EPubLoader(filePath, {
          splitChapters: true,
        }),
        ".docx": (filePath) => new DocxLoader(filePath),
      }
    );

    const docs = await loader.load();
    console.log(`   ✅ 加载了 ${docs.length} 个文档\n`);

    if (docs.length === 0) {
      throw new Error(`知识库目录为空: ${knowledgeBasePath}\n   请添加 .txt、.md、.json、.pdf、.epub 或 .docx 文件`);
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

    // 后处理：合并过小片段并去重近似片段（基于 token Jaccard）
    const dedupThreshold = options.dedupThreshold || 0.75; // Jaccard 阈值
    const minChunkTokens = options.minChunkTokens || 5; // 过小片段合并阈值

    const processed = [];
    for (const chunk of splitDocs) {
      const text = String(chunk.pageContent || "");
      const tokens = tokenizeText(text);
      // 如果太短，合并到上一个
      if (tokens.length < minChunkTokens && processed.length > 0) {
        const last = processed[processed.length - 1];
        last.pageContent += "\n" + text;
        // 重新计算 tokens
        last.tokens = tokenizeText(last.pageContent);
        continue;
      }

      // 检查与已处理片段的相似度，若超过阈值则合并到相似的那条
      let merged = false;
      for (const existing of processed) {
        const sim = jaccardSimilarity(tokens, existing.tokens || tokenizeText(existing.pageContent || ""));
        if (sim >= dedupThreshold) {
          existing.pageContent += "\n" + text;
          existing.tokens = tokenizeText(existing.pageContent);
          merged = true;
          break;
        }
      }
      if (!merged) {
        processed.push({ pageContent: text, metadata: chunk.metadata || {}, tokens });
      }
    }

    console.log(`   ✅ 处理后剩余 ${processed.length} 个文本块（去重/合并）\n`);

    // 步骤3: 向量化（Embedding嵌入）
    console.log("🔢 步骤3/4: 向量化文本...");
    console.log("   📡 使用 text-embedding-v4 模型\n");

    // 步骤4: 存储到本地向量数据库
    console.log("💾 步骤4/4: 存储到本地向量数据库...");
    const vectorStore = await LocalVectorStore.fromDocuments(processed, embeddings);
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
