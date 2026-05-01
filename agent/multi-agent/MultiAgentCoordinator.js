import { AgentRegistry } from "./AgentRegistry.js";
import { ResultBus } from "./ResultBus.js";
import { SubAgentRunner } from "./SubAgentRunner.js";
import { DEFAULT_MULTI_AGENT_OPTIONS } from "./config.js";

function materializeSelectedProfiles(candidateProfiles, selectedItems = [], maxAgents = DEFAULT_MULTI_AGENT_OPTIONS.maxDelegatedTasksPerRound) {
  const byId = new Map(candidateProfiles.map((profile) => [profile.id, profile]));
  const result = [];

  for (const item of selectedItems) {
    const profileId = typeof item === "string" ? item : (item?.profileId || item?.id);
    const baseProfile = byId.get(profileId);
    if (!baseProfile) {
      continue;
    }
    const instanceIndex = result.length + 1;
    result.push({
      ...baseProfile,
      dispatchId: `${baseProfile.id}__${instanceIndex}`,
      taskInstruction: typeof item === "object" ? (item.task || item.instruction || item.focus || "") : "",
    });
    if (result.length >= maxAgents) {
      break;
    }
  }

  return result;
}

export class MultiAgentCoordinator {
  constructor({
    primaryAgent,
    registry = new AgentRegistry(),
    resultBus = new ResultBus(),
    subAgentFactory = null,
    subAgentOptions = {},
    defaultOptions = {},
  }) {
    if (!primaryAgent) {
      throw new Error("MultiAgentCoordinator requires primaryAgent");
    }
    this.primaryAgent = primaryAgent;
    this.registry = registry;
    this.resultBus = resultBus;
    this.debug = primaryAgent?.options?.debug === true || defaultOptions?.debug === true;
    this.defaultOptions = {
      ...DEFAULT_MULTI_AGENT_OPTIONS,
      ...defaultOptions,
    };
    this.subAgentRunner = new SubAgentRunner({
      primaryAgent,
      resultBus,
      subAgentFactory,
      subAgentOptions,
    });
    this.backgroundRuns = new Map();
    this.primaryAgent.multiAgentCoordinator = this;
  }

  getBackgroundEntry(parentRequestId) {
    return this.backgroundRuns.get(parentRequestId) || null;
  }

  buildParentRequestId(sessionId, requestOptions = {}) {
    return requestOptions.parentRequestId || `${sessionId}::multi::${Date.now()}`;
  }

  buildDelegationGuide(mergedOptions = {}) {
    const profiles = this.registry.listProfiles();
    const maxTasks = Number.isFinite(mergedOptions.maxDelegatedTasksPerRound)
      ? Math.max(1, mergedOptions.maxDelegatedTasksPerRound)
      : DEFAULT_MULTI_AGENT_OPTIONS.maxDelegatedTasksPerRound;
    const maxRounds = Number.isFinite(mergedOptions.maxDelegationRounds)
      ? Math.max(1, mergedOptions.maxDelegationRounds)
      : DEFAULT_MULTI_AGENT_OPTIONS.maxDelegationRounds;

    return [
      "你当前处于多 Agent 动态协调者模式。",
      `当你需要额外背景、方案比较或风险核查时，可以调用 delegate_subagents 发起子任务委派。最多允许 ${maxRounds} 轮委派，每轮最多 ${maxTasks} 个子任务。`,
      "delegate_subagents 的 arg1 必须是 JSON 字符串，格式示例：",
      '{"tasks":[{"profileId":"information_gatherer","task":"整理当前架构现状"},{"profileId":"solution_designer","task":"给出两种候选方案"}]}',
      "可用子 agent 列表：",
      ...profiles.map((profile) => `- ${profile.id}: ${profile.roleDescription || profile.roleName || profile.id}`),
      "只有在确实需要额外信息或专项分析时才委派；拿到子结果后继续下一步推理，不要提前结束。",
    ].join("\n");
  }

  async launchProfiles(profiles, userInput, sessionId, parentRequestId, chunkCallback = null, requestOptions = {}) {
    const mergedOptions = { ...this.defaultOptions, ...(requestOptions.multiAgent || {}) };
    const shouldEmitSubAgentEvents = mergedOptions.emitSubAgentEvents === true;
    const backgroundEntry = this.getBackgroundEntry(parentRequestId) || {
      parentRequestId,
      parentSessionId: sessionId,
      runEntries: [],
      rounds: [],
      allPromise: Promise.resolve([]),
      cleanupOnSettled: false,
    };
    const roundIndex = backgroundEntry.rounds.length + 1;
    const roundId = `${parentRequestId}::round${roundIndex}`;

    if (this.debug) {
      console.log(`🚀 [multi-agent][${parentRequestId}] 启动 subagents: count=${profiles.length}, session=${sessionId}, round=${roundIndex}`);
    }

    const runEntries = [];
    const runPromises = profiles.map((profile) => {
      const runEntry = {
        profileId: profile.id,
        dispatchId: profile.dispatchId || profile.id,
        taskTitle: profile.taskInstruction || "",
        subAgent: null,
        subSessionId: null,
        requestState: null,
        taskId: null,
        status: "pending",
      };
      runEntries.push(runEntry);

      return (async () => {
        let attempt = 0;
        let result = null;
        const retryCount = Number.isFinite(mergedOptions.subAgentRetryCount) ? Math.max(0, mergedOptions.subAgentRetryCount) : 1;
        const maxAttempts = retryCount + 1;

        while (attempt < maxAttempts) {
          attempt += 1;
          result = await this.subAgentRunner.run({
            parentSessionId: sessionId,
            parentRequestId,
            userInput,
            profile,
            taskId: `${roundId}::${profile.dispatchId || profile.id}::attempt${attempt}`,
            requestOptions,
            chunkCallback: null,
            onSubAgentReady: ({ subAgent, subSessionId, requestState, taskId }) => {
              runEntry.subAgent = subAgent;
              runEntry.subSessionId = subSessionId;
              runEntry.requestState = requestState;
              runEntry.taskId = taskId;
              runEntry.status = "running";
            },
            onSubAgentFinished: ({ result: finishedResult }) => {
              runEntry.status = finishedResult?.status || "done";
            },
          });

          if (result?.status === "done") {
            if (chunkCallback && shouldEmitSubAgentEvents) {
              chunkCallback({
                type: "subagent_result",
                agentLabel: profile.displayName || profile.roleName || "协同任务",
                taskTitle: profile.taskInstruction || "",
                taskId: result.taskId,
                status: "done",
                summary: profile.successSummary || `${profile.displayName || profile.roleName || "协同任务"}已完成`,
                resultSummary: result.summary,
                attempt,
              });
            }
            return result;
          }

          if (result?.errorType === "knowledge_mismatch") {
            if (this.debug) {
              console.warn(`🛑 [multi-agent][${parentRequestId}] 子 agent ${profile.id} 属于知识不匹配错误，停止重试: ${result?.error || result?.summary || result?.status}`);
            }
            break;
          }

          if (attempt < maxAttempts && this.debug) {
            console.warn(`🔁 [multi-agent][${parentRequestId}] 子 agent ${profile.id} 执行失败，准备重试第 ${attempt + 1} 次: ${result?.error || result?.status}`);
          }
        }

        if (chunkCallback && shouldEmitSubAgentEvents) {
          chunkCallback({
            type: "subagent_result",
            agentLabel: profile.displayName || profile.roleName || "协同任务",
            taskTitle: profile.taskInstruction || "",
            taskId: result?.taskId || `${parentRequestId}::${profile.dispatchId || profile.id}`,
            status: result?.status || "error",
            summary: result?.status === "aborted"
              ? `${profile.displayName || profile.roleName || "协同任务"}已中止`
              : (profile.failureSummary || `${profile.displayName || profile.roleName || "协同任务"}失败`),
            error: result?.error || "子任务执行失败",
            attempt,
          });
        }

        return result;
      })();
    });

    const allPromise = Promise.allSettled(runPromises);
    const roundEntry = {
      roundId,
      runEntries,
      runPromises,
      allPromise,
      settled: false,
    };

    backgroundEntry.runEntries.push(...runEntries);
    backgroundEntry.rounds.push(roundEntry);
    backgroundEntry.allPromise = Promise.allSettled(backgroundEntry.rounds.map((item) => item.allPromise));

    allPromise.finally(() => {
      roundEntry.settled = true;
      const latestEntry = this.backgroundRuns.get(parentRequestId);
      if (latestEntry?.cleanupOnSettled && latestEntry.rounds.every((item) => item.settled)) {
        this.clearParent(parentRequestId);
      }
    });

    this.backgroundRuns.set(parentRequestId, backgroundEntry);

    return {
      parentRequestId,
      roundId,
      profiles,
      runEntries,
      runPromises,
      allPromise,
    };
  }

  async runDelegatedTasks({ tasks = [], userInput = "", sessionId = "default", parentRequestId, chunkCallback = null, requestOptions = {} }) {
    const mergedOptions = { ...this.defaultOptions, ...(requestOptions.multiAgent || {}) };
    const maxTasks = Number.isFinite(mergedOptions.maxDelegatedTasksPerRound)
      ? Math.max(1, mergedOptions.maxDelegatedTasksPerRound)
      : DEFAULT_MULTI_AGENT_OPTIONS.maxDelegatedTasksPerRound;
    const candidateProfiles = this.registry.listProfiles();
    const profiles = materializeSelectedProfiles(candidateProfiles, tasks, maxTasks);
    const background = await this.launchProfiles(profiles, userInput, sessionId, parentRequestId, chunkCallback, requestOptions);
    const settled = await background.allPromise;
    const results = settled.map((item) => item.value).filter(Boolean);

    return {
      parentRequestId,
      roundId: background.roundId,
      launchedProfiles: background.profiles.map((profile) => profile.dispatchId || profile.id),
      results,
    };
  }

  getSubAgentResults(parentRequestId) {
    return this.resultBus.getTasksByParent(parentRequestId);
  }

  abortParentRequest(parentRequestId, reason = "multi-agent.abort") {
    const entry = this.getBackgroundEntry(parentRequestId);
    if (!entry) {
      return false;
    }
    let abortedCount = 0;
    for (const runEntry of entry.runEntries) {
      const aborted = this.subAgentRunner.abortSubAgentRun(runEntry, reason);
      if (aborted) {
        abortedCount += 1;
      }
    }
    entry.cleanupOnSettled = true;
    if (this.debug) {
      console.log(`🧹 [multi-agent][${parentRequestId}] 请求断开，已触发后台清理: aborted=${abortedCount}`);
    }
    return abortedCount > 0;
  }

  clearParent(parentRequestId) {
    this.resultBus.clearParent(parentRequestId);
    this.backgroundRuns.delete(parentRequestId);
  }

  clearSession(sessionId, options = {}) {
    const { abortRunning = true, reason = "multi-agent.session-reset" } = options;
    for (const [parentRequestId, entry] of this.backgroundRuns.entries()) {
      if (entry?.parentSessionId !== sessionId) {
        continue;
      }
      if (abortRunning) {
        this.abortParentRequest(parentRequestId, reason);
      }
      this.clearParent(parentRequestId);
    }
  }
}
