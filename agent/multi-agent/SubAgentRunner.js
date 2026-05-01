import { ProductionAgent } from "../ProductionAgent.js";
import { buildSubAgentPrompt, DEFAULT_MULTI_AGENT_OPTIONS } from "./config.js";

function normalizeText(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return String(input.text || "");
  return String(input || "");
}

function detectSubAgentFailureText(text) {
  const normalized = normalizeText(text).trim();
  if (!normalized) {
    return null;
  }

  const failurePatterns = [
    /服务暂时繁忙/,
    /请稍后重试/,
    /工具执行失败/,
    /技能执行失败/,
    /未找到工具/,
    /未找到技能/,
    /服务繁忙/,
    /执行失败/,
    /超时/,
  ];

  return failurePatterns.some((pattern) => pattern.test(normalized)) ? normalized : null;
}

function classifySubAgentError(text, explicitError = "") {
  const normalized = normalizeText(explicitError || text).trim();
  if (!normalized) {
    return null;
  }

  if (
    /未检索到/.test(normalized)
    || /不涉及/.test(normalized)
    || /无任何.*相关内容/.test(normalized)
    || /无.*文档记录/.test(normalized)
    || /知识库.*不涉及/.test(normalized)
    || /当前知识库内容.*前端/.test(normalized)
    || /客观事实.*直接匹配/.test(normalized)
    || /证据不足/.test(normalized)
  ) {
    return "knowledge_mismatch";
  }

  if (
    /服务暂时繁忙/.test(normalized)
    || /请稍后重试/.test(normalized)
    || /超时/.test(normalized)
    || /限流/.test(normalized)
  ) {
    return "transient";
  }

  return "generic";
}

function mergeCapabilities(baseSelection = {}, extraCapabilities = []) {
  const normalizedExtras = Array.isArray(extraCapabilities) ? extraCapabilities.filter(Boolean) : [];
  const toolNames = Array.from(new Set([
    ...(baseSelection.toolNames || []),
    ...normalizedExtras,
  ]));
  const skillNames = Array.isArray(baseSelection.skillNames) ? [...new Set(baseSelection.skillNames)] : [];
  return {
    ...baseSelection,
    toolNames,
    skillNames,
    capabilityNames: [...toolNames, ...skillNames],
  };
}

function buildCapabilitySelection(profile = {}, alwaysOnCapabilities = []) {
  const hasExplicitCapabilities = Object.prototype.hasOwnProperty.call(profile, "includeTools") || Object.prototype.hasOwnProperty.call(profile, "includeSkills");
  const toolNames = Array.isArray(profile.includeTools) ? [...new Set(profile.includeTools)] : [];
  const skillNames = Array.isArray(profile.includeSkills) ? [...new Set(profile.includeSkills)] : [];
  if (!hasExplicitCapabilities && toolNames.length === 0 && skillNames.length === 0) {
    return null;
  }
  return mergeCapabilities({
    hasExplicitCapabilities,
    toolNames,
    skillNames,
    capabilityNames: [...toolNames, ...skillNames],
  }, alwaysOnCapabilities);
}

function buildDefaultTaskPrompt(profile, userInput) {
  return buildSubAgentPrompt(profile, userInput);
}

function buildRoutingInput(profile, userInput) {
  const rawQuestion = normalizeText(userInput);
  const roleName = profile?.roleName || profile?.id || "SubAgent";
  const roleDescription = profile?.roleDescription || "异步执行子任务的辅助智能体";
  const taskGoal = typeof profile?.buildPrompt === "function"
    ? profile.buildPrompt(rawQuestion, userInput, profile?.taskInstruction || "")
    : buildDefaultTaskPrompt(profile, userInput);

  return [
    `角色名称：${roleName}`,
    `角色职责：${roleDescription}`,
    `子任务目标：${taskGoal}`,
    `用户原始问题：${rawQuestion}`,
  ].join("\n\n");
}

function createClonedAgent(primaryAgent, profile = {}, subAgentOptions = {}) {
  const cloned = new ProductionAgent(
    primaryAgent.llm,
    primaryAgent.vectorStore,
    primaryAgent.embeddings,
    {
      ...primaryAgent.options,
      ...subAgentOptions,
      roleName: profile.roleName || subAgentOptions.roleName || "SubAgent",
      roleDescription: profile.roleDescription || subAgentOptions.roleDescription || "异步执行子任务的辅助智能体",
      defaultSessionId: subAgentOptions.defaultSessionId,
      debug: subAgentOptions.debug ?? false,
      longTermMemoryEnabled: subAgentOptions.longTermMemoryEnabled ?? false,
      llmWikiAutoLearningEnabled: false,
      maxIterations: subAgentOptions.maxIterations || 4,
      taskMode: subAgentOptions.taskMode || "react",
      maxPlanSteps: subAgentOptions.maxPlanSteps || 4,
      maxStepIterations: subAgentOptions.maxStepIterations || 3,
      capabilityRoutingEnabled: subAgentOptions.capabilityRoutingEnabled ?? primaryAgent.capabilityRoutingEnabled,
    }
  );
  return cloned;
}

export class SubAgentRunner {
  constructor({ primaryAgent, resultBus, subAgentFactory = null, subAgentOptions = {} }) {
    this.primaryAgent = primaryAgent;
    this.resultBus = resultBus;
    this.subAgentFactory = subAgentFactory;
    this.subAgentOptions = subAgentOptions;
    this.debug = primaryAgent?.options?.debug === true || subAgentOptions?.debug === true;
    this.alwaysOnCapabilities = Array.isArray(subAgentOptions?.alwaysOnCapabilities)
      ? subAgentOptions.alwaysOnCapabilities.filter(Boolean)
      : DEFAULT_MULTI_AGENT_OPTIONS.subAgentAlwaysOnCapabilities;
  }

  abortSubAgentRun(runContext = {}, reason = "multi-agent.abort") {
    const { subAgent, subSessionId, requestState } = runContext;
    if (!subAgent || !subSessionId || !requestState?.id) {
      return false;
    }
    const session = subAgent.getOrCreateSession(subSessionId);
    return subAgent.abortRequest(session, requestState.id, reason);
  }

  createSubAgent(profile, sessionId) {
    if (typeof this.subAgentFactory === "function") {
      return this.subAgentFactory(profile, sessionId, this.primaryAgent);
    }
    return createClonedAgent(this.primaryAgent, profile, {
      ...this.subAgentOptions,
      defaultSessionId: sessionId,
    });
  }

  applyProfileCapabilities(subAgent, subSession, profile, userInput) {
    const capabilitySelection = buildCapabilitySelection(profile, this.alwaysOnCapabilities);
    if (capabilitySelection?.hasExplicitCapabilities) {
      subAgent.applyCapabilitySelectionToSession(subSession, capabilitySelection);
      if (this.debug) {
        console.log(`🧠 [subagent:${profile.id}] 使用静态能力: ${capabilitySelection.capabilityNames.join(", ") || "无"}`);
      }
      return {
        mode: capabilitySelection.capabilityNames.length > 0 ? "static_profile_capabilities" : "explicit_empty_capabilities",
        capabilityNames: capabilitySelection.capabilityNames,
        routingInput: null,
      };
    }

    if (subAgent.capabilityRoutingEnabled) {
      const routingInput = buildRoutingInput(profile, userInput);
      const capabilitySelectionFromIntent = mergeCapabilities(
        subAgent.resolveCapabilitySelection(routingInput),
        this.alwaysOnCapabilities
      );
      subAgent.applyCapabilitySelectionToSession(subSession, capabilitySelectionFromIntent);
      if (this.debug) {
        console.log(`🧠 [subagent:${profile.id}] 动态路由能力: ${capabilitySelectionFromIntent.capabilityNames.join(", ") || "无"}`);
        console.log(`🧠 [subagent:${profile.id}] routing input preview: ${routingInput.slice(0, 200)}`);
      }
      return {
        mode: "dynamic_capability_routing",
        capabilityNames: subSession.activeCapabilityNames || capabilitySelectionFromIntent.capabilityNames,
        routingInput,
      };
    }

    const fallbackSelection = mergeCapabilities({
      toolNames: [],
      skillNames: [],
      capabilityNames: [],
    }, this.alwaysOnCapabilities);
    subAgent.applyCapabilitySelectionToSession(subSession, fallbackSelection);
    if (this.debug) {
      console.log(`🧠 [subagent:${profile.id}] 使用默认常驻能力: ${fallbackSelection.capabilityNames.join(", ") || "无"}`);
    }
    return {
      mode: "always_on_capabilities",
      capabilityNames: subSession.activeCapabilityNames || fallbackSelection.capabilityNames,
      routingInput: null,
    };
  }

  async run({
    parentSessionId,
    parentRequestId,
    userInput,
    profile,
    taskId = null,
    requestOptions = {},
    chunkCallback = null,
    onSubAgentReady = null,
    onSubAgentFinished = null,
  }) {
    const dispatchKey = profile.dispatchId || profile.id;
    const resolvedTaskId = taskId || `${parentRequestId}::${dispatchKey}`;
    const subSessionId = `${parentSessionId}::sub::${dispatchKey}`;
    const startedAt = Date.now();

    if (this.debug) {
      console.log(`🚀 [subagent:${profile.id}][${resolvedTaskId}] 启动，session=${subSessionId}`);
    }

    if (this.resultBus) {
      this.resultBus.upsert({
        taskId: resolvedTaskId,
        parentRequestId,
        parentSessionId,
        subSessionId,
        profileId: profile.id,
        roleName: profile.roleName,
        displayName: profile.displayName,
        taskTitle: profile.taskInstruction || "",
        status: "running",
        startedAt,
      });
    }

    try {
      const subAgent = this.createSubAgent(profile, subSessionId);
      const subSession = subAgent.getOrCreateSession(subSessionId);
      const subRequestState = subAgent.createRequestState(subSessionId);
      onSubAgentReady?.({
        profile,
        subAgent,
        subSessionId,
        requestState: subRequestState,
        taskId: resolvedTaskId,
      });
      const capabilityMeta = this.applyProfileCapabilities(subAgent, subSession, profile, userInput);

      const finalText = await subAgent.chat(
        buildDefaultTaskPrompt(profile, userInput),
        null,
        null,
        subSessionId,
        {
          ...requestOptions,
          requestState: subRequestState,
          taskMode: "react",
          streamEnabled: false,
          enableThinking: false,
        }
      );

      const failureText = detectSubAgentFailureText(finalText);
      const inferredErrorType = failureText ? classifySubAgentError(finalText, failureText) : null;
      const finishedAt = Date.now();
      const result = this.resultBus.upsert({
        taskId: resolvedTaskId,
        parentRequestId,
        parentSessionId,
        subSessionId,
        profileId: profile.id,
        roleName: profile.roleName,
        displayName: profile.displayName,
        taskTitle: profile.taskInstruction || "",
        status: failureText ? "error" : "done",
        summary: typeof finalText === "string" ? finalText : String(finalText || ""),
        error: failureText || undefined,
        errorType: inferredErrorType || undefined,
        capabilityMode: capabilityMeta.mode,
        capabilityNames: subSession.activeCapabilityNames || capabilityMeta.capabilityNames,
        routingInput: capabilityMeta.routingInput,
        finishedAt,
        durationMs: finishedAt - startedAt,
      });

      if (this.debug) {
        const statusIcon = result.status === "done" ? "✅" : "❌";
        console.log(`${statusIcon} [subagent:${profile.id}][${resolvedTaskId}] ${result.status}，duration=${result.durationMs}ms${result.error ? `, error=${result.error}` : ""}`);
      }

      if (chunkCallback) {
        chunkCallback({
          type: "subagent_result",
          subagentId: profile.id,
          taskId: resolvedTaskId,
          status: result.status,
          summary: `${profile.roleName || profile.id} ${result.status === "done" ? "处理完成" : "处理失败"}`,
          resultSummary: result.summary,
          error: result.error,
        });
      }

      onSubAgentFinished?.({
        profile,
        subSessionId,
        taskId: resolvedTaskId,
        result,
      });

      return result;
    } catch (error) {
      const finishedAt = Date.now();
      const result = this.resultBus.upsert({
        taskId: resolvedTaskId,
        parentRequestId,
        parentSessionId,
        subSessionId,
        profileId: profile.id,
        roleName: profile.roleName,
        displayName: profile.displayName,
        taskTitle: profile.taskInstruction || "",
        status: error?.name === "AbortError" ? "aborted" : "error",
        error: error?.message || String(error),
        errorType: classifySubAgentError("", error?.message || String(error)) || undefined,
        finishedAt,
        durationMs: finishedAt - startedAt,
      });

      if (this.debug) {
        console.log(`❌ [subagent:${profile.id}][${resolvedTaskId}] ${result.status}: ${result.error}`);
      }

      if (chunkCallback) {
        chunkCallback({
          type: "subagent_result",
          subagentId: profile.id,
          taskId: resolvedTaskId,
          status: result.status,
          summary: `${profile.roleName || profile.id} ${result.status === "aborted" ? "已中止" : "处理失败"}`,
          error: result.error,
        });
      }

      onSubAgentFinished?.({
        profile,
        subSessionId,
        taskId: resolvedTaskId,
        result,
      });

      return result;
    }
  }
}
