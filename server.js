// ========== Express 服务：将 ProductionAgent 以接口形式提供给前端 ==========

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { ProductionAgent } from "./agent/ProductionAgent.js";
import { createLLM, createEmbeddings, createFallbackLLM } from "./llm.js";
import { loadOrBuildVectorStore } from "./utils/ragBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

let agentInitError = null;

async function initAgent() {
  const llm = createLLM();
  const fallbackLlm = createFallbackLLM();
  const embeddings = createEmbeddings();

  const vectorDbPath = path.join(__dirname, "vector_db");
  const knowledgeBasePath = path.join(__dirname, "knowledge_base");

  const vectorStore = await loadOrBuildVectorStore({
    vectorDbPath,
    knowledgeBasePath,
    embeddings,
    forceRebuild: false,
  });

  return new ProductionAgent(llm, vectorStore, embeddings, {
    contextStrategy: "trim",
    fallbackLlm,
    llmTimeoutMs: 25000,
    toolTimeoutMs: 8000,
    llmRetries: 2,
    toolRetries: 2,
    debug: true,
    roleName: "AISuspendedBallChat前端组件使用助手",
    roleDescription: "可以帮助用户解决AISuspendedBallChat前端组件使用相关的问题",
  });
}

const agentPromise = initAgent().catch((error) => {
  agentInitError = error;
  console.error("❌ Agent 初始化失败:", error.message);
  throw error;
});

async function getAgent() {
  if (agentInitError) {
    throw agentInitError;
  }
  return agentPromise;
}

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  const requestedHeaders = req.headers["access-control-request-headers"];
  res.setHeader(
    "Access-Control-Allow-Headers",
    typeof requestedHeaders === "string" && requestedHeaders.trim()
      ? requestedHeaders
      : "Content-Type,Authorization,X-Requested-With"
  );
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", async (req, res, next) => {
  try {
    const agent = await getAgent();
    res.json({
      ok: true,
      service: "production-agent-api",
      agentReady: true,
      activeSessions: agent.sessions.size,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const agent = await getAgent();
    const message = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const sessionId =
      typeof req.body?.session_id === "string" && req.body.session_id.trim()
        ? req.body.session_id.trim()
        : "default";
    const stream = req.body?.isStream === true;

    if (!message) {
      res.status(400).json({ error: "message 不能为空" });
      return;
    }

    if (!stream) {
      const response = await agent.chat(message, null, null, sessionId);
      res.json({
        sessionId,
        message,
        response,
        stats: agent.getStats(sessionId),
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "close");
    res.flushHeaders?.();

    const sendChunk = (payload) => {
      res.write(`${JSON.stringify(payload)}\n\n`);
    };
    let hasSentEnd = false;

    try {
      const finalResponse = await agent.chat(
        message,
        (chunk) => {
          if (!chunk) {
            return;
          }
          if (chunk.type === "done") {
            hasSentEnd = true;
            sendChunk({ code: 0, result: chunk.finalText || "", is_end: true });
            return;
          }
          if (chunk.type === "error") {
            hasSentEnd = true;
            sendChunk({ code: 1, result: chunk.message || "未知错误", is_end: true });
            return;
          }
          if (chunk?.content) {
            sendChunk({ code: 0, result: chunk.content, is_end: false });
          }
        },
        null,
        sessionId
      );
      // 兼容旧行为：如果底层没有发 done 事件，兜底补发一次
      if (!hasSentEnd) {
        sendChunk({ code: 0, result: finalResponse, is_end: true });
      }
    } catch (error) {
      sendChunk({ code: 1, result: error.message || "未知错误", is_end: true });
    } finally {
      res.end();
    }
  } catch (error) {
    next(error);
  }
});

app.post("/api/session/reset", async (req, res, next) => {
  try {
    const agent = await getAgent();
    const sessionId =
      typeof req.body?.session_id === "string" && req.body.session_id.trim()
        ? req.body.session_id.trim()
        : "default";
    agent.reset(sessionId);
    res.json({ ok: true, sessionId });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "接口不存在" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const isInitErr = Boolean(agentInitError);
  const message = isInitErr
    ? "Agent 初始化失败，请检查配置后重启服务"
    : error?.message || "服务器内部错误";
  res.status(500).json({ error: message });
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Express API 服务已启动: http://${HOST}:${PORT}`);
  console.log("可用接口:");
  console.log("  GET  /health");
  console.log("  POST /api/chat");
  console.log("  POST /api/session/reset");
});