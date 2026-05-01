import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage } from "@langchain/core/messages";
import { ProductionAgent } from "../agent/ProductionAgent.js";
import { MultiAgentCoordinator } from "../agent/multi-agent/index.js";
import {
  DEFAULT_MULTI_AGENT_OPTIONS,
  DEFAULT_SUBAGENT_PROFILES,
  MULTI_AGENT_UI_CONFIG,
  buildMultiAgentSelectorPrompt,
  buildSubAgentPrompt,
} from "../agent/multi-agent/config.js";
import { selectTaskMode } from "../agent/complexityEvaluator.js";
import { renderMultiAgentEventBlock } from "../utils/serverChatHelpers.js";

class FakeBaseLlm {
  constructor() {
    this.bindToolsCallCount = 0;
    this.lastBoundToolsLength = -1;
  }

  bindTools(tools) {
    this.bindToolsCallCount += 1;
    this.lastBoundToolsLength = tools.length;
    return {
      invoke: async () => new AIMessage("bound response"),
    };
  }

  async invoke() {
    return new AIMessage("plain response");
  }
}

class FakeSubAgent {
  constructor(profile) {
    this.profile = profile;
    this.sessions = new Map();
    this.capabilityRoutingEnabled = true;
    this.lastRoutingInput = "";
    this.requestSeq = 0;
  }

  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        activeCapabilityNames: ["search_knowledge", "search_tools"],
        requestStates: new Map(),
      });
    }
    return this.sessions.get(sessionId);
  }

  createRequestState(sessionId) {
    const session = this.getOrCreateSession(sessionId);
    this.requestSeq += 1;
    const requestState = {
      id: `${sessionId}#${this.requestSeq}`,
      aborted: false,
      abortReason: null,
      abortController: typeof AbortController === "function" ? new AbortController() : null,
    };
    session.requestStates.set(requestState.id, requestState);
    return requestState;
  }

  abortRequest(session, requestId, reason = "test.abort") {
    const requestState = session?.requestStates?.get(requestId);
    if (!requestState || requestState.aborted) {
      return false;
    }
    requestState.aborted = true;
    requestState.abortReason = reason;
    requestState.abortController?.abort?.(reason);
    return true;
  }

  resolveCapabilitySelection(input) {
    this.lastRoutingInput = input;
    return {
      toolNames: ["search_knowledge", "search_tools"],
      skillNames: [],
      capabilityNames: ["search_knowledge", "search_tools"],
    };
  }

  applyCapabilitySelectionToSession(session, selection) {
    session.selection = selection;
    session.activeCapabilityNames = selection.capabilityNames;
  }

  async chat(userInput) {
    return `${this.profile.id}:${String(userInput).slice(0, 24)}`;
  }
}

class FlakySubAgent extends FakeSubAgent {
  constructor(profile) {
    super(profile);
    this.callCount = 0;
  }

  async chat(userInput) {
    this.callCount += 1;
    if (this.callCount === 1) {
      throw new Error(`${this.profile.id} temporary failure`);
    }
    return super.chat(userInput);
  }
}

class BusySubAgent extends FakeSubAgent {
  async chat() {
    return "抱歉，服务暂时繁忙，请稍后重试。";
  }
}

class KnowledgeMismatchSubAgent extends FakeSubAgent {
  constructor(profile) {
    super(profile);
    this.callCount = 0;
  }

  async chat() {
    this.callCount += 1;
    return "未检索到与目标架构信息直接匹配的客观事实。当前知识库内容主要围绕前端组件，不涉及后端多 Agent 编排架构。";
  }
}

class DelegatingLlm {
  constructor() {
    this.bindToolsCallCount = 0;
    this.callCount = 0;
  }

  bindTools(_tools) {
    this.bindToolsCallCount += 1;
    return {
      invoke: async () => {
        this.callCount += 1;
        if (this.callCount === 1) {
          return new AIMessage({
            content: "",
            tool_calls: [{
              id: "delegate-round-1",
              name: "delegate_subagents",
              args: {
                arg1: JSON.stringify({
                  tasks: [
                    { profileId: "information_gatherer", task: "整理背景" },
                    { profileId: "solution_designer", task: "设计方案" },
                  ],
                }),
              },
              type: "tool_call",
            }],
          });
        }
        return new AIMessage("基于子agent结果继续完成最终汇总");
      },
    };
  }
}

class DelegatingDirectObjectLlm {
  constructor() {
    this.bindToolsCallCount = 0;
    this.callCount = 0;
  }

  bindTools(_tools) {
    this.bindToolsCallCount += 1;
    return {
      invoke: async () => {
        this.callCount += 1;
        if (this.callCount === 1) {
          return new AIMessage({
            content: "",
            tool_calls: [{
              id: "delegate-round-direct-object",
              name: "delegate_subagents",
              args: {
                tasks: [
                  { profileId: "risk_reviewer", task: "审查安全风险" },
                ],
              },
              type: "tool_call",
            }],
          });
        }
        return new AIMessage("已基于风险子结果继续处理");
      },
    };
  }
}

test("ProductionAgent: should accept flexible delegate_subagents payload shapes", async () => {
  const agent = new ProductionAgent(new FakeBaseLlm(), null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => new FakeSubAgent(profile),
  });

  const parsedFromObject = agent.parseDelegatedTasks({
    subtasks: [
      { role: "risk_reviewer", prompt: "只审查风险" },
      { agent: "solution_designer", content: "给出方案" },
    ],
  }, 4);
  assert.deepEqual(parsedFromObject, [
    { profileId: "risk_reviewer", task: "只审查风险" },
    { profileId: "solution_designer", task: "给出方案" },
  ]);

  const parsedFromSingleObject = agent.parseDelegatedTasks({
    profile: "information_gatherer",
    objective: "整理背景",
  }, 4);
  assert.deepEqual(parsedFromSingleObject, [
    { profileId: "information_gatherer", task: "整理背景" },
  ]);

  const parsedEmpty = agent.parseDelegatedTasks({ foo: "bar" }, 4);
  assert.deepEqual(parsedEmpty, []);
});

test("ProductionAgent: should support direct object tool args for delegate_subagents", async () => {
  const llm = new DelegatingDirectObjectLlm();
  const agent = new ProductionAgent(llm, null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  const coordinator = new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => new FakeSubAgent(profile),
  });

  const answer = await agent.chat(
    "请只从安全风险角度审查",
    null,
    null,
    "direct-object-session",
    {
      streamEnabled: false,
      taskMode: "react",
      multiAgent: {
        enabled: true,
      },
      multiAgentMeta: {
        parentRequestId: "direct-object-parent",
        orchestrationMode: true,
        orchestrationCapabilities: ["search_knowledge", "search_tools", "delegate_subagents"],
        dynamicDelegationEnabled: true,
        maxDelegationRounds: 2,
        maxDelegatedTasksPerRound: 3,
        delegationGuide: coordinator.buildDelegationGuide({
          maxDelegationRounds: 2,
          maxDelegatedTasksPerRound: 3,
        }),
      },
    }
  );

  const results = coordinator.getSubAgentResults("direct-object-parent");
  assert.equal(answer, "已基于风险子结果继续处理");
  assert.equal(results.length, 1);
  assert.equal(results[0].profileId, "risk_reviewer");
});

test("ProductionAgent: should support dynamic multi-round subagent delegation", async () => {
  const llm = new DelegatingLlm();
  const agent = new ProductionAgent(llm, null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  const coordinator = new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => new FakeSubAgent(profile),
  });

  const answer = await agent.chat(
    "请动态调度子agent后继续汇总",
    null,
    null,
    "dynamic-orchestrator-session",
    {
      streamEnabled: false,
      taskMode: "react",
      multiAgent: {
        enabled: true,
      },
      multiAgentMeta: {
        parentRequestId: "dynamic-parent",
        orchestrationMode: true,
        orchestrationCapabilities: ["search_knowledge", "search_tools", "delegate_subagents"],
        dynamicDelegationEnabled: true,
        maxDelegationRounds: 2,
        maxDelegatedTasksPerRound: 3,
        delegationGuide: coordinator.buildDelegationGuide({
          maxDelegationRounds: 2,
          maxDelegatedTasksPerRound: 3,
        }),
      },
    }
  );

  const results = coordinator.getSubAgentResults("dynamic-parent");
  assert.equal(answer, "基于子agent结果继续完成最终汇总");
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((item) => item.profileId).sort(), ["information_gatherer", "solution_designer"]);
  assert.ok(llm.bindToolsCallCount >= 1);
});

test("ProductionAgent: should keep always-on tools in multi-agent orchestration mode", async () => {
  const llm = new FakeBaseLlm();
  const agent = new ProductionAgent(llm, null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });

  const answer = await agent.chat(
    "请汇总三个子agent结果",
    null,
    null,
    "orchestrator-session",
    {
      streamEnabled: false,
      taskMode: "react",
      multiAgentMeta: {
        orchestrationMode: true,
        orchestrationCapabilities: ["search_knowledge", "search_tools"],
        dynamicDelegationEnabled: true,
        maxDelegationRounds: 2,
        maxDelegatedTasksPerRound: 3,
        delegationGuide: "",
      },
    }
  );

  assert.equal(answer, "bound response");
  assert.equal(llm.bindToolsCallCount, 1);
  assert.equal(llm.lastBoundToolsLength, 2);
});

test("ProductionAgent: should keep tool binding for normal requests", async () => {
  const llm = new FakeBaseLlm();
  const agent = new ProductionAgent(llm, null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });

  const answer = await agent.chat(
    "请正常调用工具",
    null,
    null,
    "normal-session",
    {
      streamEnabled: false,
      taskMode: "react",
    }
  );

  assert.equal(answer, "bound response");
  assert.ok(llm.bindToolsCallCount >= 1);
  assert.ok(llm.lastBoundToolsLength > 0);
});

test("MultiAgentCoordinator: should run delegated tasks and emit frontend events", async () => {
  const agent = new ProductionAgent(new FakeBaseLlm(), null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  const coordinator = new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => new FakeSubAgent(profile),
  });

  const events = [];
  const result = await coordinator.runDelegatedTasks({
    tasks: [
      { profileId: "information_gatherer", task: "整理背景" },
      { profileId: "risk_reviewer", task: "审查风险" },
    ],
    userInput: "请动态拆分背景和风险",
    sessionId: "delegated-session",
    parentRequestId: "delegated-parent",
    chunkCallback: (event) => events.push(event),
    requestOptions: {
      multiAgent: {
        enabled: true,
        emitSubAgentEvents: true,
        maxDelegatedTasksPerRound: 4,
      },
    },
  });

  assert.equal(result.parentRequestId, "delegated-parent");
  assert.equal(result.results.length, 2);
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.type === "subagent_result"));
  assert.ok(events.every((event) => event.status === "done"));
});

test("MultiAgentCoordinator: should treat busy fallback text as subagent error", async () => {
  const agent = new ProductionAgent(new FakeBaseLlm(), null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  const coordinator = new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => new BusySubAgent(profile),
    defaultOptions: {
      subAgentRetryCount: 0,
    },
  });

  const events = [];
  const result = await coordinator.runDelegatedTasks({
    tasks: [{ profileId: "information_gatherer", task: "整理背景" }],
    userInput: "请整理背景",
    sessionId: "busy-session",
    parentRequestId: "busy-parent",
    chunkCallback: (event) => events.push(event),
    requestOptions: {
      multiAgent: {
        enabled: true,
        emitSubAgentEvents: true,
      },
    },
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, "error");
  assert.match(result.results[0].error || "", /服务暂时繁忙/);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "error");
  assert.match(events[0].summary || "", /失败/);
});

test("MultiAgentCoordinator: should skip retry for knowledge mismatch errors", async () => {
  const agent = new ProductionAgent(new FakeBaseLlm(), null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  const mismatchAgentCache = new Map();
  const coordinator = new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => {
      if (!mismatchAgentCache.has(profile.id)) {
        mismatchAgentCache.set(profile.id, new KnowledgeMismatchSubAgent(profile));
      }
      return mismatchAgentCache.get(profile.id);
    },
    defaultOptions: {
      subAgentRetryCount: 1,
    },
  });

  const result = await coordinator.runDelegatedTasks({
    tasks: [{ profileId: "information_gatherer", task: "整理架构背景" }],
    userInput: "请整理架构背景",
    sessionId: "knowledge-mismatch-session",
    parentRequestId: "knowledge-mismatch-parent",
    requestOptions: {
      multiAgent: {
        enabled: true,
        emitSubAgentEvents: true,
      },
    },
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, "error");
  assert.equal(result.results[0].errorType, "knowledge_mismatch");
  assert.equal(mismatchAgentCache.get("information_gatherer").callCount, 1);
});

test("MultiAgentCoordinator: should retry failed delegated subagent once", async () => {
  const agent = new ProductionAgent(new FakeBaseLlm(), null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  const flakyAgentCache = new Map();
  const coordinator = new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => {
      if (!flakyAgentCache.has(profile.id)) {
        flakyAgentCache.set(profile.id, new FlakySubAgent(profile));
      }
      return flakyAgentCache.get(profile.id);
    },
    defaultOptions: {
      subAgentRetryCount: 1,
    },
  });

  const result = await coordinator.runDelegatedTasks({
    tasks: [{ profileId: "risk_reviewer", task: "只审查风险" }],
    userInput: "请审查风险",
    sessionId: "retry-session",
    parentRequestId: "retry-parent",
    requestOptions: {
      multiAgent: {
        enabled: true,
        emitSubAgentEvents: true,
      },
    },
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, "done");
  assert.equal(flakyAgentCache.get("risk_reviewer").callCount, 2);
});

test("MultiAgentCoordinator: should clear session state on reset", async () => {
  const agent = new ProductionAgent(new FakeBaseLlm(), null, null, {
    taskMode: "react",
    debug: false,
    capabilityRoutingEnabled: false,
    longTermMemoryEnabled: false,
  });
  const coordinator = new MultiAgentCoordinator({
    primaryAgent: agent,
    subAgentFactory: (profile) => new FakeSubAgent(profile),
  });

  await coordinator.runDelegatedTasks({
    tasks: [{ profileId: "solution_designer", task: "给我方案" }],
    userInput: "请给我一个方案",
    sessionId: "reset-session",
    parentRequestId: "reset-parent",
    requestOptions: {
      multiAgent: {
        enabled: true,
      },
    },
  });

  assert.ok(coordinator.getBackgroundEntry("reset-parent"));
  assert.equal(coordinator.getSubAgentResults("reset-parent").length, 1);

  coordinator.clearSession("reset-session", { abortRunning: true, reason: "test.reset" });

  assert.equal(coordinator.getBackgroundEntry("reset-parent"), null);
  assert.equal(coordinator.getSubAgentResults("reset-parent").length, 0);
});

test("multi-agent config: should expose dynamic-orchestrator defaults and prompt builders", () => {
  assert.equal(DEFAULT_MULTI_AGENT_OPTIONS.maxAgents, 6);
  assert.equal(DEFAULT_MULTI_AGENT_OPTIONS.emitSubAgentEvents, true);
  assert.equal(DEFAULT_MULTI_AGENT_OPTIONS.dynamicDelegationEnabled, true);
  assert.equal(DEFAULT_MULTI_AGENT_OPTIONS.maxDelegationRounds, 3);
  assert.equal(DEFAULT_MULTI_AGENT_OPTIONS.maxDelegatedTasksPerRound, 4);
  assert.equal(DEFAULT_MULTI_AGENT_OPTIONS.primaryAgentOrchestrationMode, true);
  assert.deepEqual(DEFAULT_MULTI_AGENT_OPTIONS.primaryAgentOrchestrationCapabilities, ["search_knowledge", "search_tools"]);
  assert.deepEqual(DEFAULT_MULTI_AGENT_OPTIONS.subAgentAlwaysOnCapabilities, ["search_knowledge", "search_tools"]);
  assert.equal(MULTI_AGENT_UI_CONFIG.titles.multiAgentStatus, "主控协同处理中");
  assert.equal(MULTI_AGENT_UI_CONFIG.content.multiAgentStatus, "正在进行协同分析");

  const selectorPrompt = buildMultiAgentSelectorPrompt({
    candidateProfiles: [{ id: "risk_reviewer", roleDescription: "审查风险" }],
    maxAgents: 4,
    userInput: "请拆成四个风险维度",
  });
  assert.match(selectorPrompt, /优先返回 tasks 数组/);
  assert.match(selectorPrompt, /最多选择 4 个子任务实例/);

  const subPrompt = buildSubAgentPrompt(
    { id: "risk_reviewer", taskInstruction: "只审查安全风险" },
    "请分析多agent架构"
  );
  assert.match(subPrompt, /本次你只允许处理以下子任务：只审查安全风险/);
  assert.match(subPrompt, /不要完整回答用户原始问题/);

  const infoPrompt = buildSubAgentPrompt(
    {
      id: "information_gatherer",
      taskInstruction: "整理背景",
      buildPrompt: DEFAULT_SUBAGENT_PROFILES.find((item) => item.id === "information_gatherer")?.buildPrompt,
    },
    "请调研当前方案"
  );
  assert.match(infoPrompt, /默认先尝试 search_knowledge/);
  assert.match(infoPrompt, /只有在现有能力明显不足/);
  assert.match(infoPrompt, /不要为了泛泛探索系统能力而调用 search_tools/);

  const solutionPrompt = buildSubAgentPrompt(
    {
      id: "solution_designer",
      taskInstruction: "设计方案",
      buildPrompt: DEFAULT_SUBAGENT_PROFILES.find((item) => item.id === "solution_designer")?.buildPrompt,
    },
    "请给出改造方案"
  );
  assert.match(solutionPrompt, /优先基于你当前已具备的技能与上下文完成方案设计/);
  assert.match(solutionPrompt, /不要为了泛化探索去寻找新工具/);

  const riskPrompt = buildSubAgentPrompt(
    {
      id: "risk_reviewer",
      taskInstruction: "审查风险",
      buildPrompt: DEFAULT_SUBAGENT_PROFILES.find((item) => item.id === "risk_reviewer")?.buildPrompt,
    },
    "请审查当前方案风险"
  );
  assert.match(riskPrompt, /默认基于当前上下文进行审查/);
  assert.match(riskPrompt, /不要主动扩展到额外能力探索或无关工具调用/);
});

test("renderMultiAgentEventBlock: should read multi-agent UI copy from config", () => {
  const html = renderMultiAgentEventBlock({
    type: "multi_agent_status",
    content: "正在进行协同分析",
  });

  assert.match(html, /MULTI-AGENT/);
  assert.match(html, /主控协同处理中/);
  assert.match(html, /正在进行协同分析/);
});

test("renderMultiAgentEventBlock: should show source agent for result cards", () => {
  const html = renderMultiAgentEventBlock({
    type: "subagent_result",
    agentLabel: "风险审查",
    status: "done",
    summary: "风险已审查",
    taskTitle: "只审查安全风险",
  });

  assert.match(html, /来自：风险审查 Agent/);
  assert.match(html, /风险审查 · 已完成/);
  assert.match(html, /子任务：只审查安全风险/);
});

test("selectTaskMode: should force react when multi-agent is enabled", async () => {
  const fakeAgent = { taskMode: "auto", llm: null, options: {} };
  const mode = await selectTaskMode(
    fakeAgent,
    "请分阶段分析并给出方案，再从四个风险角度分别审查，最后综合建议",
    {
      multiAgent: { enabled: true },
    },
    []
  );
  assert.equal(mode, "react");
});

test("selectTaskMode: should respect requestOptions.taskMode override", async () => {
  const fakeAgent = { taskMode: "auto" };
  const mode = await selectTaskMode(fakeAgent, "hello", { taskMode: "react" }, []);
  assert.equal(mode, "react");
});
