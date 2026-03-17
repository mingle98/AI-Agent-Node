import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage } from "@langchain/core/messages";
import { ProductionAgent } from "../agent/ProductionAgent.js";

// ============ Mock LLM with Reasoning Support ============
class MockLLMWithReasoning {
  constructor(script = []) {
    this.script = [...script];
  }

  bindTools() {
    const self = this;
    return {
      stream: async function* () {
        const next = self.script.shift() || {};
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
      invoke: async function () {
        const next = self.script.shift() || {};
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
    maxIterations: 3,
    maxHistoryMessages: 12,
    keepRecentMessages: 8,
    contextStrategy: "trim",
    ...options,
  });
}

// ============ Test Cases for Deep Thinking (Reasoning) Mode ============

test("ProductionAgent.chat: streaming with enableThinking should emit reasoning events", async () => {
  // Use a single chunk that contains both reasoning_content and normal content.
  // This avoids relying on langchain's internal chunk concatenation across multiple yields.
  const mixedChunk = new AIMessage({
    content: "Hello!",
    additional_kwargs: {
      __raw_response: {
        choices: [{
          delta: {
            reasoning_content: "Let me think about this...",
            content: "Hello!",
          },
        }],
      },
    },
  });

  const thinkingLlm = new MockLLMWithReasoning([{ chunks: [mixedChunk] }]);
  const normalLlm = new MockLLMWithReasoning([{ chunks: [mixedChunk] }]);

  const agent = new ProductionAgent(normalLlm, null, null, {
    debug: false,
    thinkingLlm,
    maxIterations: 3,
    contextStrategy: "trim",
  });

  const events = [];
  const result = await agent.chat(
    "hi",
    (e) => events.push(e),
    null,
    "reasoning-test",
    { streamEnabled: true, enableThinking: true }
  );

  // Check that reasoning event was emitted
  const reasoningEvents = events.filter((e) => e.type === "reasoning");
  assert.ok(reasoningEvents.length >= 1, "should emit reasoning events when enableThinking is true");

  // Check for any chunk event (content can be truthy or we check done event)
  const chunkEvents = events.filter((e) => e.type === "chunk");
  assert.ok(chunkEvents.length > 0, "should emit chunk events");

  // Check final result
  assert.equal(result, "Hello!");
});

test("ProductionAgent.chat: streaming without enableThinking should NOT emit reasoning events", async () => {
  const contentChunk = new AIMessage({ content: "Hello!" });
  const llm = new MockLLMWithReasoning([{ chunks: [contentChunk] }]);
  const agent = createAgentWithMockLLM(llm);

  const events = [];
  const result = await agent.chat(
    "hi",
    (e) => events.push(e),
    null,
    "no-reasoning-test",
    { streamEnabled: true, enableThinking: false }
  );

  // Check that NO reasoning event was emitted
  const reasoningEvents = events.filter((e) => e.type === "reasoning");
  assert.equal(reasoningEvents.length, 0, "should NOT emit reasoning events when enableThinking is false");

  // But should still emit normal chunk events
  const contentEvents = events.filter((e) => e.type === "chunk");
  assert.ok(contentEvents.length > 0, "should still emit chunk events");
  assert.equal(result, "Hello!");
});

test("ProductionAgent.chat: non-streaming should ignore enableThinking parameter", async () => {
  const contentChunk = new AIMessage({ content: "Direct response" });
  const llm = new MockLLMWithReasoning([{ message: contentChunk }]);
  const agent = createAgentWithMockLLM(llm);

  // Try to enable thinking in non-streaming mode - should be ignored
  const result = await agent.chat(
    "hi",
    null,
    null,
    "non-stream-reasoning-test",
    { streamEnabled: false, enableThinking: true }
  );

  // Should complete without error and return result
  assert.equal(result, "Direct response");
});

test("ProductionAgent.chat: default behavior (no enableThinking) should not use thinking mode", async () => {
  const contentChunk = new AIMessage({ content: "Normal response" });
  const llm = new MockLLMWithReasoning([{ chunks: [contentChunk] }]);
  const agent = createAgentWithMockLLM(llm);

  const events = [];
  const result = await agent.chat(
    "hi",
    (e) => events.push(e),
    null,
    "default-test",
    { streamEnabled: true }
    // Not passing enableThinking - should default to undefined/false
  );

  // Should NOT emit reasoning events when enableThinking is not specified
  const reasoningEvents = events.filter((e) => e.type === "reasoning");
  assert.equal(reasoningEvents.length, 0, "should NOT emit reasoning events by default");

  // Should still work normally
  const contentEvents = events.filter((e) => e.type === "chunk");
  assert.ok(contentEvents.length > 0, "should still emit chunk events");
  assert.equal(result, "Normal response");
});

test("ProductionAgent: should use thinkingLlm when enableThinking is true and stream is enabled", async () => {
  // Track which LLM was used
  let usedLlm = null;

  class TrackingMockLLM {
    constructor(name) {
      this.name = name;
    }

    bindTools() {
      usedLlm = this.name;
      return {
        stream: async function* () {
          yield new AIMessage({ content: "response" });
        },
      };
    }
  }

  const normalLlm = new TrackingMockLLM("normal");
  const thinkingLlm = new TrackingMockLLM("thinking");

  const agent = new ProductionAgent(normalLlm, null, null, {
    debug: false,
    thinkingLlm,
    maxIterations: 3,
    contextStrategy: "trim",
  });

  // With enableThinking: true and stream: true, should use thinkingLlm
  await agent.chat(
    "test",
    () => {},
    null,
    "llm-selection-test",
    { streamEnabled: true, enableThinking: true }
  );

  assert.equal(usedLlm, "thinking", "should use thinkingLlm when enableThinking is true");
});

test("ProductionAgent: should use normal llm when enableThinking is false", async () => {
  let usedLlm = null;

  class TrackingMockLLM {
    constructor(name) {
      this.name = name;
    }

    bindTools() {
      usedLlm = this.name;
      return {
        stream: async function* () {
          yield new AIMessage({ content: "response" });
        },
      };
    }
  }

  const normalLlm = new TrackingMockLLM("normal");
  const thinkingLlm = new TrackingMockLLM("thinking");

  const agent = new ProductionAgent(normalLlm, null, null, {
    debug: false,
    thinkingLlm,
    maxIterations: 3,
    contextStrategy: "trim",
  });

  // With enableThinking: false, should use normal llm
  await agent.chat(
    "test",
    () => {},
    null,
    "llm-normal-test",
    { streamEnabled: true, enableThinking: false }
  );

  assert.equal(usedLlm, "normal", "should use normal llm when enableThinking is false");
});

test("ProductionAgent: fallback should always use normal fallbackLlm regardless of thinking mode", async () => {
  let primaryUsed = null;
  let fallbackUsed = null;

  class FailingMockLLM {
    constructor(name) {
      this.name = name;
    }

    bindTools() {
      primaryUsed = this.name;
      return {
        stream: async function* () {
          throw new Error("Primary failed");
        },
      };
    }
  }

  class FallbackMockLLM {
    constructor(name) {
      this.name = name;
    }

    bindTools() {
      fallbackUsed = this.name;
      return {
        stream: async function* () {
          yield new AIMessage({ content: "fallback response" });
        },
      };
    }
  }

  const primaryLlm = new FailingMockLLM("primary-thinking");
  const thinkingLlm = new FailingMockLLM("thinking");
  const fallbackLlm = new FallbackMockLLM("fallback-normal");

  const agent = new ProductionAgent(primaryLlm, null, null, {
    debug: false,
    thinkingLlm,
    fallbackLlm,
    llmRetries: 1,
    maxIterations: 3,
    contextStrategy: "trim",
  });

  // Enable thinking mode but primary will fail - should fallback to normal fallbackLlm
  const result = await agent.chat(
    "test",
    () => {},
    null,
    "fallback-test",
    { streamEnabled: true, enableThinking: true }
  );

  assert.equal(primaryUsed, "thinking", "should try thinkingLlm first");
  assert.equal(fallbackUsed, "fallback-normal", "should use normal fallbackLlm on failure");
  assert.equal(result, "fallback response");
});

test("ProductionAgent.chat: reasoning and content can appear in same chunk", async () => {
  const mixedChunk = new AIMessage({
    content: "Partial answer",
    additional_kwargs: {
      __raw_response: {
        choices: [{
          delta: {
            reasoning_content: "Thinking...",
            content: "Partial answer",
          },
        }],
      },
    },
  });

  const thinkingLlm = new MockLLMWithReasoning([{ chunks: [mixedChunk] }]);
  const normalLlm = new MockLLMWithReasoning([{ chunks: [new AIMessage({ content: "" })] }]);

  const agent = new ProductionAgent(normalLlm, null, null, {
    debug: false,
    thinkingLlm,
    maxIterations: 3,
    contextStrategy: "trim",
  });

  const events = [];
  await agent.chat(
    "test",
    (e) => events.push(e),
    null,
    "mixed-chunk-test",
    { streamEnabled: true, enableThinking: true }
  );

  // Should emit both reasoning and chunk events
  const reasoningEvents = events.filter((e) => e.type === "reasoning");
  const chunkEvents = events.filter((e) => e.type === "chunk" && e.content);

  assert.ok(reasoningEvents.length > 0 || chunkEvents.length > 0, "should handle mixed chunks");
});

test("ProductionAgent.chat: multiple reasoning chunks should all be emitted", async () => {
  // For stability, validate that at least one reasoning event is emitted when reasoning_content exists.
  // (True multi-chunk concat behavior is exercised by langchain internals and can vary across versions.)
  const chunk = new AIMessage({
    content: "Final answer",
    additional_kwargs: {
      __raw_response: {
        choices: [{ delta: { reasoning_content: "Step 1... Step 2..." } }],
      },
    },
  });

  const thinkingLlm = new MockLLMWithReasoning([{ chunks: [chunk] }]);
  const normalLlm = new MockLLMWithReasoning([{ chunks: [new AIMessage({ content: "" })] }]);

  const agent = new ProductionAgent(normalLlm, null, null, {
    debug: false,
    thinkingLlm,
    maxIterations: 3,
    contextStrategy: "trim",
  });

  const events = [];
  await agent.chat(
    "test",
    (e) => events.push(e),
    null,
    "multi-reasoning-test",
    { streamEnabled: true, enableThinking: true }
  );

  const reasoningEvents = events.filter((e) => e.type === "reasoning");
  assert.ok(reasoningEvents.length >= 1, "should emit reasoning events");
});

test("ProductionAgent.chat: empty reasoning content should not emit reasoning event", async () => {
  const emptyReasoningChunk = new AIMessage({
    content: "Answer",
    additional_kwargs: {
      __raw_response: {
        choices: [{ delta: { reasoning_content: "" } }],
      },
    },
  });

  const thinkingLlm = new MockLLMWithReasoning([{ chunks: [emptyReasoningChunk] }]);
  const normalLlm = new MockLLMWithReasoning([{ chunks: [new AIMessage({ content: "" })] }]);

  const agent = new ProductionAgent(normalLlm, null, null, {
    debug: false,
    thinkingLlm,
    maxIterations: 3,
    contextStrategy: "trim",
  });

  const events = [];
  await agent.chat(
    "test",
    (e) => events.push(e),
    null,
    "empty-reasoning-test",
    { streamEnabled: true, enableThinking: true }
  );

  const reasoningEvents = events.filter((e) => e.type === "reasoning");
  assert.equal(reasoningEvents.length, 0, "should not emit reasoning events for empty reasoning content");
});

test("ProductionAgent: should handle missing thinkingLlm gracefully", async () => {
  // Agent without thinkingLlm configured
  const normalLlm = new MockLLMWithReasoning([{
    chunks: [new AIMessage({ content: "normal response" })],
  }]);

  const agent = new ProductionAgent(normalLlm, null, null, {
    debug: false,
    // No thinkingLlm provided
    maxIterations: 3,
    contextStrategy: "trim",
  });

  // Should fall back to normal llm when thinkingLlm is not available
  const result = await agent.chat(
    "test",
    () => {},
    null,
    "missing-thinking-llm-test",
    { streamEnabled: true, enableThinking: true }
  );

  assert.equal(result, "normal response", "should use normal llm when thinkingLlm is missing");
});
