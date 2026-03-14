import assert from "node:assert/strict";
import test from "node:test";

import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ContextManager } from "../agent/contextManager.js";

function createToolCallAi(name = "some_tool", id = "call_1") {
  const msg = new AIMessage({ content: "" });
  msg.tool_calls = [{ name, id, args: { arg1: "x" } }];
  return msg;
}

function buildConversationWithToolTurns(turnCount = 6) {
  const messages = [new SystemMessage("sys")];
  for (let i = 0; i < turnCount; i += 1) {
    messages.push(new HumanMessage(`q${i}`));
    if (i % 2 === 0) {
      const ai = createToolCallAi("render_mermaid", `call_${i}`);
      messages.push(ai);
      messages.push(
        new ToolMessage({
          content: `tool_result_${i}`,
          tool_call_id: `call_${i}`,
        })
      );
      messages.push(new AIMessage({ content: `final_${i}` }));
    } else {
      messages.push(new AIMessage({ content: `a${i}` }));
    }
  }
  return messages;
}

function assertNoOrphanTools(messages) {
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (m?._getType?.() === "tool") {
      let j = i - 1;
      while (j >= 0 && messages[j]?._getType?.() === "system") {
        j -= 1;
      }
      const prev = messages[j];
      assert.ok(prev, "tool message must have a previous non-system message");
      assert.equal(prev._getType(), "ai", "tool must follow an ai message (ignoring system messages)");
      assert.ok(
        Array.isArray(prev.tool_calls) && prev.tool_calls.length > 0,
        "tool must follow ai with tool_calls"
      );
    }
  }
}

function createContextManager(strategy) {
  // llm/embeddings 在这些测试里不会被实际调用（summarize/hybrid 会调用 generateSummary，但我们避免触发）。
  return new ContextManager(null, null, {
    strategy,
    maxHistoryMessages: 10,
    keepRecentMessages: 6,
  });
}

test("trimStrategy: should not leave orphan tool messages after trimming", () => {
  const cm = createContextManager("trim");
  const messages = buildConversationWithToolTurns(10);
  const trimmed = cm.trimStrategy(messages);
  assert.ok(trimmed.length <= 10);
  assertNoOrphanTools(trimmed);
});

test("splitTurnsByRecentMessageLimit: old+recent should reconstruct without splitting turns", () => {
  const cm = createContextManager("trim");
  const messages = buildConversationWithToolTurns(6);
  const conversation = messages.filter((m) => m._getType() !== "system");
  const turns = cm.splitIntoTurns(conversation);
  const { oldTurns, recentTurns } = cm.splitTurnsByRecentMessageLimit(turns, 6);
  const reconstructed = [...oldTurns.flat(), ...recentTurns.flat()];
  assert.equal(reconstructed.length, conversation.length);
});

test("vectorStrategy: recent/old split should not split a tool chain (no orphan tool)", async () => {
  const cm = new ContextManager(null, null, {
    strategy: "vector",
    maxHistoryMessages: 50,
    keepRecentMessages: 6,
  });
  // stub vector store init + store to avoid embeddings requirement
  cm.initializeVectorStore = async () => {
    cm.conversationVectorStore = { addDocuments: async () => {} };
  };
  cm.storeConversations = async () => {};
  cm.retrieveRelevantConversations = async () => [];

  const messages = buildConversationWithToolTurns(8);
  const result = await cm.vectorStrategy(messages);
  assert.ok(Array.isArray(result));
  assertNoOrphanTools(result);
});

test("summarizeStrategy: should not leave orphan tool messages after summarization", async () => {
  const cm = new ContextManager(null, null, {
    strategy: "summarize",
    maxHistoryMessages: 50,
    keepRecentMessages: 6,
  });
  cm.generateSummary = async () => "summary";

  const messages = buildConversationWithToolTurns(8);
  const result = await cm.summarizeStrategy(messages);
  assert.ok(Array.isArray(result));
  assertNoOrphanTools(result);
});

test("extreme long last turn: recent truncation should not start with orphan tool (summarize/vector/hybrid)", async () => {
  const messages = [new SystemMessage("sys")];
  messages.push(new HumanMessage("q"));

  // 构造一个超长 turn：重复 (ai(tool_calls) -> tool) 多次，确保长度 > keepRecentMessages。
  // 注意：tool message 必须紧跟在带 tool_calls 的 ai message 后面，这是协议约束。
  for (let i = 0; i < 12; i += 1) {
    const ai = createToolCallAi("render_mermaid", `call_long_${i}`);
    messages.push(ai);
    messages.push(
      new ToolMessage({
        content: `tool_${i}`,
        tool_call_id: `call_long_${i}`,
      })
    );
  }
  messages.push(new AIMessage({ content: "final_long" }));

  const keepRecentMessages = 6;

  const cmSumm = new ContextManager(null, null, {
    strategy: "summarize",
    maxHistoryMessages: 100,
    keepRecentMessages,
  });
  cmSumm.generateSummary = async () => "summary";
  const resSumm = await cmSumm.summarizeStrategy(messages);
  assertNoOrphanTools(resSumm);

  const cmVec = new ContextManager(null, null, {
    strategy: "vector",
    maxHistoryMessages: 100,
    keepRecentMessages,
  });
  cmVec.initializeVectorStore = async () => {
    cmVec.conversationVectorStore = { addDocuments: async () => {} };
  };
  cmVec.storeConversations = async () => {};
  cmVec.retrieveRelevantConversations = async () => [];
  const resVec = await cmVec.vectorStrategy(messages);
  assertNoOrphanTools(resVec);

  const cmHyb = new ContextManager(null, null, {
    strategy: "hybrid",
    maxHistoryMessages: 100,
    keepRecentMessages,
  });
  cmHyb.generateSummary = async () => "summary";
  cmHyb.initializeVectorStore = async () => {
    cmHyb.conversationVectorStore = { addDocuments: async () => {} };
  };
  cmHyb.storeConversations = async () => {};
  cmHyb.retrieveRelevantConversations = async () => [];
  const resHyb = await cmHyb.hybridStrategy(messages);
  assertNoOrphanTools(resHyb);
});

test("splitIntoTurns: should handle leading non-human residue messages", () => {
  const cm = createContextManager("trim");
  const conversation = [new AIMessage({ content: "residue" }), new HumanMessage("q"), new AIMessage({ content: "a" })];
  const turns = cm.splitIntoTurns(conversation);
  assert.equal(turns.length, 2);
  assert.equal(turns[0][0]._getType(), "ai");
  assert.equal(turns[1][0]._getType(), "human");
});

test("hybridStrategy: recent/old split should not split a tool chain (no orphan tool)", async () => {
  const cm = new ContextManager(null, null, {
    strategy: "hybrid",
    maxHistoryMessages: 50,
    keepRecentMessages: 6,
  });
  cm.generateSummary = async () => "summary";
  cm.initializeVectorStore = async () => {
    cm.conversationVectorStore = { addDocuments: async () => {} };
  };
  cm.storeConversations = async () => {};
  cm.retrieveRelevantConversations = async () => [];

  const messages = buildConversationWithToolTurns(8);
  const result = await cm.hybridStrategy(messages);
  assert.ok(Array.isArray(result));
  assertNoOrphanTools(result);
});
