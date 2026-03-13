// ========== Agent 核心逻辑 ==========

import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { concat } from "@langchain/core/utils/stream";
import { CONFIG } from "../config.js";
import { TOOLS, TOOL_DEFINITIONS } from "../tools/index.js";
import { searchKnowledgeBase } from "../tools/knowledge.js";
import { SKILLS, SKILL_DEFINITIONS } from "../skills/index.js";
import { buildSystemPrompt } from "./promptBuilder.js";
import { ContextManager } from "./contextManager.js";
import { CircuitBreaker, retryWithBackoff, withSessionLock, withTimeout } from "./resilience.js";

function normalizeTextContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part?.text || ""))).join("");
  }
  return String(content || "");
}

function toJsonSchemaType(type) {
  switch (type) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

function emitStreamEvent(callback, payload) {
  if (!callback || !payload || typeof payload !== "object") {
    return;
  }
  callback(payload);
}

export class ProductionAgent {
  constructor(llm, vectorStore, embeddings, options = {}) {
    this.llm = llm;
    this.fallbackLlm = options.fallbackLlm || null;
    this.vectorStore = vectorStore;
    this.embeddings = embeddings;
    this.options = options;
    this.maxIterations = options.maxIterations || 5;
    this.defaultSessionId = options.defaultSessionId || "default";
    this.sessionTtlMs = options.sessionTtlMs || 30 * 60 * 1000; // 默认30分钟无访问过期
    this.maxSessions = options.maxSessions || 300; // 默认最多保留300个会话

    this.resilience = {
      llmTimeoutMs: options.llmTimeoutMs || 25000,
      toolTimeoutMs: options.toolTimeoutMs || 8000,
      llmRetries: options.llmRetries || 2,
      toolRetries: options.toolRetries || 2,
      retryBaseDelayMs: options.retryBaseDelayMs || 250,
    };

    this.systemPrompt = this.buildSystemPrompt();
    this.callableDefinitions = this.buildCallableDefinitions();
    // console.log('🧧callableDefinitions:', JSON.stringify(this.callableDefinitions, null, 2));

    // 兼容旧代码读取 this.messages
    this.sessions = new Map();
    this.messages = this.getOrCreateSession(this.defaultSessionId).messages;
  }

  buildSystemPrompt() {
    const systemPrompt = buildSystemPrompt(
      TOOL_DEFINITIONS,
      SKILL_DEFINITIONS,
      {
        roleName: this.options.roleName || "智能客服助手",
        roleDescription: this.options.roleDescription || "可以帮助用户解决问题",
      }
    );

    if (this.options.debug) {
      console.log("\n" + "=".repeat(70));
      console.log("📝 系统提示：");
      console.log("=".repeat(70));
      console.log(systemPrompt);
      console.log("=".repeat(70) + "\n");
    }

    return systemPrompt;
  }

  buildCallableDefinitions() {
    const allDefs = [
      ...TOOL_DEFINITIONS.map((def) => ({ ...def, kind: "tool" })),
      ...SKILL_DEFINITIONS.map((def) => ({ ...def, kind: "skill" })),
    ];
    // console.log('🧧buildCallableDefinitions 所有定义:', allDefs);

    const callableMap = new Map();
    for (const def of allDefs) {
      const properties = {};
      const required = [];
      const orderedParamKeys = [];

      (def.params || []).forEach((param, idx) => {
        const key = `arg${idx + 1}`;
        orderedParamKeys.push(key);
        required.push(key);
        properties[key] = {
          type: toJsonSchemaType(param.type),
          description: `${param.name}${param.options ? `，可选值: ${param.options.join("、")}` : ""}`,
        };
      });

      callableMap.set(def.name, {
        ...def,
        orderedParamKeys,
        schema: {
          type: "function",
          function: {
            name: def.name,
            description: `[${def.kind === "skill" ? "技能" : "工具"}] ${def.description}`,
            parameters: {
              type: "object",
              properties,
              required,
              additionalProperties: false,
            },
          },
        },
      });
    }

    return callableMap;
  }

  getStructuredTools() {
    return [...this.callableDefinitions.values()].map((item) => item.schema);
  }

  createSession(sessionId) {
    const now = Date.now();
    const contextManager = new ContextManager(this.llm, this.embeddings, {
      strategy: this.options.contextStrategy || "trim",
      maxHistoryMessages: this.options.maxHistoryMessages || CONFIG.maxHistoryMessages,
      keepRecentMessages: this.options.keepRecentMessages || 10,
      summaryInterval: this.options.summaryInterval || 10,
    });

    const session = {
      id: sessionId,
      createdAt: now,
      lastActiveAt: now,
      messages: [new SystemMessage(this.systemPrompt)],
      contextManager,
      lock: Promise.resolve(),
      llmBreaker: new CircuitBreaker({
        failureThreshold: this.options.llmFailureThreshold || 3,
        cooldownMs: this.options.llmBreakerCooldownMs || 20000,
      }),
      toolBreaker: new CircuitBreaker({
        failureThreshold: this.options.toolFailureThreshold || 3,
        cooldownMs: this.options.toolBreakerCooldownMs || 10000,
      }),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  touchSession(session) {
    session.lastActiveAt = Date.now();
  }

  cleanupExpiredSessions() {
    if (!this.sessionTtlMs || this.sessionTtlMs <= 0) {
      return;
    }
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveMs = now - (session.lastActiveAt || 0);
      if (inactiveMs > this.sessionTtlMs) {
        this.sessions.delete(sessionId);
      }
    }
  }

  cleanupOverflowSessions() {
    if (this.sessions.size <= this.maxSessions) {
      return;
    }
    const sorted = [...this.sessions.entries()]
      .sort((a, b) => (a[1].lastActiveAt || 0) - (b[1].lastActiveAt || 0));
    const overflowCount = this.sessions.size - this.maxSessions;
    for (let i = 0; i < overflowCount; i++) {
      this.sessions.delete(sorted[i][0]);
    }
  }

  getOrCreateSession(sessionId = this.defaultSessionId) {
    // 每次访问时做一次轻量清理，避免会话无限增长
    this.cleanupExpiredSessions();
    this.cleanupOverflowSessions();

    if (!this.sessions.has(sessionId)) {
      return this.createSession(sessionId);
    }
    const session = this.sessions.get(sessionId);
    this.touchSession(session);
    return session;
  }

  async manageContext(session) {
    session.messages = await session.contextManager.manageContext(session.messages);
  }

  orderedArgsFromObject(argObj = {}, orderedKeys = []) {
    if (!argObj || typeof argObj !== "object") {
      return [];
    }
    if (orderedKeys.length > 0) {
      return orderedKeys.map((key) => argObj[key]);
    }
    return Object.keys(argObj)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((key) => argObj[key]);
  }

  async runToolCall(toolName, args) {
    if (toolName === "search_knowledge") {
      return searchKnowledgeBase(this.vectorStore, args[0]);
    }
    const tool = TOOLS[toolName];
    if (!tool) {
      throw new Error(`未找到工具 ${toolName}`);
    }
    return tool(...args);
  }

  async runSkillCall(skillName, args) {
    const skill = SKILLS[skillName];
    if (!skill) {
      throw new Error(`未找到技能 ${skillName}`);
    }
    return skill(...args);
  }

  async executeCallableWithResilience(session, name, argsObject) {
    const callable = this.callableDefinitions.get(name);
    if (!callable) {
      return `错误：未找到可调用能力 ${name}`;
    }

    const args = this.orderedArgsFromObject(argsObject, callable.orderedParamKeys);
    const run = async () => {
      if (callable.kind === "skill") {
        return this.runSkillCall(name, args);
      }
      return this.runToolCall(name, args);
    };

    if (!session.toolBreaker.canRequest()) {
      return `服务繁忙：${name} 暂时不可用，请稍后重试。`;
    }

    try {
      const result = await retryWithBackoff(
        async () => withTimeout(run(), this.resilience.toolTimeoutMs, `${name} execution`),
        {
          maxAttempts: this.resilience.toolRetries,
          baseDelayMs: this.resilience.retryBaseDelayMs,
        }
      );
      session.toolBreaker.recordSuccess();
      return result;
    } catch (error) {
      session.toolBreaker.recordFailure();
      return `${callable.kind === "skill" ? "技能" : "工具"}执行失败：${error.message}`;
    }
  }

  async invokeLLMWithResilience(session, messages, onChunk = null) {
    const tools = this.getStructuredTools();
    const invokePrimary = async () => {
      if (!this.llm?.bindTools) {
        throw new Error("LLM does not support bindTools");
      }
      const model = this.llm.bindTools(tools, { tool_choice: "auto" });
      return withTimeout(this.collectFromStream(model, messages, onChunk), this.resilience.llmTimeoutMs, "LLM stream");
    };

    const invokeFallback = async () => {
      if (!this.fallbackLlm) {
        return { message: new AIMessage("抱歉，服务暂时繁忙，请稍后重试。"), streamedText: false };
      }
      if (!this.fallbackLlm?.bindTools) {
        return { message: new AIMessage("抱歉，服务暂时繁忙，请稍后重试。"), streamedText: false };
      }
      const fallbackModel = this.fallbackLlm.bindTools(tools, { tool_choice: "auto" });
      return withTimeout(
        this.collectFromStream(fallbackModel, messages, onChunk),
        this.resilience.llmTimeoutMs,
        "Fallback LLM stream"
      );
    };

    if (!session.llmBreaker.canRequest()) {
      return invokeFallback();
    }

    try {
      const result = await retryWithBackoff(invokePrimary, {
        maxAttempts: this.resilience.llmRetries,
        baseDelayMs: this.resilience.retryBaseDelayMs,
      });
      session.llmBreaker.recordSuccess();
      return result;
    } catch (error) {
      session.llmBreaker.recordFailure();
      console.error(`  ❌ LLM 调用失败（主链路）: ${error.message}`);
      return invokeFallback();
    }
  }

  async collectFromStream(model, messages, onChunk) {
    const stream = await model.stream(messages);
    let full = null;
    let streamedText = false;

    for await (const chunk of stream) {
      full = full ? concat(full, chunk) : chunk;
      const textPart = normalizeTextContent(chunk.content);
      if (onChunk && textPart) {
        streamedText = true;
        onChunk({ content: textPart });
      }
    }

    return {
      message: full || new AIMessage(""),
      streamedText,
    };
  }

  async chat(userInput, chunkCallback = null, fullResponseCallback = null, sessionId = this.defaultSessionId) {
    const session = this.getOrCreateSession(sessionId);
    this.messages = session.messages;

    return withSessionLock(session, async () => {
      try {
        this.touchSession(session);
        console.log(`👤 [${sessionId}] 用户: ${userInput}`);
        session.messages.push(new HumanMessage(userInput));
        await this.manageContext(session);

        let iterations = 0;
        while (iterations < this.maxIterations) {
          iterations += 1;
          console.log(`🤖 [${sessionId}] 助手:`);

          const { message: aiResponse, streamedText } = await this.invokeLLMWithResilience(
            session,
            session.messages,
            CONFIG.streamEnabled
              ? (chunk) => emitStreamEvent(chunkCallback, { type: "chunk", content: chunk?.content || "" })
              : null
          );
          const toolCalls = aiResponse.tool_calls || [];

          const aiText = normalizeTextContent(aiResponse.content);

          if (toolCalls.length === 0) {
            session.messages.push(aiResponse);
            if (CONFIG.streamEnabled) {
              if (!streamedText) {
                emitStreamEvent(chunkCallback, { type: "chunk", content: aiText });
              }
              emitStreamEvent(chunkCallback, {
                type: "done",
                content: "",
                finalText: aiText,
              });
            } else {
              fullResponseCallback?.(aiText);
            }
            return aiText;
          }

          session.messages.push(aiResponse);

          if (CONFIG.streamEnabled) {
            emitStreamEvent(chunkCallback, { type: "status", content: "\n[正在调用工具/技能...]\n" });
          }

          for (const toolCall of toolCalls) {
            if (CONFIG.streamEnabled) {
              emitStreamEvent(chunkCallback, {
                type: "status",
                content: `\n[执行 ${toolCall.name}]\n`,
              });
            }
            const result = await this.executeCallableWithResilience(
              session,
              toolCall.name,
              toolCall.args || {}
            );
            const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);

            session.messages.push(new ToolMessage({
              content,
              tool_call_id: toolCall.id,
            }));
          }
        }

        throw new Error("达到最大迭代次数");
      } catch (error) {
        if (CONFIG.streamEnabled) {
          emitStreamEvent(chunkCallback, {
            type: "error",
            content: "",
            message: error?.message || "未知错误",
          });
        }
        throw error;
      }
    });
  }

  getStats(sessionId = this.defaultSessionId) {
    const session = this.getOrCreateSession(sessionId);
    const userMsgs = session.messages.filter((m) => m._getType() === "human").length;
    const aiMsgs = session.messages.filter((m) => m._getType() === "ai").length;
    return {
      sessionId,
      totalMessages: session.messages.length,
      userMessages: userMsgs,
      aiMessages: aiMsgs,
      conversationRounds: Math.min(userMsgs, aiMsgs),
      activeSessions: this.sessions.size,
    };
  }

  reset(sessionId = this.defaultSessionId) {
    const session = this.getOrCreateSession(sessionId);
    const firstSystemMessage = session.messages.find((m) => m._getType() === "system");
    session.messages = firstSystemMessage ? [firstSystemMessage] : [];
    session.contextManager.reset();
    console.log(`🔄 会话已重置: ${sessionId}`);
  }

  getContextStrategy(sessionId = this.defaultSessionId) {
    return this.getOrCreateSession(sessionId).contextManager.config.strategy;
  }

  setContextStrategy(strategy) {
    for (const session of this.sessions.values()) {
      session.contextManager.config.strategy = strategy;
    }
    this.options.contextStrategy = strategy;
    console.log(`🔄 上下文策略已切换为: ${strategy}`);
  }
}
