// ========== LLM 工具函数 ==========

import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";

dotenv.config();

export function createLLM(options = {}) {
  return new ChatOpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    model: options.model || "qwen-plus",
    temperature: options.temperature ?? 0.7,
    configuration: {
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
  });
}

export function createFallbackLLM() {
  // 降级模型，失败时兜底使用
  return createLLM({
    model: "qwen2.5-7b-instruct-1m",
    temperature: 0.7,
  });
}

export function createEmbeddings() {
  return new OpenAIEmbeddings({
    openAIApiKey: process.env.DASHSCOPE_API_KEY,
    modelName: "text-embedding-v4",
    batchSize: 10,
    configuration: {
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
  });
}
