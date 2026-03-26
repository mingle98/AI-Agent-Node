// ========== Agent 核心逻辑 ==========

import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { concat } from "@langchain/core/utils/stream";
import { CONFIG } from "../config.js";
import { TOOLS, TOOL_DEFINITIONS, setScriptGeneratorLLM, TOOLS_NEEDING_SESSION_ID, toolNeedsSessionId } from "../tools/index.js";
import { searchKnowledgeBase } from "../tools/knowledge.js";
import { SKILLS, SKILL_DEFINITIONS } from "../skills/index.js";
import { buildSystemPrompt } from "./promptBuilder.js";
import { ContextManager } from "./contextManager.js";
import { CircuitBreaker, retryWithBackoff, withSessionLock, withTimeout } from "./resilience.js";
import { selectTaskMode, chatWithPlanExec } from "./planExecMode.js";
import { getToolDivBox } from "../utils/streamRenderer.js";

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

function emitToolEvent(callback, toolExcResult) {
  if (!callback || !toolExcResult) {
    return;
  }
  try {
    callback(null, toolExcResult);
  } catch (error) {
    // ignore callback errors to avoid breaking chat flow
  }
}

function extractReasoningContent(chunk) {
  const raw = chunk?.additional_kwargs?.__raw_response;
  const delta = raw?.choices?.[0]?.delta;
  if (!delta) {
    return "";
  }
  return typeof delta?.reasoning_content === "string" ? delta?.reasoning_content : "";
}

export class ProductionAgent {
  constructor(llm, vectorStore, embeddings, options = {}) {
    this.llm = llm;
    this.fallbackLlm = options.fallbackLlm || null;
    this.thinkingLlm = options.thinkingLlm || null;
    this.vectorStore = vectorStore;
    this.embeddings = embeddings;
    this.options = options;
    this.maxIterations = options.maxIterations || 5;
    this.defaultSessionId = options.defaultSessionId || "default";
    this.sessionTtlMs = options.sessionTtlMs || 30 * 60 * 1000;
    this.maxSessions = options.maxSessions || 300;

    this.resilience = {
      llmTimeoutMs: options.llmTimeoutMs || 5 * 60 * 1000,
      toolTimeoutMs: options.toolTimeoutMs || 5 * 60 * 1000,
      llmRetries: options.llmRetries || 2,
      toolRetries: options.toolRetries || 2,
      retryBaseDelayMs: options.retryBaseDelayMs || 250,
    };

    // ========== Plan+Exec 架构配置 ==========
    this.taskMode = options.taskMode || "auto";  // 'auto' | 'react' | 'plan_exec'
    this.complexityThreshold = options.complexityThreshold || 0.5;  // 复杂度阈值
    this.maxPlanSteps = options.maxPlanSteps || 10;  // 最大计划步骤数
    this.maxStepIterations = options.maxStepIterations || 3;  // 每个计划步骤的最大迭代次数

    this.systemPrompt = this.buildSystemPrompt();
    this.callableDefinitions = this.buildCallableDefinitions();
    // console.log('🧧callableDefinitions:', JSON.stringify(this.callableDefinitions, null, 2));

    // 为 pythonExecutor 注入 LLM 实例，启用 LLM 驱动的脚本生成
    setScriptGeneratorLLM(llm);

    // 兼容旧代码读取 this.messages
    this.sessions = new Map();
    this.messages = this.getOrCreateSession(this.defaultSessionId).messages;

    // 是否支持多模态（图片解析）
    this.multimodalEnabled = options.multimodalEnabled !== false; // 默认开启
  }

  buildSystemPrompt() {
    const systemPrompt = buildSystemPrompt(
      TOOL_DEFINITIONS,
      SKILL_DEFINITIONS,
      {
        roleName: this.options.roleName || "智能问答助手",
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

  async runToolCall(toolName, args, sessionId) {
    // 检查工具是否需要 sessionId 进行用户隔离
    if (toolNeedsSessionId(toolName)) {
      console.log(`[DEBUG] ${toolName}: sessionId=${sessionId}, args=`, args);
      if (!sessionId) {
        throw new Error('文件操作需要提供 sessionId');
      }
      // 在参数前插入 sessionId
      args = [sessionId, ...args];
      console.log(`[DEBUG] ${toolName}: 注入后 args=`, args);
    }
    
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
      return this.runToolCall(name, args, session.id);
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

  async invokeLLMWithResilience(session, messages, options = {}) {
    const { onChunk = null, streamEnabled = true, enableThinking } = options || {};
    const tools = this.getStructuredTools();

    const invokePrimary = async () => {
      if (!this.llm?.bindTools) {
        throw new Error("LLM does not support bindTools");
      }
      const baseLlm =
        streamEnabled && enableThinking === true && this.thinkingLlm
          ? this.thinkingLlm
          : this.llm;
      const model = baseLlm.bindTools(tools, { tool_choice: "auto" });
      if (streamEnabled) {
        return withTimeout(this.collectFromStream(model, messages, onChunk), this.resilience.llmTimeoutMs, "LLM stream");
      }
      return withTimeout(this.collectFromInvoke(model, messages), this.resilience.llmTimeoutMs, "LLM invoke");
    };

    const invokeFallback = async () => {
      if (!this.fallbackLlm) {
        return { message: new AIMessage("抱歉，服务暂时繁忙，请稍后重试。"), streamedText: false };
      }
      if (!this.fallbackLlm?.bindTools) {
        return { message: new AIMessage("抱歉，服务暂时繁忙，请稍后重试。"), streamedText: false };
      }
      const fallbackModel = this.fallbackLlm.bindTools(tools, { tool_choice: "auto" });
      if (streamEnabled) {
        return withTimeout(
          this.collectFromStream(fallbackModel, messages, onChunk),
          this.resilience.llmTimeoutMs,
          "Fallback LLM stream"
        );
      }
      return withTimeout(
        this.collectFromInvoke(fallbackModel, messages),
        this.resilience.llmTimeoutMs,
        "Fallback LLM invoke"
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
      const reasoningPart = extractReasoningContent(chunk);
      if (onChunk && (textPart || reasoningPart)) {
        if (textPart) {
          streamedText = true;
        }
        onChunk({ content: textPart, reasoning: reasoningPart });
      }
    }

    return {
      message: full || new AIMessage(""),
      streamedText,
    };
  }

  async collectFromInvoke(model, messages) {
    const message = await model.invoke(messages);
    console.log('🏷️ 模型非流式调用====》', message);
    return {
      message: message || new AIMessage(""),
      streamedText: false,
    };
  }

  /**
   * 构建多模态 HumanMessage 内容
   * @param {string|Object} input - 用户输入，可以是纯文本字符串或包含图片的对象
   * @param {string} input.text - 用户输入的文本
   * @param {Array<string>} input.images - 图片 URL 或 base64 编码数组
   * @returns {HumanMessage} LangChain HumanMessage 实例
   */
  buildHumanMessage(input) {
    // 纯文本输入（向后兼容）
    if (typeof input === "string") {
      return new HumanMessage(input);
    }

    // 多模态输入处理
    if (input && typeof input === "object") {
      const { text = "", images = [] } = input;
      
      // 如果没有图片或未启用多模态，按纯文本处理
      if (!this.multimodalEnabled || !images || images.length === 0) {
        return new HumanMessage(text);
      }

      // 构建多模态 content 数组
      const content = [];
      
      if (text) {
        content.push({ type: "text", text });
      }

      // 支持多种图片格式：URL 或 base64
      for (const image of images) {
        if (typeof image === "string") {
          // 判断是 URL 还是 base64
          if (image.startsWith("http://") || image.startsWith("https://") || image.startsWith("data:image/")) {
            content.push({
              type: "image_url",
              image_url: { url: image },
            });
          } else {
            // 假设是 base64，添加 data URI 前缀
            content.push({
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${image}` },
            });
          }
        }
      }

      return new HumanMessage({ content });
    }

    return new HumanMessage(String(input));
  }

  // ========== 会话锁包装器（供 planExecMode 调用） ==========
  async withSessionLockWrapper(fn, sessionId = this.defaultSessionId) {
    const session = this.getOrCreateSession(sessionId);
    return withSessionLock(session, fn);
  }

  // ========== 任务入口 ==========
  async chat(
    userInput,
    chunkCallback = null,
    fullResponseCallback = null,
    sessionId = this.defaultSessionId,
    requestOptions = {}
  ) {
    // ========== 模式选择 ==========
    const taskMode = selectTaskMode(this, userInput, requestOptions);

    // 如果是 Plan+Exec 模式，调用对应的处理逻辑
    if (taskMode === "plan_exec") {
      return chatWithPlanExec(
        this,
        userInput,
        chunkCallback,
        fullResponseCallback,
        sessionId,
        requestOptions
      );
    }

    // ========== ReAct 模式（原逻辑） ==========
    return this.chatWithReAct(
      userInput,
      chunkCallback,
      fullResponseCallback,
      sessionId,
      requestOptions
    );
  }

  /**
   * ReAct 模式执行
   */
  async chatWithReAct(
    userInput,
    chunkCallback = null,
    fullResponseCallback = null,
    sessionId = this.defaultSessionId,
    requestOptions = {}
  ) {
    const session = this.getOrCreateSession(sessionId);
    this.messages = session.messages;
    const streamEnabled = requestOptions?.streamEnabled ?? CONFIG.streamEnabled;
    const enableThinking = streamEnabled ? requestOptions?.enableThinking : undefined;
    if (this.options.debug) {
      console.log(`messages length is:`, this.messages?.length);
    }

    return withSessionLock(session, async () => {
      try {
        this.touchSession(session);
        const toolExcResults = [];
        const logText = typeof userInput === "string" ? userInput : (userInput?.text || "[多模态输入]");
        console.log(`👤 [${sessionId}] 用户: ${logText}`);
        const addMessage = this.buildHumanMessage(userInput);
        if (this.options.debug) {
          console.log(`👤 [${sessionId}] 用户消息:`, addMessage);
        }
        session.messages.push(addMessage);
        await this.manageContext(session);

        let iterations = 0;
        while (iterations < this.maxIterations) {
          iterations += 1;
          console.log(`🤖 [${sessionId}] 助手:`);

          const { message: aiResponse, streamedText } = await this.invokeLLMWithResilience(
            session,
            session.messages,
            {
              streamEnabled,
              enableThinking,
              onChunk: streamEnabled
                ? (chunk) => {
                  if (chunk?.reasoning) {
                    emitStreamEvent(chunkCallback, { type: "reasoning", content: chunk.reasoning });
                  }
                  if (chunk?.content) {
                    emitStreamEvent(chunkCallback, { type: "chunk", content: chunk.content });
                  }
                }
                : null,
            }
          );
          const toolCalls = aiResponse.tool_calls || [];

          const aiText = normalizeTextContent(aiResponse.content);

          if (toolCalls.length === 0) {
            session.messages.push(aiResponse);
            if (streamEnabled) {
              if (!streamedText) {
                emitStreamEvent(chunkCallback, { type: "chunk", content: aiText });
              }
              emitStreamEvent(chunkCallback, {
                type: "done",
                content: "",
                finalText: aiText,
              });
            }
            fullResponseCallback?.(aiText, toolExcResults);
            return aiText;
          }

          session.messages.push(aiResponse);

          if (streamEnabled) {
            emitStreamEvent(chunkCallback, { type: "status", content: getToolDivBox('⌛️ 【TOOL】正在调用工具/技能...', 'start') });
          }

          for (const toolCall of toolCalls) {
            if (streamEnabled) {
              emitStreamEvent(chunkCallback, {
                type: "status",
                content: getToolDivBox(`🚀  【TOOL】执行 ${toolCall.name}...`),
              });
            }
            const callable = this.callableDefinitions.get(toolCall.name);
            const startAt = Date.now();
            const result = await this.executeCallableWithResilience(
              session,
              toolCall.name,
              toolCall.args || {}
            );
            const endAt = Date.now();
            const toolExcResult = {
              toolName: toolCall.name,
              kind: callable?.kind || "tool",
              params: toolCall.args || {},
              toolCallId: toolCall.id,
              result,
              startAt,
              endAt,
              durationMs: endAt - startAt,
              ok: !(typeof result === "string" && result.includes("执行失败")),
            };
            toolExcResults.push(toolExcResult);
            emitToolEvent(chunkCallback, toolExcResult);
            console.log(`【TOOL】执行 ${toolCall.name}结果:${JSON.stringify(result)}`)
            const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);
            if (streamEnabled) {
              emitStreamEvent(chunkCallback, {
                type: "status",
                content: getToolDivBox(`✅  【TOOL】执行 ${toolCall.name} 完成`, 'end'),
              });
            }
            session.messages.push(new ToolMessage({
              content,
              tool_call_id: toolCall.id,
            }));
          }
        }

        throw new Error("达到最大迭代次数");
      } catch (error) {
        const errorMessage = error?.message || "未知错误";
        const fallbackText = "抱歉，服务暂时繁忙，请稍后重试。";

        if (streamEnabled) {
          emitStreamEvent(chunkCallback, {
            type: "error",
            content: "",
            message: errorMessage,
          });
          emitStreamEvent(chunkCallback, {
            type: "done",
            content: fallbackText,
            finalText: fallbackText,
          });
          fullResponseCallback?.(fallbackText, []);
          return fallbackText;
        }

        fullResponseCallback?.(fallbackText, []);
        return fallbackText;
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

  async reset(sessionId = this.defaultSessionId) {
    const session = this.getOrCreateSession(sessionId);
    return withSessionLock(session, async () => {
      this.touchSession(session);
      const firstSystemMessage = session.messages.find((m) => m._getType() === "system");
      session.messages = firstSystemMessage ? [firstSystemMessage] : [];
      session.contextManager.reset();
      console.log(`🔄 会话已重置: ${sessionId}`);
    });
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
