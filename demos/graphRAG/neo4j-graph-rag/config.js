import "dotenv/config";

// 这个文件只做一件事：把运行时需要的环境变量集中管理起来。
//
// 为什么要单独抽出来？
// - 入口脚本（ingest/query）不需要关心 env 变量叫什么
// - 未来你想把 LLM 从 OpenAI 换到 DashScope（通义千问）也只改这里/llm.js

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// 在多个 env 变量名之间做兼容：按顺序返回第一个有值的变量。
// 例如 Neo4j 用户名，有的习惯叫 NEO4J_USER，有的叫 NEO4J_USERNAME。
export function envAny(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return "";
}

// config 是整个 demo 的“配置单”。其它文件只 import 这个对象，不直接读 process.env。
export const config = {
  // LLM 提供商（与你项目根目录 .env 的约定一致）
  // - openai: 使用 OPENAI_API_KEY / OPENAI_MODEL
  // - aliyun: 使用 DASHSCOPE_API_KEY / DASHSCOPE_MODEL，并走兼容 OpenAI 的 baseURL
  llmProvider: process.env.LLM_PROVIDER || "openai",

  // OpenAI 配置
  openaiApiKey: process.env.OPENAI_API_KEY,

  // DashScope（通义千问）配置
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY,
  dashscopeBaseUrl:
    process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",

  // Neo4j 连接配置
  neo4j: {
    uri: requireEnv("NEO4J_URI"),
    user: envAny("NEO4J_USER", "NEO4J_USERNAME") || requireEnv("NEO4J_USER"),
    password: requireEnv("NEO4J_PASSWORD"),
    database: process.env.NEO4J_DATABASE || "neo4j",
  },
};
