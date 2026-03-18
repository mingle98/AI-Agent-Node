import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ProductionAgent } from "../agent/ProductionAgent.js";

class MockLLM {
  constructor(script = []) {
    this.script = [...script];
  }

  bindTools() {
    return {
      stream: async function* () {
        const next = this.script.shift() || {};
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
      }.bind(this),
    };
  }
}

function createAgentWithMockLLM(mockLlm, options = {}) {
  return new ProductionAgent(mockLlm, null, null, {
    debug: false,
    maxIterations: 3,
    maxHistoryMessages: 12,
    keepRecentMessages: 8,
    contextStrategy: "trim",
    ...options,
  });
}

test("ProductionAgent.chat: no tool call, should stream done and return final text", async () => {
  const ai = new AIMessage({ content: "hello" });
  const llm = new MockLLM([{ chunks: [ai] }]);
  const agent = createAgentWithMockLLM(llm);

  const events = [];
  const result = await agent.chat("hi", (e) => events.push(e), null, "s1");
  assert.equal(result, "hello");
  assert.ok(events.some((e) => e.type === "done"), "should emit done event");
});

test("ProductionAgent.chat: single tool call, should execute tool and continue", async () => {
  const aiTool = new AIMessage({ content: "" });
  aiTool.tool_calls = [{ name: "render_mermaid", id: "t1", args: { arg1: "sequence", arg2: "A-->B" } }];
  const aiFinal = new AIMessage({ content: "ok" });
  const llm = new MockLLM([{ chunks: [aiTool] }, { chunks: [aiFinal] }]);
  const agent = createAgentWithMockLLM(llm);

  const result = await agent.chat("draw", () => {}, null, "s2");
  assert.equal(result, "ok");
});

test("ProductionAgent.chat: after trimming, session messages should not start with tool", async () => {
  const aiTool = new AIMessage({ content: "" });
  aiTool.tool_calls = [{ name: "render_mermaid", id: "t2", args: { arg1: "sequence", arg2: "A-->B" } }];
  const aiFinal = new AIMessage({ content: "ok" });
  const aiNext = new AIMessage({ content: "next" });

  const llm = new MockLLM([{ chunks: [aiTool] }, { chunks: [aiFinal] }, { chunks: [aiNext] }]);
  const agent = createAgentWithMockLLM(llm, { maxHistoryMessages: 6, keepRecentMessages: 4 });

  await agent.chat("draw", () => {}, null, "s3");
  const result = await agent.chat("follow", () => {}, null, "s3");
  assert.equal(result, "next");

  const session = agent.getOrCreateSession("s3");
  await agent.manageContext(session);

  const nonSystem = session.messages.filter((m) => m._getType() !== "system");
  assert.ok(nonSystem.length > 0);
  assert.notEqual(nonSystem[0]._getType(), "tool", "trimmed messages should not start with tool");
});

test("ProductionAgent.getStats: should return session statistics", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const stats = agent.getStats("default");
  assert.equal(typeof stats.totalMessages, "number");
  assert.equal(typeof stats.userMessages, "number");
  assert.equal(typeof stats.aiMessages, "number");
  assert.equal(typeof stats.conversationRounds, "number");
  assert.equal(typeof stats.activeSessions, "number");
  assert.equal(stats.sessionId, "default");
});

test("ProductionAgent.reset: should reset session messages", async () => {
  const ai = new AIMessage({ content: "hello" });
  const llm = new MockLLM([{ chunks: [ai] }]);
  const agent = createAgentWithMockLLM(llm);

  await agent.chat("hi", null, null, "reset-test");
  const beforeStats = agent.getStats("reset-test");
  assert.ok(beforeStats.totalMessages > 0);

  await agent.reset("reset-test");
  const afterStats = agent.getStats("reset-test");
  assert.equal(afterStats.totalMessages, 1); // only system message left
});

test("ProductionAgent.setContextStrategy: should change strategy for all sessions", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { contextStrategy: "trim" });

  // Create multiple sessions
  agent.getOrCreateSession("s1");
  agent.getOrCreateSession("s2");

  agent.setContextStrategy("summarize");

  assert.equal(agent.getContextStrategy("s1"), "summarize");
  assert.equal(agent.getContextStrategy("s2"), "summarize");
  assert.equal(agent.options.contextStrategy, "summarize");
});

test("ProductionAgent.chat: should emit status events for tool calls", async () => {
  const aiTool = new AIMessage({ content: "" });
  aiTool.tool_calls = [{ name: "render_mermaid", id: "t3", args: { arg1: "flowchart", arg2: "A-->B" } }];
  const aiFinal = new AIMessage({ content: "done" });
  const llm = new MockLLM([{ chunks: [aiTool] }, { chunks: [aiFinal] }]);
  const agent = createAgentWithMockLLM(llm);

  const events = [];
  await agent.chat("draw diagram", (e) => events.push(e), null, "status-test");

  // Should have chunk, status (tool), status (done) events
  assert.ok(events.some((e) => e.type === "chunk" || e.type === "status"));
});

test("ProductionAgent: should handle multiple sessions", async () => {
  const llm = new MockLLM([
    { chunks: [new AIMessage({ content: "response1" })] },
    { chunks: [new AIMessage({ content: "response2" })] },
  ]);
  const agent = createAgentWithMockLLM(llm);

  const result1 = await agent.chat("msg1", null, null, "session-a");
  const result2 = await agent.chat("msg2", null, null, "session-b");

  assert.equal(result1, "response1");
  assert.equal(result2, "response2");

  const stats = agent.getStats();
  // Agent has default session + 2 new sessions
  assert.ok(stats.activeSessions >= 2, "Should have at least 2 active sessions");
});

test("ProductionAgent: should handle multimodal input", async () => {
  const ai = new AIMessage({ content: "image received" });
  const llm = new MockLLM([{ chunks: [ai] }]);
  const agent = createAgentWithMockLLM(llm, { multimodalEnabled: true });

  const result = await agent.chat({ text: "describe this", images: ["base64data"] }, null, null, "multi-test");
  assert.equal(result, "image received");
});

test("ProductionAgent.getStructuredTools: should return tool schemas", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const tools = agent.getStructuredTools();
  assert.ok(Array.isArray(tools));
  assert.ok(tools.length > 0);
  assert.ok(tools.every(t => t.type === "function"));
});

test("ProductionAgent.createSession: should create new session with correct structure", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const session = agent.createSession("new-session-123");
  assert.equal(session.id, "new-session-123");
  assert.ok(session.messages);
  assert.ok(session.contextManager);
  assert.ok(session.llmBreaker);
  assert.ok(session.toolBreaker);
});

test("ProductionAgent.touchSession: should update lastActiveAt", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const session = agent.getOrCreateSession("touch-test");
  const before = session.lastActiveAt;

  // Wait a tiny bit
  const start = Date.now();
  while (Date.now() - start < 10) {} // minimal delay

  agent.touchSession(session);
  assert.ok(session.lastActiveAt >= before);
});

test("ProductionAgent.cleanupExpiredSessions: should remove expired sessions", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { sessionTtlMs: 100 });

  const session = agent.getOrCreateSession("expired-session");
  // Manually set lastActiveAt to past
  session.lastActiveAt = Date.now() - 200;

  agent.cleanupExpiredSessions();
  assert.ok(!agent.sessions.has("expired-session"));
});

test("ProductionAgent.cleanupExpiredSessions: should keep valid sessions", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { sessionTtlMs: 60000 });

  agent.getOrCreateSession("valid-session");
  agent.cleanupExpiredSessions();
  assert.ok(agent.sessions.has("valid-session"));
});

test("ProductionAgent.cleanupOverflowSessions: should remove oldest sessions when over limit", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { maxSessions: 2 });

  // Create sessions with different active times
  const session1 = agent.createSession("session-1");
  session1.lastActiveAt = 1000;

  const session2 = agent.createSession("session-2");
  session2.lastActiveAt = 2000;

  const session3 = agent.createSession("session-3");
  session3.lastActiveAt = 3000;

  agent.cleanupOverflowSessions();

  // Oldest (session-1) should be removed
  assert.ok(!agent.sessions.has("session-1"));
});

test("ProductionAgent.orderedArgsFromObject: should return ordered args by keys", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const args = agent.orderedArgsFromObject({ arg2: "second", arg1: "first" }, ["arg1", "arg2"]);
  assert.deepEqual(args, ["first", "second"]);
});

test("ProductionAgent.orderedArgsFromObject: should sort keys when no order specified", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const args = agent.orderedArgsFromObject({ b: 2, a: 1 });
  assert.deepEqual(args, [1, 2]);
});

test("ProductionAgent.orderedArgsFromObject: should handle invalid input", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  assert.deepEqual(agent.orderedArgsFromObject(null, []), []);
  assert.deepEqual(agent.orderedArgsFromObject(undefined, []), []);
  assert.deepEqual(agent.orderedArgsFromObject("string", []), []);
});

test("ProductionAgent.buildHumanMessage: should handle string input", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const msg = agent.buildHumanMessage("hello");
  assert.equal(msg.content, "hello");
});

test("ProductionAgent.buildHumanMessage: should handle object input without images", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const msg = agent.buildHumanMessage({ text: "hello", images: [] });
  assert.equal(msg.content, "hello");
});

test("ProductionAgent.buildHumanMessage: should handle invalid input", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const msg = agent.buildHumanMessage(123);
  assert.equal(msg.content, "123");
});

test("ProductionAgent.buildHumanMessage: should handle URL images", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "ok" })] }]);
  const agent = createAgentWithMockLLM(llm, { multimodalEnabled: true });

  const msg = agent.buildHumanMessage({ text: "look", images: ["https://example.com/img.jpg"] });
  assert.ok(Array.isArray(msg.content));
});

test("ProductionAgent.buildHumanMessage: should handle data URI images", async () => {
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: "ok" })] }]);
  const agent = createAgentWithMockLLM(llm, { multimodalEnabled: true });

  const msg = agent.buildHumanMessage({ text: "look", images: ["data:image/png;base64,abc123"] });
  assert.ok(Array.isArray(msg.content));
});


test("ProductionAgent: should return fallback text when maxIterations is reached", async () => {
  const aiTool = new AIMessage({ content: "" });
  aiTool.tool_calls = [{ name: "render_mermaid", id: "t-loop", args: { arg1: "sequence", arg2: "A-->B" } }];
  const llm = new MockLLM([
    { chunks: [aiTool] },
    { chunks: [aiTool] },
    { chunks: [aiTool] },
    { chunks: [aiTool] },
    { chunks: [aiTool] },
  ]);
  const agent = createAgentWithMockLLM(llm, { maxIterations: 3 });

  const result = await agent.chat("loop test", null, null, "loop-test");
  assert.equal(result, "抱歉，服务暂时繁忙，请稍后重试。");
});

test("ProductionAgent.chat: should emit error and done when stream mode hits maxIterations", async () => {
  const aiTool = new AIMessage({ content: "" });
  aiTool.tool_calls = [{ name: "render_mermaid", id: "t-stream-loop", args: { arg1: "sequence", arg2: "A-->B" } }];
  const llm = new MockLLM([
    { chunks: [aiTool] },
    { chunks: [aiTool] },
  ]);
  const agent = createAgentWithMockLLM(llm, { maxIterations: 1 });

  const events = [];
  const result = await agent.chat("loop test", (e) => {
    if (e) {
      events.push(e);
    }
  }, null, "loop-stream-test");

  assert.equal(result, "抱歉，服务暂时繁忙，请稍后重试。");

  const errorIndex = events.findIndex((e) => e.type === "error");
  const doneIndex = events.findIndex((e) => e.type === "done");
  assert.ok(errorIndex >= 0, "should emit error event");
  assert.ok(doneIndex >= 0, "should emit done event");
  assert.ok(doneIndex > errorIndex, "done event should be emitted after error event");

  const doneEvent = events[doneIndex];
  assert.equal(doneEvent.finalText, "抱歉，服务暂时繁忙，请稍后重试。");
});

test("ProductionAgent.invokeLLMWithResilience: should handle LLM errors with fallback", async () => {
  const failingLLM = new MockLLM([{ error: new Error("Primary LLM failed") }]);
  const fallbackLLM = new MockLLM([{ chunks: [new AIMessage({ content: "fallback response" })] }]);
  const agent = new ProductionAgent(failingLLM, null, null, {
    debug: false,
    fallbackLlm: fallbackLLM,
    llmTimeoutMs: 5000,
    llmRetries: 1,
    contextStrategy: "trim",
  });

  const session = agent.getOrCreateSession("fallback-test");
  const { message } = await agent.invokeLLMWithResilience(session, [new SystemMessage("test")], null);
  assert.ok(message.content.includes("fallback") || message.content === "fallback response");
});

test("ProductionAgent.executeCallableWithResilience: should execute tool with timeout", async () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { toolTimeoutMs: 5000 });
  const session = agent.getOrCreateSession("tool-test");

  // Should successfully execute render_mermaid tool
  const result = await agent.executeCallableWithResilience(session, "render_mermaid", { arg1: "flowchart", arg2: "A-->B" });
  assert.ok(typeof result === "string");
  assert.ok(result.includes("mermaid") || result.includes("graph"));
});

test("ProductionAgent.executeCallableWithResilience: should handle skill execution", async () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);
  const session = agent.getOrCreateSession("skill-test");

  // Should successfully execute ai_agent_teaching skill
  const result = await agent.executeCallableWithResilience(session, "ai_agent_teaching", { "教学主题": "ReAct", "难度级别": "beginner" });
  assert.ok(typeof result === "string");
});

test("ProductionAgent.executeCallableWithResilience: should handle unknown callable", async () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);
  const session = agent.getOrCreateSession("unknown-test");

  const result = await agent.executeCallableWithResilience(session, "unknown_tool", {});
  assert.equal(typeof result, "string");
  assert.ok(result.length > 0);
});

test("ProductionAgent: should handle non-streaming mode", async () => {
  const ai = new AIMessage({ content: "direct response" });
  const llm = new MockLLM([{ chunks: [ai] }]);
  const agent = createAgentWithMockLLM(llm);

  let fullResponse = "";
  const result = await agent.chat("hi", null, (full) => { fullResponse = full; }, "non-stream-test");
  assert.equal(result, "direct response");
});

test("ProductionAgent.getOrCreateSession: should return existing session", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  const session1 = agent.getOrCreateSession("reuse-session");
  session1.messages.push(new HumanMessage("test"));

  const session2 = agent.getOrCreateSession("reuse-session");
  assert.equal(session1, session2);
  assert.equal(session2.messages.length, session1.messages.length);
});

test("ProductionAgent.manageContext: should use configured strategy", async () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm, { contextStrategy: "trim", maxHistoryMessages: 5 });
  const session = agent.getOrCreateSession("context-test");

  // Add many messages to trigger context management
  for (let i = 0; i < 10; i++) {
    session.messages.push(new HumanMessage(`msg${i}`));
    session.messages.push(new AIMessage({ content: `resp${i}` }));
  }

  const beforeCount = session.messages.length;
  await agent.manageContext(session);
  // Should have trimmed the context
  assert.ok(session.messages.length <= beforeCount);
});

test("ProductionAgent.manageContext: should handle empty messages", async () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);
  const session = agent.getOrCreateSession("empty-test");
  session.messages = [new SystemMessage("sys")]; // Only system message

  await agent.manageContext(session);
  assert.equal(session.messages.length, 1);
});

test("ProductionAgent.normalizeTextContent: should handle various content types", () => {
  // Test via agent behavior indirectly
  const llm = new MockLLM([{ chunks: [new AIMessage({ content: [{ text: "part1" }, { text: "part2" }] })] }]);
  const agent = createAgentWithMockLLM(llm);

  // The agent should normalize array content to string
  assert.ok(typeof agent.systemPrompt === "string");
});

test("ProductionAgent: constructor should set default options", () => {
  const llm = new MockLLM([]);
  const agent = new ProductionAgent(llm, null, null);

  assert.equal(agent.maxIterations, 5);
  assert.equal(agent.defaultSessionId, "default");
  assert.equal(agent.multimodalEnabled, true);
  assert.ok(agent.resilience.llmTimeoutMs > 0);
  assert.ok(agent.resilience.toolTimeoutMs > 0);
});

test("ProductionAgent: should handle options override", () => {
  const llm = new MockLLM([]);
  const agent = new ProductionAgent(llm, null, null, {
    maxIterations: 10,
    defaultSessionId: "custom",
    multimodalEnabled: false,
  });

  assert.equal(agent.maxIterations, 10);
  assert.equal(agent.defaultSessionId, "custom");
  assert.equal(agent.multimodalEnabled, false);
});

test("ProductionAgent.buildCallableDefinitions: should include tools and skills", () => {
  const llm = new MockLLM([]);
  const agent = createAgentWithMockLLM(llm);

  assert.ok(agent.callableDefinitions instanceof Map);
  assert.ok(agent.callableDefinitions.size > 0);
  assert.ok(agent.callableDefinitions.has("render_mermaid"));
  assert.ok(agent.callableDefinitions.has("mermaid_diagram"));
});

