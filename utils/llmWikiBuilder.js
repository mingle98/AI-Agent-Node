// ========== LLM Wiki 构建与检索工具 ==========

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { createRichTextFile } from "./markdownRenderer.js";

/**
 * 模块定位（能力层，不含最终问答编排）：
 * 1) 构建：原文 -> 概念页 -> 向量索引
 * 2) 检索：问题 -> 召回页面（提供 context/references）
 * 3) 学习写入：把问答结果按策略沉淀到候选池或正式 wiki
 *
 * 典型调用链：
 * - 离线初始化：buildLLMWiki() / loadOrBuildLLMWiki()
 * - 在线问答：业务层先调用 retrieveFromLLMWiki() 召回，再调用自己的 LLM 问答
 * - 学习沉淀：业务层在拿到 answer 后调用 processLLMWikiLearning()
 *
 * 对外导出的核心 API：
 * - checkLLMWikiExists
 * - buildLLMWiki
 * - loadOrBuildLLMWiki
 * - retrieveFromLLMWiki
 * - listLearningCandidates
 * - promoteLearningCandidates
 * - processLLMWikiLearning
 */
const WIKI_INDEX_FILE = "wiki-index.json";
const WIKI_VECTOR_DIR = "vector_db";
const LEARNED_SECTION_TITLE = "## Learned Notes";
const LEARNING_STATE_FILE = "learning-state.json";
const LEARNING_CANDIDATES_FILE = "learning-candidates.jsonl";
const LEARNING_REVIEWED_FILE = "learning-reviewed.jsonl";

/**
 * 学习治理默认配置（生产偏保守）：
 * - writeEnabled=false + mode=candidate: 不写正式库，只进候选池
 * - skipIfUncertain: 回答不确定时禁止沉淀，降低脏数据侵入
 * - dedupeThreshold: 页面级与向量级去重阈值
 */
const DEFAULT_LEARNING_CONFIG = {
  writeEnabled: false,
  mode: "candidate", // "candidate" = 先进候选池；"direct" = 直接写正式 wiki
  maxLearnedNotesPerPage: 20,
  maxStateEvents: 2000,
  maxCandidates: 3000,
  minSecondsBetweenWrites: 3,
  maxWritesPerDay: 400,
  minAnswerLength: 40,
  skipIfUncertain: true,
  uncertaintyPatterns: [
    "无法判断",
    "信息不足",
    "未提及",
    "没有检索到",
    "无法根据",
    "不确定",
    "cannot determine",
    "insufficient information",
  ],
  dedupeThreshold: {
    titleSimilarity: 0.92, // 页面级聚合阈值（越高越保守）
    contentSimilarity: 0.90, // 向量文本近重复阈值（越高越严格）
  },
  extractor: {
    useHeuristicFirst: true, // 先用启发式抽取，减少模型调用
    enableLLMExtractor: true, // 需要更高质量时再用 LLM 抽取
  },
  cache: {
    enabled: true,
    maxEntries: 200,
    ttlMs: 3 * 60 * 1000,
  },
};

function hashText(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTextLoose(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeTextLoose(text).split(" ").filter((x) => x.length > 1);
}

function jaccardSimilarity(textA, textB) {
  const a = new Set(tokenize(textA));
  const b = new Set(tokenize(textB));
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function mergeConfigs(base, overrides) {
  if (!overrides || typeof overrides !== "object") return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = mergeConfigs(base[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function resolveLearningConfig(learningConfig = {}) {
  const merged = mergeConfigs(DEFAULT_LEARNING_CONFIG, learningConfig);

  if (merged.mode !== "candidate" && merged.mode !== "direct") {
    merged.mode = "candidate";
  }
  return merged;
}

// 检查 wiki 核心产物是否存在（索引 + FAISS index + docstore）。
function checkRequiredFiles(wikiPath) {
  const indexPath = path.join(wikiPath, WIKI_INDEX_FILE);
  const faissPath = path.join(wikiPath, WIKI_VECTOR_DIR, "faiss.index");
  const docstorePath = path.join(wikiPath, WIKI_VECTOR_DIR, "docstore.json");
  return fs.existsSync(indexPath) && fs.existsSync(faissPath) && fs.existsSync(docstorePath);
}

function normalizeLLMText(response) {
  if (!response || response.content == null) return "";
  if (typeof response.content === "string") return response.content;
  if (Array.isArray(response.content)) {
    return response.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("\n");
  }
  return String(response.content);
}

function safeJsonParse(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? rawText).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeTitle(title) {
  return String(title ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[：:]+$/, "");
}

function normalizeForLookup(text) {
  return normalizeTitle(text).toLowerCase();
}

function sanitizeFilename(text) {
  const cleaned = normalizeTitle(text).replace(/[\\/:*?"<>|`$&{}[\]#%^+]/g, "").replace(/\s+/g, "-");
  return cleaned.slice(0, 80) || "untitled";
}

function pickRepresentativeChunks(splitDocs, maxChunks) {
  if (splitDocs.length <= maxChunks) return splitDocs;
  const selected = [];
  const step = splitDocs.length / maxChunks;
  for (let i = 0; i < maxChunks; i += 1) {
    const candidate = splitDocs[Math.floor(i * step)];
    const candidateText = String(candidate?.pageContent ?? "").slice(0, 600);
    const isTooSimilar = selected.some((prev) => {
      const prevText = String(prev?.pageContent ?? "").slice(0, 600);
      return jaccardSimilarity(candidateText, prevText) >= 0.88;
    });
    if (!isTooSimilar) {
      selected.push(candidate);
    }
  }

  // 如过滤后数量过少，补齐到 maxChunks，保证覆盖率
  if (selected.length < maxChunks) {
    for (const doc of splitDocs) {
      if (selected.includes(doc)) continue;
      selected.push(doc);
      if (selected.length >= maxChunks) break;
    }
  }

  return selected.slice(0, maxChunks);
}

async function loadKnowledgeDocuments(knowledgeBasePath) {
  if (!fs.existsSync(knowledgeBasePath)) {
    throw new Error(`知识库目录不存在: ${knowledgeBasePath}`);
  }

  const loader = new DirectoryLoader(knowledgeBasePath, {
    ".txt": (filePath) => new TextLoader(filePath),
    ".md": (filePath) => new TextLoader(filePath),
    ".pdf": (filePath) => new PDFLoader(filePath),
    ".epub": (filePath) => new EPubLoader(filePath, { splitChapters: true }),
  });

  const docs = await loader.load();
  if (!docs.length) {
    throw new Error(`知识库目录为空: ${knowledgeBasePath}\n请添加 .txt/.md/.pdf/.epub 文件`);
  }

  return docs;
}

async function extractConceptsFromChunk({ llm, doc, maxConceptsPerChunk }) {
  const source = doc.metadata?.source ?? "unknown";
  const content = String(doc.pageContent ?? "").slice(0, 3500);

  const response = await llm.invoke([
    {
      role: "system",
      content:
        "你是知识架构助手。请把输入内容抽取为 wiki 词条。只输出 JSON，禁止输出额外说明。",
    },
    {
      role: "user",
      content: `请从下面内容中抽取最多 ${maxConceptsPerChunk} 个关键概念，返回 JSON：\n` +
        `{\n` +
        `  "concepts": [\n` +
        `    {\n` +
        `      "title": "概念名称",\n` +
        `      "summary": "1-2 句解释",\n` +
        `      "related": ["相关概念A", "相关概念B"],\n` +
        `      "keywords": ["关键词1", "关键词2"]\n` +
        `    }\n` +
        `  ]\n` +
        `}\n` +
        `要求：title 简洁；summary 不超过 80 字；related 最多 4 个；无法提取时返回 {"concepts":[]}\n\n` +
        `source: ${source}\n` +
        `content:\n${content}`,
    },
  ]);

  const parsed = safeJsonParse(normalizeLLMText(response));
  if (!parsed || !Array.isArray(parsed.concepts)) return [];

  return parsed.concepts
    .map((item) => ({
      title: normalizeTitle(item?.title),
      summary: normalizeTitle(item?.summary),
      related: Array.isArray(item?.related) ? item.related.map(normalizeTitle).filter(Boolean) : [],
      keywords: Array.isArray(item?.keywords) ? item.keywords.map(normalizeTitle).filter(Boolean) : [],
      source,
    }))
    .filter((item) => item.title && item.summary);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function dedupeKeepOrder(items) {
  return [...new Set(items.filter(Boolean))];
}

// 统一管理 wiki 内部产物路径，避免在不同函数里重复拼接路径。
function getWikiInternalPaths(wikiPath) {
  return {
    pagesPath: path.join(wikiPath, "pages"),
    indexPath: path.join(wikiPath, WIKI_INDEX_FILE),
    vectorPath: path.join(wikiPath, WIKI_VECTOR_DIR),
    learningStatePath: path.join(wikiPath, LEARNING_STATE_FILE),
    learningCandidatesPath: path.join(wikiPath, LEARNING_CANDIDATES_FILE),
  };
}

function loadWikiIndex(indexPath) {
  const raw = fs.readFileSync(indexPath, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.pages)) data.pages = [];
  return data;
}

function saveWikiIndex(indexPath, indexData) {
  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), "utf-8");
}

function persistWikiPageFiles(pagePath, markdown, options = {}) {
  fs.writeFileSync(pagePath, markdown, "utf-8");
  const richTextFile = createRichTextFile(pagePath, markdown, {
    title: options.title,
    theme: options.theme || "default",
  });
  fs.writeFileSync(richTextFile.htmlPath, richTextFile.htmlContent, "utf-8");
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function loadLearningState(learningStatePath) {
  return readJsonIfExists(learningStatePath, {
    version: 1,
    events: [],
    fingerprints: [],
    writeStats: {
      date: "",
      count: 0,
      lastWriteAt: "",
    },
  });
}

function saveLearningState(learningStatePath, state) {
  fs.writeFileSync(learningStatePath, JSON.stringify(state, null, 2), "utf-8");
}

function appendLearningCandidate(learningCandidatesPath, candidate, maxCandidates) {
  const line = `${JSON.stringify(candidate)}\n`;
  fs.appendFileSync(learningCandidatesPath, line, "utf-8");

  // 控制候选池文件规模：超过上限时保留最新 N 条（滚动窗口）
  const raw = fs.readFileSync(learningCandidatesPath, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length <= maxCandidates) return;
  const kept = lines.slice(lines.length - maxCandidates);
  fs.writeFileSync(learningCandidatesPath, `${kept.join("\n")}\n`, "utf-8");
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // 忽略损坏行，避免一个坏样本影响整体审核流程
    }
  }
  return rows;
}

function writeJsonl(filePath, rows) {
  if (!rows.length) {
    fs.writeFileSync(filePath, "", "utf-8");
    return;
  }
  const content = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  fs.writeFileSync(filePath, content, "utf-8");
}

function appendJsonl(filePath, row) {
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, "utf-8");
}

function markLearningEvent({
  learningStatePath,
  state,
  event,
  fingerprint,
  config,
  didWrite,
}) {
  const next = state ?? loadLearningState(learningStatePath);
  const dateKey = nowIso().slice(0, 10);
  if (next.writeStats?.date !== dateKey) {
    next.writeStats = {
      date: dateKey,
      count: 0,
      lastWriteAt: "",
    };
  }
  if (didWrite) {
    next.writeStats.count += 1;
    next.writeStats.lastWriteAt = nowIso();
  }

  if (fingerprint) {
    next.fingerprints.push(fingerprint);
    if (next.fingerprints.length > config.maxStateEvents) {
      next.fingerprints = next.fingerprints.slice(next.fingerprints.length - config.maxStateEvents);
    }
  }

  next.events.push(event);
  if (next.events.length > config.maxStateEvents) {
    next.events = next.events.slice(next.events.length - config.maxStateEvents);
  }

  saveLearningState(learningStatePath, next);
  return next;
}

function buildWikiPageMarkdown({ title, summaryList, relatedTitles, keywords, sources }) {
  const relatedBlock = relatedTitles.length
    ? relatedTitles.map((name) => `- [[${name}]]`).join("\n")
    : "- （暂无）";
  const keywordBlock = keywords.length ? keywords.map((k) => `- ${k}`).join("\n") : "- （暂无）";
  const sourceBlock = sources.length ? sources.map((s) => `- ${s}`).join("\n") : "- （暂无）";

  return [
    `# ${title}`,
    "",
    "## Summary",
    ...summaryList.map((line) => `- ${line}`),
    "",
    "## Related Topics",
    relatedBlock,
    "",
    "## Keywords",
    keywordBlock,
    "",
    "## Sources",
    sourceBlock,
    "",
  ].join("\n");
}

export function checkLLMWikiExists(wikiPath) {
  try {
    return checkRequiredFiles(wikiPath);
  } catch {
    return false;
  }
}

/**
 * 构建流程（离线阶段）：
 * 文档加载 -> 切分抽样 -> LLM 抽取概念关系 -> 生成页面/索引 -> 建向量库
 *
 * @param {Object} options
 * @param {string} options.knowledgeBasePath 原始文档目录
 * @param {string} options.wikiPath wiki 输出目录
 * @param {Object} options.llm 概念抽取模型（需支持 invoke）
 * @param {Object} options.embeddings 向量模型
 * @param {number} [options.chunkSize]
 * @param {number} [options.chunkOverlap]
 * @param {number} [options.maxChunks]
 * @param {number} [options.maxConceptsPerChunk]
 * @returns {Promise<{wikiPath:string,pagesPath:string,indexPath:string,vectorPath:string,pageCount:number}>}
 *
 * 副作用：会写文件（pages/wiki-index/vector_db/learning-state/candidates）。
 */
export async function buildLLMWiki(options) {
  const {
    knowledgeBasePath,
    wikiPath,
    llm,
    embeddings,
    chunkSize = 1200,
    chunkOverlap = 150,
    maxChunks = 16,
    maxConceptsPerChunk = 4,
  } = options;

  if (!llm) throw new Error("缺少 llm 参数");
  if (!embeddings) throw new Error("缺少 embeddings 参数");

  console.log("\n🧠 开始构建 LLM Wiki...\n");
  console.log("📁 步骤1/5: 加载知识文档...");
  const docs = await loadKnowledgeDocuments(knowledgeBasePath);
  console.log(`   ✅ 加载 ${docs.length} 个文档\n`);

  console.log("✂️  步骤2/5: 文本切分...");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n\n", "\n", "。", "；", "，", ". ", "? ", "! "],
  });
  const splitDocs = await splitter.splitDocuments(docs);
  const selectedChunks = pickRepresentativeChunks(splitDocs, maxChunks);
  console.log(`   ✅ 总分块 ${splitDocs.length} 个，抽样 ${selectedChunks.length} 个用于 wiki 抽取\n`);

  console.log("🔎 步骤3/5: LLM 抽取概念与关系...");
  const conceptMap = new Map();
  for (let i = 0; i < selectedChunks.length; i += 1) {
    const concepts = await extractConceptsFromChunk({
      llm,
      doc: selectedChunks[i],
      maxConceptsPerChunk,
    });

    for (const concept of concepts) {
      const key = normalizeForLookup(concept.title);
      const prev = conceptMap.get(key) ?? {
        title: concept.title,
        summaryList: [],
        related: [],
        keywords: [],
        sources: [],
      };

      prev.summaryList = dedupeKeepOrder([...prev.summaryList, concept.summary]);
      prev.related = dedupeKeepOrder([...prev.related, ...concept.related]);
      prev.keywords = dedupeKeepOrder([...prev.keywords, ...concept.keywords]);
      prev.sources = dedupeKeepOrder([...prev.sources, concept.source]);
      conceptMap.set(key, prev);
    }

    if ((i + 1) % 4 === 0 || i === selectedChunks.length - 1) {
      console.log(`   ⏳ 已处理 ${i + 1}/${selectedChunks.length} 个 chunk`);
    }
  }

  if (!conceptMap.size) {
    throw new Error("未抽取到有效 wiki 概念，请检查文档内容或模型输出。");
  }
  console.log(`   ✅ 形成 ${conceptMap.size} 个 wiki 词条草稿\n`);

  console.log("📝 步骤4/5: 生成 wiki 页面与索引...");
  ensureDir(wikiPath);
  const pagesPath = path.join(wikiPath, "pages");
  ensureDir(pagesPath);

  const slugUsed = new Map();
  const entries = [];
  const titleByKey = new Map();
  for (const [key, value] of conceptMap.entries()) {
    titleByKey.set(key, value.title);
  }

  for (const [key, value] of conceptMap.entries()) {
    const normalizedRelated = value.related
      .map((name) => titleByKey.get(normalizeForLookup(name)) ?? name)
      .filter((name) => normalizeForLookup(name) !== key);

    let slugBase = sanitizeFilename(value.title);
    const count = (slugUsed.get(slugBase) ?? 0) + 1;
    slugUsed.set(slugBase, count);
    if (count > 1) slugBase = `${slugBase}-${count}`;

    const markdown = buildWikiPageMarkdown({
      title: value.title,
      summaryList: value.summaryList.slice(0, 6),
      relatedTitles: dedupeKeepOrder(normalizedRelated).slice(0, 12),
      keywords: value.keywords.slice(0, 12),
      sources: value.sources,
    });

    const pagePath = path.join(pagesPath, `${slugBase}.md`);
    persistWikiPageFiles(pagePath, markdown, { title: value.title });

    entries.push({
      title: value.title,
      slug: slugBase,
      summaryList: value.summaryList.slice(0, 6),
      related: dedupeKeepOrder(normalizedRelated).slice(0, 12),
      keywords: value.keywords.slice(0, 12),
      sources: value.sources,
      pagePath,
    });
  }

  const indexData = {
    generatedAt: new Date().toISOString(),
    totalPages: entries.length,
    pages: entries.map((item) => ({
      title: item.title,
      slug: item.slug,
      related: item.related,
      keywords: item.keywords,
      sources: item.sources,
    })),
  };
  const {
    indexPath,
    learningStatePath,
    learningCandidatesPath,
  } = getWikiInternalPaths(wikiPath);
  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), "utf-8");
  console.log(`   ✅ 生成 ${entries.length} 个 wiki 页面\n`);

  console.log("💾 步骤5/5: 构建 wiki 向量索引...");
  const vectorDocs = entries.map((item) => {
    const text = [
      `Title: ${item.title}`,
      `Summary: ${item.summaryList.join(" ")}`,
      `Related: ${item.related.join(", ")}`,
      `Keywords: ${item.keywords.join(", ")}`,
    ].join("\n");

    return new Document({
      pageContent: text,
      metadata: {
        title: item.title,
        slug: item.slug,
        sources: item.sources,
      },
    });
  });

  const vectorStore = await FaissStore.fromDocuments(vectorDocs, embeddings);
  const vectorPath = path.join(wikiPath, WIKI_VECTOR_DIR);
  ensureDir(vectorPath);
  await vectorStore.save(vectorPath);
  console.log(`   ✅ wiki 向量索引已保存到: ${vectorPath}\n`);

  // 初始化学习状态文件（用于写入治理/去重/候选池）
  if (!fs.existsSync(learningStatePath)) {
    saveLearningState(learningStatePath, {
      version: 1,
      events: [],
      fingerprints: [],
      writeStats: { date: "", count: 0, lastWriteAt: "" },
    });
  }
  if (!fs.existsSync(learningCandidatesPath)) {
    fs.writeFileSync(learningCandidatesPath, "", "utf-8");
  }

  console.log("🎉 LLM Wiki 构建完成！\n");

  return {
    wikiPath,
    pagesPath,
    indexPath,
    vectorPath,
    pageCount: entries.length,
  };
}

/**
 * 加载已有 wiki；若不存在则自动构建。
 * 常用于服务启动阶段的“懒初始化”。
 */
export async function loadOrBuildLLMWiki(options) {
  const { wikiPath, forceRebuild = false } = options;

  if (!wikiPath) throw new Error("缺少 wikiPath 参数");

  if (forceRebuild && fs.existsSync(wikiPath)) {
    console.log("🔄 强制重建 LLM Wiki：清理旧目录...\n");
    fs.rmSync(wikiPath, { recursive: true, force: true });
  }

  const exists = checkLLMWikiExists(wikiPath);
  if (exists) {
    const {
      indexPath,
      learningStatePath,
      learningCandidatesPath,
    } = getWikiInternalPaths(wikiPath);
    const indexData = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    if (!fs.existsSync(learningStatePath)) {
      saveLearningState(learningStatePath, {
        version: 1,
        events: [],
        fingerprints: [],
        writeStats: { date: "", count: 0, lastWriteAt: "" },
      });
    }
    if (!fs.existsSync(learningCandidatesPath)) {
      fs.writeFileSync(learningCandidatesPath, "", "utf-8");
    }
    console.log(`📂 检测到已存在 LLM Wiki，直接复用（${indexData.totalPages} 页）`);
    return {
      wikiPath,
      pagesPath: path.join(wikiPath, "pages"),
      indexPath,
      vectorPath: path.join(wikiPath, WIKI_VECTOR_DIR),
      pageCount: indexData.totalPages,
    };
  }

  return buildLLMWiki(options);
}

/**
 * 检索路径（只读，不改数据）：
 * 输入 question，返回召回文档 + 可直接喂给 LLM 的 context + references。
 */
export async function retrieveFromLLMWiki(options) {
  const { wikiPath, embeddings, question, topK = 4 } = options;
  if (!question) throw new Error("question 不能为空");
  if (!checkLLMWikiExists(wikiPath)) {
    throw new Error(`LLM Wiki 不存在，请先构建: ${wikiPath}`);
  }

  // 在线查询只做“读操作”：召回文档 + 组装上下文
  const { vectorPath } = getWikiInternalPaths(wikiPath);
  const vectorStore = await FaissStore.load(vectorPath, embeddings);
  const docs = await vectorStore.similaritySearch(question, topK);

  const context = docs
    .map((doc, index) => {
      const title = doc.metadata?.title ?? `page-${index + 1}`;
      return `[${index + 1}] ${title}\n${String(doc.pageContent ?? "").slice(0, 500)}`;
    })
    .join("\n\n");

  return {
    docs,
    context,
    references: docs.map((doc) => ({
      title: doc.metadata?.title ?? "unknown",
      slug: doc.metadata?.slug ?? "",
      sources: doc.metadata?.sources ?? [],
      excerpt: String(doc.pageContent ?? "").slice(0, 220),
    })),
  };
}

async function extractLearningConcept({ llm, question, answer, references }) {
  const referenceTitles = references.map((item) => item.title).join(", ");
  const response = await llm.invoke([
    {
      role: "system",
      content:
        "你是知识沉淀助手。请把问答提炼成一个 wiki 词条草案。仅输出 JSON。",
    },
    {
      role: "user",
      content:
        `请基于以下问答，输出 JSON:\n` +
        `{\n` +
        `  "title": "词条标题",\n` +
        `  "summary": "不超过80字",\n` +
        `  "related": ["相关主题1","相关主题2"],\n` +
        `  "keywords": ["关键词1","关键词2"]\n` +
        `}\n` +
        `若信息不足请给最保守的结果，不要输出解释。\n\n` +
        `question: ${question}\n` +
        `answer: ${answer}\n` +
        `references: ${referenceTitles}`,
    },
  ]);

  const parsed = safeJsonParse(normalizeLLMText(response)) ?? {};
  const title = normalizeTitle(parsed.title) || normalizeTitle(question).slice(0, 60) || "QnA Note";
  const summary = normalizeTitle(parsed.summary) || "基于问答自动沉淀的知识点。";
  const related = Array.isArray(parsed.related) ? parsed.related.map(normalizeTitle).filter(Boolean) : [];
  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(normalizeTitle).filter(Boolean) : [];
  return { title, summary, related, keywords };
}

function mergeUnique(base = [], incoming = []) {
  return dedupeKeepOrder([...base, ...incoming]);
}

function appendLearnedNote(pagePath, noteLine, maxLearnedNotesPerPage) {
  let content = "";
  if (fs.existsSync(pagePath)) {
    content = fs.readFileSync(pagePath, "utf-8");
  }

  if (!content.includes(LEARNED_SECTION_TITLE)) {
    const suffix = content.endsWith("\n") ? "" : "\n";
    content = `${content}${suffix}\n${LEARNED_SECTION_TITLE}\n- ${noteLine}\n`;
  } else {
    content = `${content}${content.endsWith("\n") ? "" : "\n"}- ${noteLine}\n`;
  }

  const lines = content.split("\n");
  const sectionIndex = lines.findIndex((line) => line.trim() === LEARNED_SECTION_TITLE);
  if (sectionIndex >= 0) {
    const prefix = lines.slice(0, sectionIndex + 1);
    const notes = lines
      .slice(sectionIndex + 1)
      .filter((line) => line.trim().startsWith("- "))
      .filter(Boolean);
    const dedupedNotes = dedupeKeepOrder(notes);
    const kept = dedupedNotes.slice(Math.max(0, dedupedNotes.length - maxLearnedNotesPerPage));
    content = `${prefix.join("\n")}\n${kept.join("\n")}\n`;
  }

  fs.writeFileSync(pagePath, content, "utf-8");
  const titleLine = content.split("\n").find((line) => line.startsWith("# "));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : path.basename(pagePath, ".md");
  const richTextFile = createRichTextFile(pagePath, content, { title });
  fs.writeFileSync(richTextFile.htmlPath, richTextFile.htmlContent, "utf-8");
}

function isLikelyUncertainAnswer(answer, uncertaintyPatterns) {
  const lower = String(answer ?? "").toLowerCase();
  return uncertaintyPatterns.some((pattern) => lower.includes(String(pattern).toLowerCase()));
}

function chooseLearningMatch(pages, concept, references, config) {
  if (!pages.length) return null;
  const byTitle = pages.find(
    (item) => normalizeForLookup(item.title) === normalizeForLookup(concept.title)
  );
  if (byTitle) {
    return { page: byTitle, score: 1, reason: "exact-title" };
  }

  // 多信号打分：标题/关键词/关联关系/摘要，尽量把新知识聚合到已有页面。
  const title = concept.title;
  const summary = concept.summary;
  const referenceTitles = references.map((item) => item.title).join(" ");
  let best = null;

  for (const page of pages) {
    const titleScore = jaccardSimilarity(title, page.title ?? "");
    const keywordScore = jaccardSimilarity(
      (concept.keywords ?? []).join(" "),
      (page.keywords ?? []).join(" ")
    );
    const relationScore = jaccardSimilarity(
      referenceTitles,
      (page.related ?? []).join(" ")
    );
    const summaryScore = jaccardSimilarity(summary, (page.summaryList ?? []).join(" "));
    const score = titleScore * 0.45 + keywordScore * 0.2 + relationScore * 0.15 + summaryScore * 0.2;
    if (!best || score > best.score) {
      best = { page, score, reason: "semantic" };
    }
  }

  if (!best) return null;
  if (best.score >= config.dedupeThreshold.titleSimilarity) return best;
  return null;
}

function canWriteNow(state, config) {
  const current = state ?? {
    writeStats: { date: "", count: 0, lastWriteAt: "" },
  };
  const dateKey = nowIso().slice(0, 10);
  const writeStats = current.writeStats ?? { date: "", count: 0, lastWriteAt: "" };
  const todayCount = writeStats.date === dateKey ? writeStats.count : 0;
  if (todayCount >= config.maxWritesPerDay) {
    return { ok: false, reason: `已达每日写入上限 ${config.maxWritesPerDay}` };
  }

  if (writeStats.lastWriteAt) {
    const diffSec = (Date.now() - new Date(writeStats.lastWriteAt).getTime()) / 1000;
    if (diffSec < config.minSecondsBetweenWrites) {
      return { ok: false, reason: `写入节流中，需间隔 ${config.minSecondsBetweenWrites}s` };
    }
  }

  return { ok: true, reason: "" };
}

function makeLearningFingerprint({ question, answer, references }) {
  const raw = [
    normalizeTextLoose(question),
    normalizeTextLoose(answer).slice(0, 300),
    references.map((item) => normalizeTextLoose(item.title)).join("|"),
  ].join("||");
  return hashText(raw);
}

function shouldSkipLearning({
  learningConfig,
  question,
  answer,
  references,
  state,
}) {
  // 指纹去重，避免相同问答重复写入。
  const fingerprint = makeLearningFingerprint({ question, answer, references });
  const fingerprints = state?.fingerprints ?? [];
  if (fingerprints.includes(fingerprint)) {
    return { skip: true, reason: "duplicate-fingerprint", fingerprint };
  }

  if ((answer ?? "").length < learningConfig.minAnswerLength) {
    return { skip: true, reason: "answer-too-short", fingerprint };
  }

  if (
    learningConfig.skipIfUncertain &&
    isLikelyUncertainAnswer(answer, learningConfig.uncertaintyPatterns)
  ) {
    return { skip: true, reason: "uncertain-answer", fingerprint };
  }

  return { skip: false, reason: "", fingerprint };
}

function deriveLearningConceptHeuristic(question, answer, references) {
  const firstRef = references[0];
  if (!firstRef?.title) {
    return {
      title: normalizeTitle(question).slice(0, 60) || "QnA Note",
      summary: normalizeTitle(answer).slice(0, 120) || "基于问答自动沉淀的知识点。",
      related: [],
      keywords: tokenize(question).slice(0, 6),
    };
  }

  return {
    title: normalizeTitle(question).slice(0, 60) || firstRef.title,
    summary: normalizeTitle(answer).slice(0, 120) || "基于问答自动沉淀的知识点。",
    related: dedupeKeepOrder([firstRef.title, ...references.slice(1).map((item) => item.title)]).slice(0, 6),
    keywords: dedupeKeepOrder([
      ...tokenize(question).slice(0, 4),
      ...tokenize(firstRef.title).slice(0, 2),
    ]),
  };
}

function normalizeCandidateConcept(candidate) {
  if (candidate?.concept?.title) {
    return {
      title: normalizeTitle(candidate.concept.title) || "QnA Note",
      summary: normalizeTitle(candidate.concept.summary) || "基于问答自动沉淀的知识点。",
      related: Array.isArray(candidate.concept.related)
        ? candidate.concept.related.map(normalizeTitle).filter(Boolean)
        : [],
      keywords: Array.isArray(candidate.concept.keywords)
        ? candidate.concept.keywords.map(normalizeTitle).filter(Boolean)
        : [],
    };
  }
  return deriveLearningConceptHeuristic(
    candidate?.question ?? "",
    candidate?.answer ?? "",
    candidate?.references ?? []
  );
}

export function listLearningCandidates(options) {
  const { wikiPath, limit = 100 } = options;
  const { learningCandidatesPath } = getWikiInternalPaths(wikiPath);
  const all = readJsonl(learningCandidatesPath);
  return all.slice(0, Math.max(0, limit)).map((item, idx) => ({
    index: idx + 1,
    ts: item.ts ?? "",
    question: String(item.question ?? "").slice(0, 120),
    fingerprint: item.fingerprint ?? "",
    title: item?.concept?.title ?? "",
    references: Array.isArray(item.references) ? item.references.length : 0,
  }));
}

/**
 * 审核发布候选池：
 * - 支持按 indexes/fingerprints 选择候选，或 approveAll 全选
 * - dryRun=true 时仅预演，不改正式库与候选池
 * - dryRun=false 时会真正写入正式 wiki，并移除已处理候选
 */
export async function promoteLearningCandidates(options) {
  const {
    wikiPath,
    embeddings,
    approveAll = false,
    indexes = [],
    fingerprints = [],
    dryRun = true,
    learningConfig: learningConfigInput,
  } = options;

  if (!wikiPath) throw new Error("缺少 wikiPath 参数");
  if (!embeddings) throw new Error("缺少 embeddings 参数");
  if (!checkLLMWikiExists(wikiPath)) {
    throw new Error(`LLM Wiki 不存在，请先构建: ${wikiPath}`);
  }

  const {
    learningCandidatesPath,
    learningReviewedPath,
    learningStatePath,
  } = {
    ...getWikiInternalPaths(wikiPath),
    learningReviewedPath: path.join(wikiPath, LEARNING_REVIEWED_FILE),
  };
  if (!fs.existsSync(learningCandidatesPath)) {
    return { selected: 0, written: 0, skipped: 0, remaining: 0, results: [] };
  }

  const allCandidates = readJsonl(learningCandidatesPath);
  const approvedIndexSet = new Set(indexes.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0));
  const approvedFingerprintSet = new Set(fingerprints.map((v) => String(v)).filter(Boolean));

  const isSelected = (item, zeroBasedIndex) => {
    if (approveAll) return true;
    const oneBasedIndex = zeroBasedIndex + 1;
    if (approvedIndexSet.has(oneBasedIndex)) return true;
    if (item?.fingerprint && approvedFingerprintSet.has(item.fingerprint)) return true;
    return false;
  };

  const selected = [];
  const remaining = [];
  allCandidates.forEach((item, idx) => {
    if (isSelected(item, idx)) selected.push(item);
    else remaining.push(item);
  });

  const learningConfig = resolveLearningConfig(learningConfigInput);
  learningConfig.writeEnabled = true;
  learningConfig.mode = "direct";

  const learningState = loadLearningState(learningStatePath);
  const results = [];
  let written = 0;
  let skipped = 0;

  for (const candidate of selected) {
    const references = Array.isArray(candidate.references) ? candidate.references : [];
    const question = String(candidate.question ?? "");
    const answer = String(candidate.answer ?? "");
    const concept = normalizeCandidateConcept(candidate);

    const skipCheck = shouldSkipLearning({
      learningConfig,
      question,
      answer,
      references,
      state: learningState,
    });
    if (skipCheck.skip) {
      skipped += 1;
      const result = {
        status: "skipped",
        reason: skipCheck.reason,
        question,
        fingerprint: candidate.fingerprint ?? "",
      };
      results.push(result);
      appendJsonl(learningReviewedPath, {
        ts: nowIso(),
        action: "review-skip",
        candidate,
        result,
      });
      continue;
    }

    if (dryRun) {
      const result = {
        status: "dry-run",
        question,
        fingerprint: candidate.fingerprint ?? "",
        conceptTitle: concept.title,
      };
      results.push(result);
      continue;
    }

    const writeResult = await persistLearningToWiki({
      wikiPath,
      embeddings,
      question,
      answer,
      references,
      concept,
      learningConfig,
      learningState,
    });
    written += 1;
    const result = {
      status: "written",
      question,
      fingerprint: candidate.fingerprint ?? "",
      ...writeResult,
    };
    results.push(result);
    appendJsonl(learningReviewedPath, {
      ts: nowIso(),
      action: "review-write",
      candidate,
      result,
    });
  }

  // 仅在真实写入时，移除已处理候选；dry-run 不改候选池。
  if (!dryRun) {
    writeJsonl(learningCandidatesPath, remaining);
  }

  return {
    selected: selected.length,
    written,
    skipped,
    remaining: dryRun ? allCandidates.length : remaining.length,
    dryRun,
    results,
  };
}

async function persistLearningToWiki({
  wikiPath,
  embeddings,
  question,
  answer,
  references,
  concept,
  learningConfig,
  learningState,
}) {
  // 该函数是“正式写入路径”：会改页面、改索引、改向量库。
  // 设计原则：优先聚合已有页面，避免无限新增碎片页。
  const { pagesPath, indexPath, vectorPath, learningStatePath } = getWikiInternalPaths(wikiPath);
  ensureDir(pagesPath);
  const indexData = loadWikiIndex(indexPath);
  const pages = indexData.pages ?? [];

  const now = new Date().toISOString();
  // 先做页面级聚合：能合并就不新建，降低知识碎片化。
  const matched = chooseLearningMatch(pages, concept, references, learningConfig);
  const existing = matched?.page ?? null;

  const referenceTitles = references.map((item) => item.title).filter(Boolean);
  const noteLine = `[${now}] Q: ${question.slice(0, 140)} | A: ${answer.slice(0, 160)}`;

  let slug = existing?.slug;
  let action = existing ? "merge-existing-page" : "create-new-page";
  if (!slug) {
    const used = new Set(pages.map((item) => item.slug));
    let base = sanitizeFilename(concept.title);
    if (!base) base = "QnA-Note";
    let count = 1;
    slug = base;
    while (used.has(slug)) {
      count += 1;
      slug = `${base}-${count}`;
    }

    const newPagePath = path.join(pagesPath, `${slug}.md`);
    const markdown = buildWikiPageMarkdown({
      title: concept.title,
      summaryList: [concept.summary],
      relatedTitles: mergeUnique(concept.related, referenceTitles).slice(0, 12),
      keywords: concept.keywords.slice(0, 12),
      sources: [`qa:${now}`],
    });
    persistWikiPageFiles(newPagePath, markdown, { title: concept.title });

    pages.push({
      title: concept.title,
      slug,
      related: mergeUnique(concept.related, referenceTitles).slice(0, 12),
      keywords: concept.keywords.slice(0, 12),
      sources: [`qa:${now}`],
      summaryList: [concept.summary],
      stats: {
        learnedCount: 0,
      },
    });
  }

  const pagePath = path.join(pagesPath, `${slug}.md`);
  appendLearnedNote(pagePath, noteLine, learningConfig.maxLearnedNotesPerPage);

  const pageRef = pages.find((item) => item.slug === slug);
  if (pageRef) {
    pageRef.related = mergeUnique(pageRef.related, mergeUnique(concept.related, referenceTitles)).slice(0, 16);
    pageRef.keywords = mergeUnique(pageRef.keywords, concept.keywords).slice(0, 16);
    pageRef.sources = mergeUnique(pageRef.sources, [`qa:${now}`]).slice(0, 20);
    pageRef.summaryList = mergeUnique(pageRef.summaryList ?? [], [concept.summary]).slice(0, 12);
    pageRef.stats = {
      learnedCount: (pageRef.stats?.learnedCount ?? 0) + 1,
      lastLearnedAt: now,
    };
  }

  indexData.generatedAt = now;
  indexData.totalPages = pages.length;
  indexData.pages = pages;
  saveWikiIndex(indexPath, indexData);

  const vectorStore = await FaissStore.load(vectorPath, embeddings);
  const learnedText = [
    `Title: ${concept.title}`,
    `Summary: ${concept.summary}`,
    `Question: ${question}`,
    `Answer: ${answer.slice(0, 400)}`,
    `Related: ${mergeUnique(concept.related, referenceTitles).join(", ")}`,
    `Keywords: ${concept.keywords.join(", ")}`,
  ].join("\n");

  // 向量层再做一次近重复过滤，避免 embedding 库无限膨胀。
  const similarDocs = await vectorStore.similaritySearch(learnedText, 1);
  const nearestText = String(similarDocs[0]?.pageContent ?? "");
  const contentSimilarity = jaccardSimilarity(learnedText, nearestText);
  let vectorAction = "skip-duplicate-vector";

  if (contentSimilarity < learningConfig.dedupeThreshold.contentSimilarity) {
    await vectorStore.addDocuments([
      new Document({
        pageContent: learnedText,
        metadata: {
          title: concept.title,
          slug,
          sources: [`qa:${now}`],
          learned: true,
        },
      }),
    ]);
    await vectorStore.save(vectorPath);
    vectorAction = "add-vector";
  }

  markLearningEvent({
    learningStatePath,
    state: learningState,
    fingerprint: makeLearningFingerprint({ question, answer, references }),
    event: {
      ts: now,
      action,
      vectorAction,
      slug,
      title: concept.title,
      matchReason: matched?.reason ?? "none",
      matchScore: matched?.score ?? 0,
    },
    config: learningConfig,
    didWrite: true,
  });

  return { title: concept.title, slug, action, vectorAction };
}

/**
 * 只处理“学习写入”逻辑，不负责编排最终问答。
 * 业务层应先完成问答，再把 question/answer/references 交给这里做沉淀。
 *
 * @param {Object} options
 * @param {string} options.wikiPath
 * @param {Object} options.embeddings
 * @param {Object} [options.llm] 仅在 enableLLMExtractor=true 时必填
 * @param {string} options.question
 * @param {string} options.answer
 * @param {Array<{title:string,slug?:string,sources?:string[]}>} [options.references]
 * @param {Object} [options.learningConfig]
 * @returns {Promise<{status:string,reason?:string,title?:string,slug?:string}>}
 *
 * 副作用：
 * - candidate 模式：写 learning-candidates.jsonl + learning-state.json
 * - direct 模式：写 pages/wiki-index/vector_db + learning-state.json
 */
export async function processLLMWikiLearning(options) {
  const {
    wikiPath,
    embeddings,
    llm,
    question,
    answer,
    references = [],
    learningConfig: learningConfigInput,
  } = options;

  if (!wikiPath) throw new Error("缺少 wikiPath 参数");
  if (!embeddings) throw new Error("缺少 embeddings 参数");
  if (!question) throw new Error("question 不能为空");
  if (!answer) throw new Error("answer 不能为空");

  const learningConfig = resolveLearningConfig(learningConfigInput);

  const { learningStatePath, learningCandidatesPath } = getWikiInternalPaths(wikiPath);
  ensureDir(wikiPath);
  const learningState = loadLearningState(learningStatePath);

  const cleanReferences = references.map((item) => {
    const { excerpt, ...rest } = item ?? {};
    return {
      title: rest?.title ?? "",
      slug: rest?.slug ?? "",
      sources: Array.isArray(rest?.sources) ? rest.sources : [],
    };
  });

  let learning = {
    status: "skipped",
    reason: "unknown",
  };

  const skipCheck = shouldSkipLearning({
    learningConfig,
    question,
    answer,
    references: cleanReferences,
    state: learningState,
  });

  if (!skipCheck.skip) {
    const writeCheck = canWriteNow(learningState, learningConfig);
    if (!writeCheck.ok) {
      learning = {
        status: "skipped",
        reason: writeCheck.reason,
      };
    } else if (!learningConfig.writeEnabled || learningConfig.mode === "candidate") {
      const concept =
        learningConfig.extractor.useHeuristicFirst
          ? deriveLearningConceptHeuristic(question, answer, cleanReferences)
          : { title: normalizeTitle(question), summary: normalizeTitle(answer), related: [], keywords: [] };

      const candidate = {
        ts: nowIso(),
        question,
        answer,
        references: cleanReferences,
        concept,
        fingerprint: skipCheck.fingerprint,
      };
      appendLearningCandidate(learningCandidatesPath, candidate, learningConfig.maxCandidates);

      markLearningEvent({
        learningStatePath,
        state: learningState,
        fingerprint: skipCheck.fingerprint,
        event: {
          ts: nowIso(),
          action: "append-candidate",
          mode: learningConfig.mode,
          title: concept.title,
        },
        config: learningConfig,
        didWrite: false,
      });

      learning = {
        status: "candidate",
        reason: learningConfig.writeEnabled ? "candidate-mode" : "write-disabled",
        title: concept.title,
      };
    } else {
      try {
        let concept = null;
        if (learningConfig.extractor.useHeuristicFirst) {
          concept = deriveLearningConceptHeuristic(question, answer, cleanReferences);
        }
        if (learningConfig.extractor.enableLLMExtractor) {
          if (!llm) {
            throw new Error("learningConfig.extractor.enableLLMExtractor=true 时需要传入 llm");
          }
          concept = await extractLearningConcept({
            llm,
            question,
            answer,
            references: cleanReferences,
          });
        }

        const result = await persistLearningToWiki({
          wikiPath,
          embeddings,
          question,
          answer,
          references: cleanReferences,
          concept,
          learningConfig,
          learningState,
        });
        learning = {
          status: "written",
          ...result,
        };
      } catch (error) {
        learning = {
          status: "failed",
          reason: error.message,
        };
      }
    }
  } else {
    learning = {
      status: "skipped",
      reason: skipCheck.reason,
    };
  }

  if (learning.status === "failed") {
    console.log(`⚠️ 自动沉淀失败（不影响问答）: ${learning.reason}`);
  } else if (learning.status === "skipped") {
    console.log(`ℹ️ 本轮未写入 Wiki: ${learning.reason}`);
  } else if (learning.status === "candidate") {
    console.log("ℹ️ 本轮已写入候选池（未直接入正式 Wiki）。");
  } else if (learning.status === "written") {
    console.log(`ℹ️ 本轮已写入 Wiki: ${learning.title} (${learning.slug})`);
  }

  return learning;
}
