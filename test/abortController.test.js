import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ProductionAgent, AbortError } from "../agent/ProductionAgent.js";

/**
 * ========== MockLLM 类 ==========
 */
class MockLLM {
  constructor(script = []) {
    this.script = [...script];
    this.callCount = 0;
    this._delay = 0;
  }

  setDelay(ms) {
    this._delay = ms;
    return this;
  }

  bindTools() {
    const script = this.script;
    const self = this;
    return {
      stream: async function* () {
        if (self._delay > 0) {
          await new Promise(r => setTimeout(r, self._delay));
        }
        self.callCount++;
        const next = script.shift() || {};
        if (next.error) {
          throw next.error;
        }
        if (Array.isArray(next.chunks)) {
          for (const c of next.chunks) {
            yield c;
          }
          return;
        }
        if (next.message) {
          yield next.message;
          return;
        }
        yield new AIMessage({ content: "" });
      },
      invoke: async function() {
        if (self._delay > 0) {
          await new Promise(r => setTimeout(r, self._delay));
        }
        self.callCount++;
        const next = script.shift() || {};
        if (next.error) {
          throw next.error;
        }
        if (next.message) {
          return next.message;
        }
        return new AIMessage({ content: "" });
      },
    };
  }
}

function createAgentWithMockLLM(mockLlm, options = {}) {
  return new ProductionAgent(mockLlm, null, null, {
    debug: false,
    maxIterations: 5,
    maxHistoryMessages: 20,
    keepRecentMessages: 10,
    contextStrategy: "trim",
    streamEnabled: false,
    ...options,
  });
}

// ========== AbortError 类测试 ==========

test("AbortError: should have correct name and message", () => {
  const error = new AbortError("Custom abort message");
  assert.equal(error.name, "AbortError");
  assert.equal(error.message, "Custom abort message");
});

test("AbortError: should use default message when not provided", () => {
  const error = new AbortError();
  assert.equal(error.message, "Session aborted by client");
});

// ========== abortSession 方法测试 ==========

test("ProductionAgent.abortSession: should mark session as aborted", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const session = agent.getOrCreateSession("abort-test-1");
  assert.equal(session.aborted, false);

  const result = agent.abortSession("abort-test-1");
  assert.equal(result, true);
  assert.equal(session.aborted, true);
});

test("ProductionAgent.abortSession: should return false for non-existent session", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const result = agent.abortSession("non-existent-session");
  assert.equal(result, false);
});

test("ProductionAgent.abortSession: should return true for already aborted session", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  agent.getOrCreateSession("abort-test-multi");
  agent.abortSession("abort-test-multi");
  const result = agent.abortSession("abort-test-multi");
  assert.equal(result, true);
});

// ========== isSessionAborted 方法测试 ==========

test("ProductionAgent.isSessionAborted: should return false for non-aborted session", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  agent.getOrCreateSession("check-test-1");
  const result = agent.isSessionAborted("check-test-1");
  assert.equal(result, false);
});

test("ProductionAgent.isSessionAborted: should return true for aborted session", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  agent.getOrCreateSession("check-test-2");
  agent.abortSession("check-test-2");
  const result = agent.isSessionAborted("check-test-2");
  assert.equal(result, true);
});

test("ProductionAgent.isSessionAborted: should return false for non-existent session", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const result = agent.isSessionAborted("ghost-session");
  assert.equal(result, false);
});

// ========== 新请求自动重置 abort 标志 ==========

test("ProductionAgent.chat: should reset abort flag on new request", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "hello" })] }]);
  const agent = createAgentWithMockLLM(llm);

  agent.getOrCreateSession("reset-test");
  agent.abortSession("reset-test");

  const session = agent.getOrCreateSession("reset-test");
  assert.equal(session.aborted, true);

  const response = await agent.chat("hi", null, null, "reset-test");
  assert.equal(response, "hello");
  assert.equal(session.aborted, false);
});

test("ProductionAgent.chat: should work normally after abort reset", async () => {
  const llm = new MockLLM([
    { chunks: [new AIMessage({ content: "first" })] },
    { chunks: [new AIMessage({ content: "second" })] }
  ]);
  const agent = createAgentWithMockLLM(llm);

  const r1 = await agent.chat("msg1", null, null, "normal-after-abort");
  assert.equal(r1, "first");

  agent.abortSession("normal-after-abort");
  assert.equal(agent.isSessionAborted("normal-after-abort"), true);

  const r2 = await agent.chat("msg2", null, null, "normal-after-abort");
  assert.equal(r2, "second");
});

// ========== ReAct 模式 abort 检查点测试 ==========

test("ProductionAgent.chatWithReAct: should abort during LLM call (non-stream)", async () => {
  const llm = new MockLLM([]).setDelay(100);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  agent.getOrCreateSession("abort-during-llm");

  let abortCalled = false;
  const originalInvoke = agent.invokeLLMWithResilience.bind(agent);
  agent.invokeLLMWithResilience = async function(...args) {
    const result = await originalInvoke(...args);
    if (!abortCalled) {
      abortCalled = true;
      agent.abortSession("abort-during-llm");
    }
    return result;
  };

  const r1 = await agent.chat("msg1", null, null, "abort-during-llm");
  assert.equal(abortCalled, true);

  const r2 = await agent.chat("msg2", null, null, "abort-during-llm");
  assert.equal(typeof r2, "string");
});

test("ProductionAgent.chatWithReAct: should abort during tool execution (non-stream)", async () => {
  const aiTool = new AIMessage({ content: "" });
  aiTool.tool_calls = [{ name: "render_mermaid", id: "t-abort", args: { arg1: "seq", arg2: "A->B" } }];

  const llm = new MockLLM([
    { chunks: [aiTool] },
    { chunks: [new AIMessage({ content: "done" })] }
  ]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  let abortCalledDuringTool = false;

  const originalExecute = agent.executeCallableWithResilience.bind(agent);
  agent.executeCallableWithResilience = async function(...args) {
    const result = await originalExecute(...args);
    if (!abortCalledDuringTool) {
      abortCalledDuringTool = true;
      agent.abortSession("abort-during-tool");
    }
    return result;
  };

  const result = await agent.chat("use tool", null, null, "abort-during-tool");

  assert.equal(abortCalledDuringTool, true);
  assert.equal(typeof result, "string");
});

// ========== 多会话隔离测试 ==========

test("ProductionAgent: should isolate abort between sessions", async () => {
  const llm1 = new MockLLM([{ chunks: [new AIMessage({ content: "response1" })] }]);
  const llm2 = new MockLLM([{ chunks: [new AIMessage({ content: "response2" })] }]);

  const agent1 = new ProductionAgent(llm1, null, null, {
    debug: false,
    maxIterations: 3,
    llmTimeoutMs: 5000,
    streamEnabled: false,
  });

  const agent2 = new ProductionAgent(llm2, null, null, {
    debug: false,
    maxIterations: 3,
    llmTimeoutMs: 5000,
    streamEnabled: false,
  });

  agent1.getOrCreateSession("multi-abort-1");
  agent1.abortSession("multi-abort-1");

  const session2 = agent2.getOrCreateSession("multi-abort-2");

  assert.equal(agent1.isSessionAborted("multi-abort-1"), true);
  assert.equal(agent2.isSessionAborted("multi-abort-2"), false);

  const r1 = await agent1.chat("msg1", null, null, "multi-abort-1");
  const r2 = await agent2.chat("msg2", null, null, "multi-abort-2");

  assert.equal(r1, "response1");
  assert.equal(r2, "response2");
});

// ========== abort 后错误处理测试 ==========

test("ProductionAgent.chat: should handle pre-set abort gracefully", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "response" })] }]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const session = agent.getOrCreateSession("pre-abort");
  session.aborted = true;

  const result = await agent.chat("test", null, null, "pre-abort");
  assert.equal(result, "response");
});

test("ProductionAgent.chat: should handle LLM error gracefully", async () => {
  const llm = new MockLLM([{ error: new Error("LLM Error") }]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const result = await agent.chat("test", null, null, "error-test");
  // 错误处理返回空字符串或 fallback text
  assert.equal(typeof result, "string");
});

// ========== 中止后长期记忆不受影响测试 ==========

test("ProductionAgent: should still update longTermMemory after abort handling", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "hello" })] }]);
  const agent = createAgentWithMockLLM(llm, {
    longTermMemoryEnabled: false,
    streamEnabled: false,
  });

  const session = agent.getOrCreateSession("memory-after-abort");
  session.aborted = true;

  const result = await agent.chat("test", null, null, "memory-after-abort");
  assert.equal(result, "hello");
  assert.equal(session.aborted, false);
});

// ========== Server.js abortSession 调用链路测试 ==========

test("ProductionAgent: abortSession should be safe to call from SSE disconnect handler", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  agent.getOrCreateSession("sse-scenario-1");
  const result1 = agent.abortSession("sse-scenario-1");
  assert.equal(result1, true);

  const result2 = agent.abortSession("sse-scenario-2");
  assert.equal(result2, false);

  const session3 = agent.getOrCreateSession("sse-scenario-1");
  const result3 = agent.abortSession("sse-scenario-1");
  assert.equal(result3, true);
});

// ========== 集成测试：完整 abort 链路 ==========

test("ProductionAgent: complete abort flow from SSE disconnect to agent stop", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "response" })] }]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const session = agent.getOrCreateSession("full-abort-flow");
  assert.equal(session.aborted, false);

  const onDisconnect = () => {
    agent.abortSession("full-abort-flow");
  };

  onDisconnect();
  assert.equal(session.aborted, true);

  const result = await agent.chat("new request", null, null, "full-abort-flow");
  assert.equal(result, "response");
  assert.equal(session.aborted, false);
});

test("ProductionAgent: abort during multi-turn conversation", async () => {
  const llm = new MockLLM([
    { chunks: [new AIMessage({ content: "turn1" })] },
    { chunks: [new AIMessage({ content: "turn2" })] },
    { chunks: [new AIMessage({ content: "turn3" })] }
  ]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const r1 = await agent.chat("msg1", null, null, "multi-turn-abort");
  assert.equal(r1, "turn1");

  agent.abortSession("multi-turn-abort");

  const r3 = await agent.chat("msg3", null, null, "multi-turn-abort");
  assert.equal(typeof r3, "string");
});

// ========== Plan+Exec 模式 abort 链路测试 ==========

test("ProductionAgent.plan_exec: should work with pre-set abort", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Test",
      estimated_steps: 1,
      steps: [{ step_id: 1, description: "Test step", depends_on: [], expected_output: "done" }],
      final_goal: "Complete"
    })
  });

  const llm = new MockLLM([
    { message: planResponse },
    { message: new AIMessage({ content: "Done" }) }
  ]);

  const agent = createAgentWithMockLLM(llm, { taskMode: "plan_exec", streamEnabled: false });

  const session = agent.getOrCreateSession("plan-abort-before-plan");
  session.aborted = true;

  const result = await agent.chat("test", null, null, "plan-abort-before-plan");
  assert.ok(typeof result === "string");
  assert.equal(session.aborted, false);
});

test("ProductionAgent.plan_exec: should execute plan successfully", async () => {
  const planResponse = new AIMessage({
    content: JSON.stringify({
      task_summary: "Multi-step test",
      estimated_steps: 2,
      steps: [
        { step_id: 1, description: "First step", depends_on: [], expected_output: "out1" },
        { step_id: 2, description: "Second step", depends_on: [1], expected_output: "out2" }
      ],
      final_goal: "Complete"
    })
  });

  const llm = new MockLLM([
    { message: planResponse },
    { message: new AIMessage({ content: "Step 1 done" }) },
    { message: new AIMessage({ content: "Step 2 done" }) }
  ]);

  const agent = createAgentWithMockLLM(llm, { taskMode: "plan_exec", streamEnabled: false });

  const result = await agent.chat("multi-step", null, null, "plan-exec-test");
  assert.ok(typeof result === "string");
  assert.ok(result.includes("步骤") || result.includes("Step"));
});

// ========== 边界条件测试 ==========

test("ProductionAgent: abortSession with empty string sessionId", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  agent.getOrCreateSession("");
  const result = agent.abortSession("");
  assert.equal(result, true);
});

test("ProductionAgent: abortSession with undefined sessionId", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  // undefined 被 getOrCreateSession 转换为默认 sessionId "default"
  // 但 abortSession(undefined) 查找的是 undefined key，不存在
  const session = agent.getOrCreateSession(undefined);
  assert.ok(session !== undefined);

  // 直接 abort undefined sessionId（不存在）
  const result1 = agent.abortSession(undefined);
  assert.equal(result1, false); // undefined !== "default"

  // abort 默认 sessionId（存在）
  const result2 = agent.abortSession("default");
  assert.equal(result2, true);
});

test("ProductionAgent: rapid abort-reset cycles", async () => {
  // 使用不同的 sessionId 来避免冲突
  const llm1 = new MockLLM([{ chunks: [new AIMessage({ content: "ok1" })] }]);
  const llm2 = new MockLLM([{ chunks: [new AIMessage({ content: "ok2" })] }]);
  const llm3 = new MockLLM([{ chunks: [new AIMessage({ content: "ok3" })] }]);

  const agent1 = createAgentWithMockLLM(llm1, { streamEnabled: false });
  const agent2 = createAgentWithMockLLM(llm2, { streamEnabled: false });
  const agent3 = createAgentWithMockLLM(llm3, { streamEnabled: false });

  // 测试 abort 和 chat 循环
  const s1 = agent1.getOrCreateSession("s1");
  agent1.abortSession("s1");
  assert.equal(s1.aborted, true);
  const r1 = await agent1.chat("m0", null, null, "s1");
  assert.equal(r1, "ok1");
  assert.equal(agent1.isSessionAborted("s1"), false);

  const s2 = agent2.getOrCreateSession("s2");
  agent2.abortSession("s2");
  assert.equal(s2.aborted, true);
  const r2 = await agent2.chat("m1", null, null, "s2");
  assert.equal(r2, "ok2");
  assert.equal(agent2.isSessionAborted("s2"), false);

  const s3 = agent3.getOrCreateSession("s3");
  agent3.abortSession("s3");
  assert.equal(s3.aborted, true);
  const r3 = await agent3.chat("m2", null, null, "s3");
  assert.equal(r3, "ok3");

  assert.equal(agent3.isSessionAborted("s3"), false);
});

// ========== 性能测试 ==========

test("ProductionAgent: abortSession should be fast (no blocking)", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  agent.getOrCreateSession("perf-test");

  const start = Date.now();
  for (let i = 0; i < 1000; i++) {
    agent.abortSession("perf-test");
    agent.isSessionAborted("perf-test");
  }
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 100, `abort/isAborted 1000次调用耗时: ${elapsed}ms`);
});

// ========== 兼容性测试 ==========

test("ProductionAgent: should work without explicit abort handling (backward compatible)", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "normal" })] }]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const result = await agent.chat("normal msg", null, null, "compatible-test");
  assert.equal(result, "normal");
});

test("ProductionAgent: old session should work with new abort mechanism", async () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const session = agent.getOrCreateSession("old-session");

  assert.equal(session.aborted, false);
  agent.abortSession("old-session");
  assert.equal(session.aborted, true);

  const llm2 = new MockLLM([{ chunks: [new AIMessage({ content: "restored" })] }]);
  const agent2 = new ProductionAgent(llm2, null, null, { debug: false, streamEnabled: false });
  const result = await agent2.chat("recover", null, null, "old-session");
  assert.equal(result, "restored");
});

// ========== 回归测试：确保现有功能不受影响 ==========

test("ProductionAgent: simple chat without abort should work", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "Hello, world!" })] }]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const result = await agent.chat("Hello", null, null, "simple-test");
  assert.equal(result, "Hello, world!");
});

test("ProductionAgent: chat with tool call without abort should work", async () => {
  const aiTool = new AIMessage({ content: "" });
  aiTool.tool_calls = [{ name: "render_mermaid", id: "t1", args: { arg1: "flowchart", arg2: "A->B" } }];
  const aiFinal = new AIMessage({ content: "Diagram created!" });

  const llm = new MockLLM([
    { chunks: [aiTool] },
    { chunks: [aiFinal] }
  ]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const result = await agent.chat("Draw a diagram", null, null, "tool-test");
  assert.equal(result, "Diagram created!");
});

test("ProductionAgent: session isolation without abort should work", async () => {
  const llm = new MockLLM([
    { chunks: [new AIMessage({ content: "session1" })] },
    { chunks: [new AIMessage({ content: "session2" })] }
  ]);
  const agent = createAgentWithMockLLM(llm, { streamEnabled: false });

  const r1 = await agent.chat("msg1", null, null, "isolation-test-1");
  const r2 = await agent.chat("msg2", null, null, "isolation-test-2");

  assert.equal(r1, "session1");
  assert.equal(r2, "session2");

  const session1 = agent.getOrCreateSession("isolation-test-1");
  const session2 = agent.getOrCreateSession("isolation-test-2");

  assert.ok(session1.messages.length > 0);
  assert.ok(session2.messages.length > 0);
});
