import { Document } from "@langchain/core/documents";

/**
 * 纯本地可运行的 Embeddings（无外部 API 依赖）
 *
 * 说明：
 * - 这是教学演示用 embedding，不用于生产
 * - 思路：把文本做简单分词后，通过哈希映射到固定维度向量
 * - 目的：让 LangChain 向量检索示例在本地可直接跑通
 */
export class LocalHashEmbeddings {
  constructor(dim = 128) {
    this.dim = dim;
  }

  async embedDocuments(texts) {
    return texts.map((text) => this.embedText(text));
  }

  async embedQuery(text) {
    return this.embedText(text);
  }

  embedText(text) {
    const vec = new Array(this.dim).fill(0);
    const tokens = tokenize(text);

    for (const token of tokens) {
      const h = stableHash(token);
      const idx = Math.abs(h) % this.dim;
      vec[idx] += 1;
    }

    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

/**
 * 简单分词：兼容中英文演示。
 */
export function tokenize(text) {
  const normalized = String(text).toLowerCase();

  // 同时提取：
  // 1) 连续英文/数字词（如 vip, ord003）
  // 2) 单个中文字符（让中文查询也能稳定命中）
  const tokens = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]/g) || [];
  return tokens.filter(Boolean);
}

/**
 * 稳定字符串哈希（教学用途）
 */
export function stableHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * 关键词检索分数：统计 query token 在文档中的覆盖和频率
 */
export function keywordScore(query, text) {
  const qTokens = tokenize(query);
  const dTokens = tokenize(text);
  if (qTokens.length === 0 || dTokens.length === 0) {
    return 0;
  }

  const freq = new Map();
  dTokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));

  let score = 0;
  for (const q of qTokens) {
    score += freq.get(q) || 0;
  }
  return score / Math.sqrt(dTokens.length);
}

/**
 * Reciprocal Rank Fusion（RRF）
 *
 * @param {Array<Array<{id: string, text: string}>>} rankedLists 多路排序结果
 * @param {number} k RRF 常数，越大越平滑
 */
export function rrfFuse(rankedLists, k = 60) {
  const scoreMap = new Map();

  rankedLists.forEach((list) => {
    list.forEach((item, rankIndex) => {
      const add = 1 / (k + rankIndex + 1);
      scoreMap.set(item.id, (scoreMap.get(item.id) || 0) + add);
    });
  });

  const merged = [];
  for (const [id, score] of scoreMap.entries()) {
    const found = rankedLists.flat().find((x) => x.id === id);
    if (found) {
      merged.push({ ...found, score });
    }
  }

  return merged.sort((a, b) => b.score - a.score);
}

/**
 * 统一教学语料：便于对比不同检索策略效果
 */
export function buildDemoDocs() {
  const rows = [
    {
      id: "doc-1",
      title: "退款政策",
      content:
        "电商平台支持7天无理由退货。生鲜、定制商品不支持无理由退货。退款通常在3个工作日内原路返回。",
    },
    {
      id: "doc-2",
      title: "售后故障排查",
      content:
        "当设备无法开机时，先检查电源和适配器，再长按电源键10秒进行重启。如果仍失败，提交售后工单。",
    },
    {
      id: "doc-3",
      title: "会员权益",
      content:
        "VIP会员享受95折、专属客服与快速退款通道。年度会员可获得每月运费券。",
    },
    {
      id: "doc-4",
      title: "物流时效",
      content:
        "普通快递预计3到5天送达，特快专递预计次日达。大促期间可能延迟1到2天。",
    },
    {
      id: "doc-5",
      title: "支付与发票",
      content:
        "支持支付宝、微信、银行卡。企业用户可申请电子发票，开票后发送到邮箱。",
    },
  ];

  return rows.map((row) =>
    new Document({
      pageContent: `${row.title}：${row.content}`,
      metadata: {
        id: row.id,
        title: row.title,
        source: "demo-corpus",
      },
    })
  );
}
