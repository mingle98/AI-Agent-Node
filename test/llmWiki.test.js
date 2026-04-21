import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage } from "@langchain/core/messages";
import { ProductionAgent } from "../agent/ProductionAgent.js";
import { createLLMWikiBuilderLLM } from "../llm.js";

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
        yield new AIMessage({ content: "" });
      }.bind(this),
      invoke: async function () {
        const next = this.script.shift() || {};
        if (next.error) {
          throw next.error;
        }
        if (next.message) {
          return next.message;
        }
        if (Array.isArray(next.chunks) && next.chunks.length > 0) {
          return next.chunks[next.chunks.length - 1];
        }
        return new AIMessage({ content: "" });
      }.bind(this),
    };
  }
}

function createAgent(options = {}, llmScript = []) {
  const llm = new MockLLM(llmScript.length ? llmScript : [{ chunks: [new AIMessage({ content: "final answer" })] }]);
  return new ProductionAgent(llm, null, { mock: true }, {
    debug: false,
    maxIterations: 2,
    contextStrategy: "trim",
    ...options,
  });
}

test("createLLMWikiBuilderLLM: should create dedicated wiki builder model", () => {
  const llm = createLLMWikiBuilderLLM();
  assert.ok(llm);
  assert.equal(typeof llm.invoke, "function");
});

test("ProductionAgent.maybeTriggerLLMWikiLearning: should skip when not in llm_wiki mode", async () => {
  const agent = createAgent({
    llmWikiAutoLearningEnabled: true,
    llmWikiPath: "/tmp/llm_wiki",
    knowledgeRetriever: null,
  });

  let called = 0;
  agent.knowledgeRetriever = null;
  agent.options.knowledgeRetriever = null;
  agent.embeddings = { mock: true };
  agent.llm = { invoke: async () => { called += 1; return {}; } };

  await agent.maybeTriggerLLMWikiLearning("question", "answer", "s1");
  assert.equal(called, 0);
});

test("ProductionAgent.maybeTriggerLLMWikiLearning: should skip when auto learning disabled", async () => {
  const agent = createAgent({
    llmWikiAutoLearningEnabled: false,
    llmWikiPath: "/tmp/llm_wiki",
    knowledgeRetriever: {
      type: "llm_wiki",
      retrieve: async () => ({ references: [] }),
    },
    llmWikiLearningConfig: {
      writeEnabled: false,
      mode: "candidate",
    },
  });

  let retrieveCalled = 0;
  agent.knowledgeRetriever = {
    type: "llm_wiki",
    retrieve: async () => {
      retrieveCalled += 1;
      return { references: [] };
    },
  };
  agent.options.knowledgeRetriever = agent.knowledgeRetriever;

  await agent.maybeTriggerLLMWikiLearning("question", "answer", "s2", { usedSearchKnowledge: true });
  assert.equal(retrieveCalled, 0);
});

test("ProductionAgent.maybeTriggerLLMWikiLearning: should skip when search_knowledge not used in this round", async () => {
  const agent = createAgent({
    llmWikiAutoLearningEnabled: true,
    llmWikiPath: "/tmp/llm_wiki",
    knowledgeRetriever: {
      type: "llm_wiki",
      retrieve: async () => ({ references: [] }),
    },
    llmWikiLearningConfig: {
      writeEnabled: false,
      mode: "candidate",
    },
  });

  let retrieveCalled = 0;
  agent.knowledgeRetriever = {
    type: "llm_wiki",
    retrieve: async () => {
      retrieveCalled += 1;
      return { references: [] };
    },
  };
  agent.options.knowledgeRetriever = agent.knowledgeRetriever;

  await agent.maybeTriggerLLMWikiLearning("question", "answer", "s3", { usedSearchKnowledge: false });
  assert.equal(retrieveCalled, 0);
});

test("ProductionAgent.chat: should complete normally with llm wiki learning config present", async () => {
  const agent = createAgent({
    llmWikiAutoLearningEnabled: false,
    llmWikiPath: "/tmp/llm_wiki",
    knowledgeRetriever: {
      type: "llm_wiki",
      retrieve: async () => ({ references: [] }),
    },
    llmWikiLearningConfig: {
      writeEnabled: false,
      mode: "candidate",
    },
  });

  const result = await agent.chat("hello", null, null, "wiki-learning-chat");
  assert.equal(result, "final answer");
});

test("ProductionAgent.chat: should not attempt learning when round has no search_knowledge tool call", async () => {
  const agent = createAgent({
    llmWikiAutoLearningEnabled: true,
    llmWikiPath: "/tmp/llm_wiki",
    knowledgeRetriever: {
      type: "llm_wiki",
      retrieve: async () => ({ references: [] }),
    },
    llmWikiLearningConfig: {
      writeEnabled: false,
      mode: "candidate",
    },
  });

  let called = 0;
  agent.maybeTriggerLLMWikiLearning = async (userInput, answer, sessionId, options = {}) => {
    called += 1;
    assert.equal(options.usedSearchKnowledge, false);
  };

  const result = await agent.chat("hello", null, null, "wiki-learning-no-search");
  assert.equal(result, "final answer");
  assert.equal(called, 1);
});

test("ProductionAgent.maybeTriggerLLMWikiLearning: direct mode config should be retained", async () => {
  const agent = createAgent({
    llmWikiAutoLearningEnabled: true,
    llmWikiPath: "/tmp/llm_wiki",
    knowledgeRetriever: {
      type: "llm_wiki",
      retrieve: async () => ({ references: [] }),
    },
    llmWikiLearningConfig: {
      writeEnabled: true,
      mode: "direct",
    },
  });

  assert.equal(agent.options.llmWikiLearningConfig.mode, "direct");
  assert.equal(agent.options.llmWikiLearningConfig.writeEnabled, true);
});
