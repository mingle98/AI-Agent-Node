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
    llmTimeoutMs: 5 * 60000,
    toolTimeoutMs: 5 * 60000,
    llmRetries: 2,
    toolRetries: 2,
    debug: true,
    roleName: "AI智能助手",
    roleDescription: "可以帮助用户解决AISuspendedBallChat前端组件使用相关的问题,以及提供AI Agent学习指导、编程指导、数据查询以及流程图绘制等服务.",
  });
}

const agentPromise = initAgent().catch((error) => {
  agentInitError = error;
  console.error("❌ Agent 初始化失败:", error.message);
  console.log("💡 服务将继续运行，但AI功能将受限");
  // 不抛出错误，让服务继续运行
  return null;
});

async function getAgent() {
  if (agentInitError) {
    throw agentInitError;
  }
  const agent = await agentPromise;
  if (!agent) {
    throw new Error("Agent 初始化失败，请检查配置后重启服务");
  }
  return agent;
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
    const images = req.body?.images || [];
    const imgBase64 = req.body?.imgBase64 || "";
    const sessionId =
      typeof req.body?.session_id === "string" && req.body.session_id.trim()
        ? req.body.session_id.trim()
        : "default";
    const stream = req.body?.isStream === true;

    if (!message) {
      res.status(400).json({ error: "message 不能为空" });
      return;
    }
    let userMessages = message;
      if (images && images.length > 0) {
        userMessages = {
          text: message,
          images: images,
        };
    }
    if (imgBase64) {
      userMessages = {
        text: message,
        images: [imgBase64],
      };
    }

    if (!stream) {
      const response = await agent.chat(userMessages, null, null, sessionId);
      res.json({
        code: 0,
        result: {
           answer: response,
        },
        sessionId,
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
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    let hasSentEnd = false;

    try {
      const finalResponse = await agent.chat(
        userMessages,
        (chunk) => {
          if (!chunk) {
            return;
          }
          if (chunk.type === "done") {
            hasSentEnd = true;
            sendChunk({ code: 0, result: chunk.content || "", is_end: true });
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

// 添加进程错误处理，防止服务意外退出
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error.message);
  console.log('💡 服务继续运行...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  console.log('💡 服务继续运行...');
});


// 测试代码
// const testMain = async () => {
//   const agent = await getAgent();
//   const result = await agent.chat({
//     text: "这个图片中有什么?",
//     images: [
//       'https://gips0.baidu.com/it/u=3602773692,1512483864&fm=3028&app=3028&f=JPEG&fmt=auto?w=960&h=1280'
//     ]
//   }, chunk => {
//     // console.log(chunk);
//     process.stdout.write(chunk.content);
//   });
//   // console.log(result);
// };

// testMain();
