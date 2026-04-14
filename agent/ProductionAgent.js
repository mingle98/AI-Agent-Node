// ========== Agent 核心逻辑 ==========

import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { concat } from "@langchain/core/utils/stream";
import { CONFIG } from "../config.js";
import { TOOLS, TOOL_DEFINITIONS, setScriptGeneratorLLM, toolNeedsSessionId } from "../tools/index.js";
import { searchKnowledgeBase } from "../tools/knowledge.js";
import { SKILLS, SKILL_DEFINITIONS } from "../skills/index.js";
import { buildSystemPrompt } from "./promptBuilder.js";
import { ContextManager } from "./contextManager.js";
import { CircuitBreaker, retryWithBackoff, withSessionLock, withTimeout } from "./resilience.js";
import { selectTaskMode, chatWithPlanExec } from "./planExecMode.js";
import { getToolDivBox } from "../utils/streamRenderer.js";
import { LongTermMemory, LTM_INJECT_START, LTM_INJECT_END } from "./longTermMemory.js";
import { selectActiveCapabilities, expandCapabilitiesToAll } from "./capabilityRouter.js";

// ========== 会话中止错误类 ==========
export class AbortError extends Error {
  constructor(message = "Session aborted by client") {
    super(message);
    this.name = "AbortError";
  }
}

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

function sanitizeToolArgs(args) {
  if (args === undefined) {
    return {};
  }
  if (args === null) {
    return null;
  }
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  if (typeof args === "object") {
    return args;
  }
  return args;
}

function sanitizeAIMessageForHistory(message) {
  if (!AIMessage.isInstance(message)) {
    return message;
  }

  const sanitizedToolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((toolCall) => ({
        ...toolCall,
        args: sanitizeToolArgs(toolCall?.args),
      }))
    : [];

  const sanitizedAdditionalToolCalls = Array.isArray(message.additional_kwargs?.tool_calls)
    ? message.additional_kwargs.tool_calls.map((toolCall) => ({
        ...toolCall,
        function: {
          ...toolCall?.function,
          arguments: JSON.stringify(sanitizeToolArgs(toolCall?.function?.arguments)),
        },
      }))
    : undefined;

  return new AIMessage({
    content: message.content,
    name: message.name,
    id: message.id,
    tool_calls: sanitizedToolCalls,
    invalid_tool_calls: [],
    additional_kwargs: {
      ...message.additional_kwargs,
      ...(sanitizedAdditionalToolCalls ? { tool_calls: sanitizedAdditionalToolCalls } : {}),
    },
    response_metadata: message.response_metadata,
    usage_metadata: message.usage_metadata,
  });
}

function extractReasoningContent(chunk) {
  const raw = chunk?.additional_kwargs?.__raw_response;
  const delta = raw?.choices?.[0]?.delta;
  if (!delta) {
    return "";
  }
  return typeof delta?.reasoning_content === "string" ? delta?.reasoning_content : "";
}

function formatToolResultForModel(result) {
  if (typeof result === "string") {
    return result;
  }

  if (!result || typeof result !== "object") {
    return JSON.stringify(result, null, 2);
  }

  const modelResult = { ...result };
  const preferredUrl = modelResult.fullUrl || modelResult.url || null;

  if (preferredUrl) {
    modelResult.linkUsage = {
      preferredUrl,
      instruction: "如果需要向用户展示可点击下载/访问链接，必须直接使用 fullUrl；若无 fullUrl 再使用 url。禁止根据 outputPath、path、sessionId 或 /workspace/... 手工拼接链接。"
    };
  }

  return JSON.stringify(modelResult, null, 2);
}

function extractMemoryBlock(systemPrompt = "") {
  if (typeof systemPrompt !== "string" || !systemPrompt) {
    return "";
  }
  const startIdx = systemPrompt.indexOf(LTM_INJECT_START);
  const endMarkerIdx = systemPrompt.indexOf(LTM_INJECT_END);
  if (startIdx < 0 || endMarkerIdx < 0) {
    return "";
  }
  const endIdx = endMarkerIdx + LTM_INJECT_END.length;
  if (endIdx <= startIdx) {
    return "";
  }
  return systemPrompt.substring(startIdx, endIdx);
}

export class ProductionAgent {
  constructor(llm, vectorStore, embeddings, options = {}) {
    this.llm = llm;
    this.fallbackLlm = options.fallbackLlm || null;
    this.thinkingLlm = options.thinkingLlm || null;
    this.vectorStore = vectorStore;
    this.embeddings = embeddings;
    this.options = options;
    this.maxIterations = options.maxIterations || 20;
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
    this.maxStepIterations = options.maxStepIterations || 5;  // 每个计划步骤的最大迭代次数

    // ========== 长期记忆配置 ==========
    this.longTermMemoryEnabled = options.longTermMemoryEnabled !== false;  // 默认开启
    this.longTermMemory = null;
    if (this.longTermMemoryEnabled) {
      this.longTermMemory = new LongTermMemory(this, {
        maxMemoryLength: options.maxMemoryLength || CONFIG.maxMemoryLength,
        updateInterval: options.memoryUpdateInterval || CONFIG.memoryUpdateInterval,
      });
    }

    this.capabilityRoutingEnabled = options.capabilityRoutingEnabled === true;
    this.compactSystemPrompt = options.compactSystemPrompt !== false;
    this.baseSystemPrompt = this.buildSystemPrompt();
    this.systemPrompt = this.baseSystemPrompt;
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
      console.log("📝 基础系统提示（全量能力模板，仅初始化展示）：");
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

  getStructuredTools(capabilityNames = null) {
    if (!Array.isArray(capabilityNames) || capabilityNames.length === 0) {
      return [...this.callableDefinitions.values()].map((item) => item.schema);
    }
    const allowed = new Set(capabilityNames);
    return [...this.callableDefinitions.values()]
      .filter((item) => allowed.has(item.name))
      .map((item) => item.schema);
  }

  resolveCapabilitySelection(userInput) {
    if (!this.capabilityRoutingEnabled) {
      return expandCapabilitiesToAll(TOOL_DEFINITIONS, SKILL_DEFINITIONS);
    }

    return selectActiveCapabilities({
      userInput,
      toolDefinitions: TOOL_DEFINITIONS,
      skillDefinitions: SKILL_DEFINITIONS,
      alwaysOnTools: this.options.alwaysOnTools || ["search_knowledge", "analyze_code", "exec_code"],
      alwaysOnSkills: this.options.alwaysOnSkills || [],
      maxTools: this.options.maxActiveTools || 14,
      maxSkills: this.options.maxActiveSkills || 8,
    });
  }

  buildSystemPromptForCapabilities(capabilitySelection) {
    const toolNames = capabilitySelection?.toolNames || [];
    const skillNames = capabilitySelection?.skillNames || [];

    const toolSet = new Set(toolNames);
    const skillSet = new Set(skillNames);

    const activeTools = TOOL_DEFINITIONS.filter((d) => toolSet.has(d.name));
    const activeSkills = SKILL_DEFINITIONS.filter((d) => skillSet.has(d.name));

    return buildSystemPrompt(activeTools, activeSkills, {
      roleName: this.options.roleName || "智能问答助手",
      roleDescription: this.options.roleDescription || "可以帮助用户解决问题",
      compact: this.compactSystemPrompt,
    });
  }

  applyCapabilitySelectionToSession(session, capabilitySelection) {
    const selected = capabilitySelection || expandCapabilitiesToAll(TOOL_DEFINITIONS, SKILL_DEFINITIONS);
    session.activeCapabilities = selected;
    session.activeCapabilityNames = selected.capabilityNames || [];

    const firstSystemMessage = session.messages.find((m) => m._getType && m._getType() === "system");
    const previousPrompt = typeof firstSystemMessage?.content === "string"
      ? firstSystemMessage.content
      : String(firstSystemMessage?.content || "");
    const existingMemoryBlock = extractMemoryBlock(previousPrompt);

    const rebuiltPrompt = this.buildSystemPromptForCapabilities(selected);
    session.activeSystemPrompt = existingMemoryBlock
      ? `${rebuiltPrompt}\n${existingMemoryBlock}`
      : rebuiltPrompt;

    if (this.options.debug) {
      console.log(
        `🧭 [${session.id}] 激活能力: tools=${selected.toolNames?.length || 0}, skills=${selected.skillNames?.length || 0}, total=${session.activeCapabilityNames.length}/${this.callableDefinitions.size}`
      );
      console.log(`🧭 [${session.id}] 能力清单: ${session.activeCapabilityNames.join(", ")}`);
      console.log(`🧠 [${session.id}] 记忆块保留: ${existingMemoryBlock ? "是" : "否"}`);
      console.log("\n" + "=".repeat(70));
      console.log(`📝 [${session.id}] 重构后系统提示（按激活能力）：`);
      console.log("=".repeat(70));
      console.log(session.activeSystemPrompt);
      console.log("=".repeat(70) + "\n");
    }

    const firstSystemIndex = session.messages.findIndex((m) => m._getType && m._getType() === "system");
    const nextSystemMessage = new SystemMessage(session.activeSystemPrompt);
    if (firstSystemIndex >= 0) {
      session.messages[firstSystemIndex] = nextSystemMessage;
    } else {
      session.messages.unshift(nextSystemMessage);
    }
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
      activeCapabilities: null,
      activeCapabilityNames: null,
      activeSystemPrompt: this.baseSystemPrompt,
      aborted: false,
      requestSeq: 0,
      requestStates: new Map(),
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

  abortSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.aborted = true;
    const requestIds = session.requestStates ? [...session.requestStates.keys()] : [];
    for (const requestId of requestIds) {
      this.abortRequest(session, requestId, "session.abort");
    }
    console.log(`🛑 [${sessionId}] Session 已标记为中止`);
    return true;
  }

  abortRequest(session, requestId, reason = "request.abort") {
    if (!session || !requestId) {
      return false;
    }
    const requestState = session.requestStates?.get(requestId);
    if (!requestState || requestState.aborted) {
      return false;
    }
    requestState.aborted = true;
    requestState.abortReason = reason;
    requestState.abortController?.abort?.(new AbortError(`[${session.id}] Request 已中止: ${reason}`));
    return true;
  }

  beginRequest(session) {
    if (!session.requestStates) {
      session.requestStates = new Map();
    }
    session.requestSeq = (session.requestSeq || 0) + 1;
    const requestId = `${session.id}#${session.requestSeq}`;
    const requestState = {
      id: requestId,
      aborted: false,
      abortReason: null,
      abortController: typeof AbortController === "function" ? new AbortController() : null,
    };
    session.requestStates.set(requestId, requestState);
    session.aborted = false;
    return requestState;
  }

  activateRequest(session, requestState) {
    if (!session || !requestState) {
      return requestState;
    }
    if (!session.requestStates?.has(requestState.id)) {
      session.requestStates?.set?.(requestState.id, requestState);
    }
    session.activeRequestId = requestState.id;
    session.aborted = false;
    return requestState;
  }

  endRequest(session, requestId) {
    if (!session || !requestId) {
      return;
    }
    if (session.requestStates) {
      session.requestStates.delete(requestId);
    }
    if (session.activeRequestId === requestId) {
      session.activeRequestId = null;
    }
    if (!session.requestStates || session.requestStates.size === 0) {
      session.aborted = false;
    }
  }

  isRequestAborted(session, requestState) {
    if (!session || !requestState) {
      return false;
    }
    if (requestState.aborted) {
      return true;
    }
    const signal = requestState.abortController?.signal;
    return signal?.aborted === true;
  }

  ensureRequestActive(session, requestState, sessionId = session?.id) {
    if (!this.isRequestAborted(session, requestState)) {
      return;
    }
    const reason = requestState?.abortReason || "request aborted";
    throw new AbortError(`[${sessionId}] Session 已中止 (${reason})`);
  }

  isSessionAborted(sessionId) {
    const session = this.sessions.get(sessionId);
    return session?.aborted === true;
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

  async runSkillCall(skillName, args, sessionId) {
    console.log(`[DEBUG] skill: ${skillName}, sessionId=${sessionId}, args=`, args);
    const skill = SKILLS[skillName];
    if (!skill) {
      throw new Error(`未找到技能 ${skillName}`);
    }
    return skill(...args, sessionId);
  }

  async executeCallableWithResilience(session, name, argsObject, requestState = null) {
    const callable = this.callableDefinitions.get(name);
    if (!callable) {
      return `错误：未找到可调用能力 ${name}`;
    }

    this.ensureRequestActive(session, requestState, session.id);

    const args = this.orderedArgsFromObject(argsObject, callable.orderedParamKeys);
    const run = async () => {
      this.ensureRequestActive(session, requestState, session.id);
      if (callable.kind === "skill") {
        return this.runSkillCall(name, args, session.id);
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
    const { onChunk = null, streamEnabled = true, enableThinking, capabilityNames = null, requestState = null } = options || {};
    const tools = this.getStructuredTools(capabilityNames || session?.activeCapabilityNames);

    if (this.options.debug) {
      console.log(`🧰 [${session?.id || "unknown"}] 本轮绑定工具/技能数量: ${tools.length}`);
    }

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
        return withTimeout(this.collectFromStream(model, messages, onChunk, session, requestState), this.resilience.llmTimeoutMs, "LLM stream");
      }
      return withTimeout(this.collectFromInvoke(model, messages, session, requestState), this.resilience.llmTimeoutMs, "LLM invoke");
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
          this.collectFromStream(fallbackModel, messages, onChunk, session, requestState),
          this.resilience.llmTimeoutMs,
          "Fallback LLM stream"
        );
      }
      return withTimeout(
        this.collectFromInvoke(fallbackModel, messages, session, requestState),
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

  async collectFromStream(model, messages, onChunk, session = null, requestState = null) {
    this.ensureRequestActive(session, requestState, session?.id);
    const signal = requestState?.abortController?.signal;
    const stream = signal
      ? await model.stream(messages, { signal })
      : await model.stream(messages);
    let full = null;
    let streamedText = false;

    try {
      for await (const chunk of stream) {
        this.ensureRequestActive(session, requestState, session?.id);
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
    } finally {
      if (this.isRequestAborted(session, requestState) && typeof stream?.return === "function") {
        try {
          await stream.return();
        } catch {
          // ignore stream cleanup errors
        }
      }
    }

    this.ensureRequestActive(session, requestState, session?.id);
    return {
      message: full || new AIMessage(""),
      streamedText,
    };
  }

  async collectFromInvoke(model, messages, session = null, requestState = null) {
    this.ensureRequestActive(session, requestState, session?.id);
    const signal = requestState?.abortController?.signal;
    const message = signal
      ? await model.invoke(messages, { signal })
      : await model.invoke(messages);
    this.ensureRequestActive(session, requestState, session?.id);
    console.log('🏷️ 模型非流式调用====》', message);
    return {
      message: message || new AIMessage(""),
      streamedText: false,
    };
  }

  /**
   * 独立的记忆提取 LLM 调用，不走主链路 resilience 机制，避免污染 CircuitBreaker
   * @param {Array} messages - 包含系统提示的消息数组
   * @returns {Promise<string>} - LLM 返回的文本内容
   */
  async extractMemoryWithLLM(messages) {
    if (!this.llm) {
      throw new Error("LLM 未配置");
    }

    const extractTimeoutMs = 5 * 60 * 1000; // 5 分钟超时，与主链路一致

    try {
      const { message } = await withTimeout(
        this.collectFromInvoke(this.llm, messages),
        extractTimeoutMs,
        "Memory extraction LLM"
      );
      return normalizeTextContent(message.content);
    } catch (error) {
      console.error(`❌ [记忆] 独立 LLM 调用失败: ${error.message}`);
      throw error;
    }
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

  createRequestState(sessionId = this.defaultSessionId) {
    const session = this.getOrCreateSession(sessionId);
    return this.beginRequest(session);
  }

  // ========== 任务入口 ==========
  async chat(
    userInput,
    chunkCallback = null,
    fullResponseCallback = null,
    sessionId = this.defaultSessionId,
    requestOptions = {}
  ) {
    // ========== 模式选择（异步智能决策） ==========
    const session = this.getOrCreateSession(sessionId);
    const requestState = requestOptions?.requestState || this.beginRequest(session);
    const nextRequestOptions = { ...(requestOptions || {}), requestState };
    const sessionHistory = session.messages;

    this.ensureRequestActive(session, requestState, sessionId);

    // ========== 长期记忆注入（首次对话或有记忆文件时） ==========
    if (this.longTermMemory) {
      try {
        // 如果有记忆文件且未注入，先注入
        const hasMemory = await this.longTermMemory.hasMemoryFile(sessionId);
        if (hasMemory) {
          await this.longTermMemory.injectMemory(sessionId, session);
        }
      } catch (error) {
        console.warn(`⚠️ [记忆] ${sessionId} 记忆注入失败: ${error.message}`);
      }
    }

    if (this.capabilityRoutingEnabled) {
      const capabilitySelection = this.resolveCapabilitySelection(userInput);
      this.applyCapabilitySelectionToSession(session, capabilitySelection);
    }

    const taskMode = await selectTaskMode(this, userInput, requestOptions, sessionHistory);

    // 如果是 Plan+Exec 模式，调用对应的处理逻辑
    if (taskMode === "plan_exec") {
      return chatWithPlanExec(
        this,
        userInput,
        chunkCallback,
        fullResponseCallback,
        sessionId,
        nextRequestOptions
      );
    }

    // ========== ReAct 模式（原逻辑） ==========
    return this.chatWithReAct(
      userInput,
      chunkCallback,
      fullResponseCallback,
      sessionId,
      nextRequestOptions
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
    const requestState = requestOptions?.requestState || this.beginRequest(session);
    this.activateRequest(session, requestState);
    this.messages = session.messages;
    const streamEnabled = requestOptions?.streamEnabled ?? CONFIG.streamEnabled;
    const enableThinking = streamEnabled ? requestOptions?.enableThinking : undefined;
    // 内部参数：仅用于 plan_exec 回退 ReAct 时避免重复写入同一条用户消息
    const skipUserMessageAppend = requestOptions?.skipUserMessageAppend === true;

    if (this.capabilityRoutingEnabled && (!session.activeCapabilityNames || session.activeCapabilityNames.length === 0)) {
      const capabilitySelection = this.resolveCapabilitySelection(userInput);
      this.applyCapabilitySelectionToSession(session, capabilitySelection);
    }

    if (this.options.debug) {
      console.log(`messages length is:`, this.messages?.length);
    }

    return withSessionLock(session, async () => {
      try {
        this.ensureRequestActive(session, requestState, sessionId);

        this.touchSession(session);
        const toolExcResults = [];
        const logText = typeof userInput === "string" ? userInput : (userInput?.text || "[多模态输入]");
        console.log(`👤 [${sessionId}] 用户: ${logText}`);
        if (!skipUserMessageAppend) {
          const addMessage = this.buildHumanMessage(userInput);
          if (this.options.debug) {
            console.log(`👤 [${sessionId}] 用户消息:`, addMessage.toString());
          }
          session.messages.push(addMessage);
          await this.manageContext(session);
        }

        let iterations = 0;
        while (iterations < this.maxIterations) {
          iterations += 1;
          console.log(`🤖 [${sessionId}] 助手:`);

          this.ensureRequestActive(session, requestState, sessionId);

          const { message: aiResponse, streamedText } = await this.invokeLLMWithResilience(
            session,
            session.messages,
            {
              streamEnabled,
              enableThinking,
              onChunk: streamEnabled
                ? (chunk) => {
                  if (this.isRequestAborted(session, requestState)) return;
                  if (chunk?.reasoning) {
                    emitStreamEvent(chunkCallback, { type: "reasoning", content: chunk.reasoning });
                  }
                  if (chunk?.content) {
                    emitStreamEvent(chunkCallback, { type: "chunk", content: chunk.content });
                  }
                }
                : null,
              requestState,
            }
          );

          this.ensureRequestActive(session, requestState, sessionId);

          const normalizedAiResponse = sanitizeAIMessageForHistory(aiResponse);
          const toolCalls = normalizedAiResponse.tool_calls || [];

          const aiText = normalizeTextContent(normalizedAiResponse.content);

          if (toolCalls.length === 0) {
            const shouldExpandCapabilities =
              this.capabilityRoutingEnabled &&
              iterations === 1 &&
              (session.activeCapabilityNames?.length || 0) < this.callableDefinitions.size &&
              !aiText.trim();

            if (shouldExpandCapabilities) {
              const expanded = expandCapabilitiesToAll(TOOL_DEFINITIONS, SKILL_DEFINITIONS);
              this.applyCapabilitySelectionToSession(session, expanded);
              if (this.options.debug) {
                console.log(`🔁 [${sessionId}] 首轮无输出，扩展为全量能力后重试`);
              }
              continue;
            }

            session.messages.push(normalizedAiResponse);
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

            // ========== 长期记忆更新检查 ==========
            if (this.longTermMemory) {
              try {
                await this.longTermMemory.checkAndUpdateMemory(sessionId, session);
              } catch (error) {
                console.warn(`⚠️ [记忆] ${sessionId} 记忆更新失败: ${error.message}`);
              }
            }

            return aiText;
          }

          // 工具调用前检查 abort
          this.ensureRequestActive(session, requestState, sessionId);

          session.messages.push(normalizedAiResponse);

          if (streamEnabled) {
            emitStreamEvent(chunkCallback, { type: "status", content: getToolDivBox('⌛️ 【TOOL】正在调用工具/技能...', 'start') });
          }

          for (const toolCall of toolCalls) {
            this.ensureRequestActive(session, requestState, sessionId);

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
              toolCall.args || {},
              requestState
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
            const content = formatToolResultForModel(result);
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
        const isAbortError = error instanceof AbortError;
        const errorMessage = error?.message || "未知错误";
        const fallbackText = isAbortError ? "请求已被中止" : "抱歉，服务暂时繁忙，请稍后重试。";

        // ========== 长期记忆更新检查（即使出错也检查） ==========
        if (this.longTermMemory) {
          try {
            await this.longTermMemory.checkAndUpdateMemory(sessionId, session);
          } catch (error) {
            console.warn(`⚠️ [记忆] ${sessionId} 记忆更新失败: ${error.message}`);
          }
        }

        if (streamEnabled) {
          // AbortError 不发送 error 事件，静默中止
          if (!isAbortError) {
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
          }
          return fallbackText;
        }

        fullResponseCallback?.(fallbackText, []);
        return fallbackText;
      } finally {
        this.endRequest(session, requestState.id);
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

      // 重置长期记忆状态（保留记忆文件，只清除内存状态）
      if (this.longTermMemory) {
        this.longTermMemory.resetSessionMemoryState(sessionId);
      }

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
