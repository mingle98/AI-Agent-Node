import { ChatOpenAI } from "@langchain/openai";
import { config, requireEnv } from "./config.js";

// 这个文件负责“统一创建 LLM 客户端”，并提供一个稳定的 JSON 调用工具。
//
// 你可以把它理解成：
// - createChatModel(): 选择用哪个大模型（OpenAI / 通义千问），并返回 LangChain 的 Chat 模型
// - invokeJson(): 让模型尽量返回 JSON，并把结果 parse 成 JS 对象

export function createChatModel({ temperature = 0 } = {}) {
  // 通过环境变量 LLM_PROVIDER 控制走哪个厂商
  const provider = (config.llmProvider || "openai").toLowerCase();

  if (provider === "aliyun") {
    // DashScope（通义千问）提供了 OpenAI 兼容接口：
    // baseURL=https://dashscope.aliyuncs.com/compatible-mode/v1
    // 所以我们可以继续复用 ChatOpenAI，只是换 baseURL + apiKey。
    requireEnv("DASHSCOPE_API_KEY");
    return new ChatOpenAI({
      apiKey: config.dashscopeApiKey,
      model: process.env.DASHSCOPE_MODEL || process.env.LLM_MODEL || "qwen-plus",
      temperature,
      configuration: {
        baseURL: config.dashscopeBaseUrl,
      },
    });
  }

  // 默认走 OpenAI
  requireEnv("OPENAI_API_KEY");
  return new ChatOpenAI({
    apiKey: config.openaiApiKey,
    model: process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini",
    temperature,
  });
}

function extractJsonObject(text) {
  // 有些模型可能会输出：
  // “好的，以下是 JSON：{...}”
  // 为了让 demo 稳定跑通，这里做一个简单的 { ... } 截取。
  if (!text) return "";
  const s = String(text);
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return "";
  return s.slice(first, last + 1);
}

export async function invokeJson(llm, messages) {
  // 尽量让模型返回严格 JSON。
  // OpenAI 新接口支持 response_format，但兼容接口/部分模型可能不支持。
  // 所以我们先尝试带 response_format 调用，失败就降级为普通调用。
  let res;
  try {
    res = await llm.invoke(messages, {
      response_format: { type: "json_object" },
    });
  } catch {
    res = await llm.invoke(messages);
  }

  const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractJsonObject(text);
    if (!extracted) throw new Error("Model did not return valid JSON");
    return JSON.parse(extracted);
  }
}
