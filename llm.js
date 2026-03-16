// ========== LLM 工具函数 ==========

import dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";

dotenv.config();

export function createLLM(options = {}) {
  return new ChatOpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    model: options.model || "qwen-flash",// qwen-plus支持工具调用但是不支持图片, qwen-omni-turbo支持图片但是不支持工具调用 按需选择
    temperature: options.temperature ?? 0.7,
    configuration: {
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
  });
}

export function createFallbackLLM() {
  // 降级模型，失败时兜底使用
  return createLLM({
    model: "qwen-plus",
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
