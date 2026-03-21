// ========== Express 服务：将 ProductionAgent 以接口形式提供给前端 ==========

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { ProductionAgent } from "./agent/ProductionAgent.js";
import { createLLM, createEmbeddings, createFallbackLLM } from "./llm.js";
import { loadOrBuildVectorStore } from "./utils/ragBuilder.js";
import {
  renderCustomComponents,
  buildCustomComponents,
  ensureAnswerHasCustomComponentPlaceholders,
} from "./utils/customComponentRenderer.js";
import { CONFIG } from "./config.js";
import { resolveThinkingMode } from "./utils/thinkingMode.js";
import { escapeHtml, wrapThinkingOpen, wrapThinkingClose } from "./utils/thinkingRenderer.js";
import { initWorkspace, getUserWorkspaceRoot, getUserStorageStats, checkUserStorageQuota } from './tools/fileManager.js';
import { TOOL_DEFINITIONS } from './tools/index.js';
import { initScheduler } from './tools/scheduler.js';
import multer from "multer";
import archiver from "archiver";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

let agentInitError = null;

// 辅助函数：格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

async function initAgent() {
  const llm = createLLM();
  const thinkingLlm = createLLM({ enableThinking: true });
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
    thinkingLlm,
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

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));
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
    const stream = typeof req.body?.isStream === "boolean" ? req.body.isStream : false;
    const { enableThinking } = resolveThinkingMode(req.body, stream);

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
      let toolExcResult = [];
      const response = await agent.chat(
        userMessages,
        null,
        (finalText, toolResults) => {
          if (Array.isArray(toolResults)) {
            toolExcResult = toolResults;
          }
          console.log('🧮 普通请求模式结束:', toolResults)
        },
        sessionId,
        { streamEnabled: stream }
      );

      const customComponents = buildCustomComponents(toolExcResult);
      const answer = ensureAnswerHasCustomComponentPlaceholders(response, customComponents);
      res.json({
        code: 0,
        result: {
           answer,
           customComponents,
           toolExcResult,
        },
        sessionId,
        response,
        toolExcResult,
        stats: agent.getStats(sessionId),
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "close");
    res.flushHeaders?.();

    let clientAborted = false;
    const onDisconnect = (reason) => {
      if (clientAborted) return;
      clientAborted = true;
      console.log("⛓️‍💥 SSE 客户端断开:", reason);
    };
    // fetch AbortController / network abort usually triggers 'aborted'
    req.on("aborted", () => onDisconnect("req.aborted"));
    // close fires when underlying connection closes
    req.on("close", () => onDisconnect("req.close"));
    // response close is often the most reliable signal for SSE
    res.on("close", () => onDisconnect("res.close"));
    // socket close for extra safety
    req.socket?.on?.("close", () => onDisconnect("socket.close"));

    const sendChunk = (payload) => {
      if (clientAborted || res.writableEnded) {
        return;
      }
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        onDisconnect("res.write.error");
      }
    };
    let hasSentEnd = false;
    const toolExcResults = [];
    let pending = Promise.resolve();
    // 是否正在思考中
    let isThinking = false;

    try {
      const finalResponse = await agent.chat(
        userMessages,
        (chunk, toolExcResult) => {
          pending = pending
            .then(async () => {
              if (clientAborted || res.writableEnded || hasSentEnd) {
                return;
              }
              if (toolExcResult) {
                console.log(`⏳⏳⏳工具调用结果: 调用工具是${toolExcResult.toolName}`);
                toolExcResults.push(toolExcResult);
              }
              if (!chunk) {
                return;
              }
              if (hasSentEnd) {
                return;
              }
              if (chunk.type === "done") {
                if (isThinking) {
                  sendChunk({ code: 0, result: wrapThinkingClose(), is_end: false });
                  isThinking = false;
                }
                await renderCustomComponents(toolExcResults, sendChunk, { sleepMs: 1000 });
                hasSentEnd = true;
                sendChunk({ code: 0, result: chunk.content || "", is_end: true });
                return;
              }
              if (chunk.type === "error") {
                if (isThinking) {
                  sendChunk({ code: 0, result: wrapThinkingClose(), is_end: false });
                  isThinking = false;
                }
                hasSentEnd = true;
                sendChunk({ code: 1, result: chunk.message || "未知错误", is_end: true });
                return;
              }
              if (chunk?.content) {
                if (chunk.type === "reasoning") {
                  if (!isThinking) {
                    console.log('=========思考内容=======');
                    isThinking = true;
                    sendChunk({ code: 0, result: wrapThinkingOpen(), is_end: false });
                  }
                  sendChunk({ code: 0, result: escapeHtml(chunk.content), is_end: false });
                } else {
                  if (isThinking) {
                    console.log('=========🤔 思考模式-正式内容=======');
                    sendChunk({ code: 0, result: wrapThinkingClose(), is_end: false });
                  }
                  isThinking = false;
                  sendChunk({ code: 0, result: chunk.content, is_end: false });
                }
              }
            })
            .catch((e) => {
              console.log('stream callback err', e);
            });
        },
        (fallbackText, toolExcResult) => {
          // console.log('🆑流结束===》', toolExcResult);
        },
        sessionId,
        { streamEnabled: stream, enableThinking }
      );

      await pending;
      // 兼容旧行为：如果底层没有发 done 事件，兜底补发一次
      if (!hasSentEnd) {
        if (isThinking) {
          sendChunk({ code: 0, result: wrapThinkingClose(), is_end: false });
          isThinking = false;
        }
        sendChunk({ code: 0, result: '', is_end: true });
      }
    } catch (error) {
      if (isThinking) {
        sendChunk({ code: 0, result: wrapThinkingClose(), is_end: false });
        isThinking = false;
      }
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
    await agent.reset(sessionId);
    res.json({ ok: true, sessionId });
  } catch (error) {
    console.log('session/reset error:', error);
    res.json({ ok: false, error: error?.message || '重置会话失败' });
  }
});

// ========== Tools 直调接口（用于调试页调用 file_list/file_read 等） ==========
const TOOL_MAP = new Map(TOOL_DEFINITIONS.map((t) => [t.name, t]));

app.post("/api/tools/:toolName", async (req, res) => {
  try {
    const toolName = req.params?.toolName;
    const tool = TOOL_MAP.get(toolName);
    if (!tool || typeof tool.func !== "function") {
      res.status(404).json({ success: false, error: "工具不存在" });
      return;
    }

    const sessionId =
      (typeof req.body?.session_id === "string" && req.body.session_id.trim())
        ? req.body.session_id.trim()
        : (typeof req.headers["x-session-id"] === "string" && req.headers["x-session-id"].trim())
          ? req.headers["x-session-id"].trim()
          : "default";

    // 仅开放文件相关工具给调试页使用（避免把所有 agent 工具直接暴露成 HTTP API）
    const allowedTools = new Set([
      "file_list",
      "file_read",
      "file_write",
      "file_delete",
      "file_mkdir",
      "file_move",
      "file_copy",
      "file_info",
      "file_search",
      "file_batch",
      "file_quota",
      "zip_compress",
      "zip_extract",
      "zip_info",
      "zip_list",
    ]);
    if (!allowedTools.has(toolName)) {
      res.status(403).json({ success: false, error: "该工具不允许通过 HTTP 直调" });
      return;
    }

    // tools/index.js 里的 file/zip 工具 func 都是 (sessionId, ...args)
    const args = Array.isArray(req.body?.args) ? req.body.args : [];
    const payload = req.body || {};
    const toolResult = await tool.func(
      sessionId,
      // 兼容 aisbc-debug.html 直接传参数字段的形式
      ...(toolName === "file_list"
        ? [payload.dirPath || "", Boolean(payload.recursive)]
        : toolName === "file_read"
          ? [payload.filePath, payload.maxSize]
          : toolName === "file_delete"
            ? [payload.filePath]
            : toolName === "file_quota"
              ? []
              : args)
    );

    res.json(toolResult);
  } catch (error) {
    console.error("工具调用错误:", error);
    res.status(500).json({ success: false, error: error?.message || "工具调用失败" });
  }
});

// ========== 文件上传接口 ==========
// 配置 multer 存储
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const sessionId = req.body?.session_id || req.headers['x-session-id'] || 'default';
      const uploadDir = path.join(getUserWorkspaceRoot(sessionId), 'uploadFile');
      
      // 确保目录存在
      await fs.mkdir(uploadDir, { recursive: true });
      
      cb(null, uploadDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，添加时间戳前缀避免冲突
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'binary').toString('utf-8');
    const safeName = `${timestamp}_${originalName}`;
    cb(null, safeName);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB 单文件限制
    files: 10 // 最多同时上传 10 个文件
  }
});

// 文件上传接口
app.post("/api/files/upload", upload.array("files", 10), async (req, res, next) => {
  try {
    const sessionId = req.body?.session_id || req.headers['x-session-id'] || 'default';
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '没有上传文件' 
      });
    }
    
    // 检查存储配额
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    try {
      await checkUserStorageQuota(sessionId, totalSize);
    } catch (quotaError) {
      // 删除已上传的文件
      for (const file of files) {
        try {
          await fs.unlink(file.path);
        } catch (e) {}
      }
      return res.status(413).json({
        success: false,
        error: quotaError.message
      });
    }
    
    // 构建上传结果
    const uploadResults = files.map(file => ({
      originalName: file.originalname,
      savedName: file.filename,
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
      path: `uploadFile/${file.filename}`,
      url: `http://${HOST}:${PORT}/workspace/${sessionId}/uploadFile/${file.filename}`
    }));
    
    res.json({
      success: true,
      sessionId,
      uploadedCount: files.length,
      files: uploadResults
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || '文件上传失败'
    });
  }
});

// 存储配额查询接口
app.get("/api/files/quota", async (req, res, next) => {
  try {
    const sessionId = req.query?.session_id || req.headers['x-session-id'] || 'default';
    const stats = await getUserStorageStats(sessionId);
    res.json(stats);
  } catch (error) {
    console.error('查询配额错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || '查询存储配额失败'
    });
  }
});

// 批量下载/压缩接口
app.post("/api/files/download", async (req, res, next) => {
  try {
    const sessionId = req.body?.session_id || req.headers['x-session-id'] || 'default';
    const filePaths = req.body?.files || [];
    const zipName = req.body?.zipName || `download_${Date.now()}.zip`;
    
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请提供要下载的文件列表'
      });
    }
    
    if (filePaths.length > 100) {
      return res.status(400).json({
        success: false,
        error: '批量下载最多支持 100 个文件'
      });
    }
    
    const userRoot = getUserWorkspaceRoot(sessionId);
    
    // 检查所有文件是否存在并收集有效文件
    const validFiles = [];
    for (const filePath of filePaths) {
      const absolutePath = path.join(userRoot, filePath);
      // 安全检查：确保路径在用户目录内
      if (!absolutePath.startsWith(userRoot)) {
        continue;
      }
      
      try {
        const stats = await fs.stat(absolutePath);
        if (stats.isFile()) {
          validFiles.push({
            path: absolutePath,
            relativePath: filePath,
            size: stats.size
          });
        }
      } catch (e) {
        // 文件不存在，跳过
      }
    }
    
    if (validFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: '没有找到有效的文件'
      });
    }
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);
    
    // 创建 ZIP 归档
    const archive = archiver('zip', {
      zlib: { level: 6 } // 压缩级别
    });
    
    archive.on('error', (err) => {
      console.error('归档错误:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: '创建压缩包失败'
        });
      }
    });
    
    archive.pipe(res);
    
    // 添加文件到压缩包
    for (const file of validFiles) {
      archive.file(file.path, { name: file.relativePath });
    }
    
    await archive.finalize();
    
  } catch (error) {
    console.error('批量下载错误:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || '批量下载失败'
      });
    }
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

const server = app.listen(PORT, HOST, async () => {
  console.log(`🚀 Express API 服务已启动: http://${HOST}:${PORT}`);
  console.log("可用接口:");
  console.log("  GET  /health");
  console.log("  POST /api/chat");
  console.log("  POST /api/session/reset");
  console.log("  POST /api/files/upload      - 文件上传（支持多文件，自动存储到用户 uploadFile 目录）");
  console.log("  GET  /api/files/quota       - 查询用户存储配额（200MB 限制）");
  console.log("  POST /api/files/download    - 批量下载/压缩为 ZIP");
  
  // 初始化文件管理系统 workspace
  try {
    const initResult = await initWorkspace();
    if (initResult.success) {
      console.log(`📁 Workspace 目录已就绪: ${initResult.path}`);
      console.log(`   文件访问地址: http://${HOST}:${PORT}/workspace/`);
    } else {
      console.error(`⚠️ Workspace 初始化失败: ${initResult.error}`);
    }
  } catch (error) {
    console.error(`⚠️ Workspace 初始化错误: ${error.message}`);
  }

  // 初始化任务调度器
  try {
    await initScheduler();
    console.log('⏰ 任务调度器已启动（支持定时任务持久化）');
  } catch (error) {
    console.error('⚠️ 任务调度器初始化失败:', error.message);
  }
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`❌ 端口占用: ${HOST}:${PORT} 已被其他进程使用`);
    console.error('💡 请先结束占用进程，或修改 PORT 后重试');
    process.exit(1);
  }

  if (error?.code === 'EACCES') {
    console.error(`❌ 端口权限不足: 无法监听 ${HOST}:${PORT}`);
    process.exit(1);
  }

  console.error('❌ 服务器启动失败:', error?.message || error);
  process.exit(1);
});

// 添加进程错误处理，防止服务意外退出
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error.message);
  if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES') {
    process.exit(1);
  }
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
