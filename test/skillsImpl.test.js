import assert from "node:assert/strict";
import test from "node:test";

import {
  skillAIAgentTeaching,
  skillComponentConsulting,
  skillCodeExplanation,
} from "../skills/index.js";

test("skillAIAgentTeaching: should generate teaching content", async () => {
  const result = await skillAIAgentTeaching("ReAct架构", "beginner");
  assert.ok(result.includes("ReAct架构"));
  assert.ok(result.includes("beginner"));
  assert.ok(result.includes("AI Agent 教学内容"));
});

test("skillAIAgentTeaching: should use default level", async () => {
  const result = await skillAIAgentTeaching("主题");
  assert.ok(result.includes("beginner"));
});

test("skillAIAgentTeaching: should support all levels", async () => {
  const intermediate = await skillAIAgentTeaching("主题", "intermediate");
  assert.ok(intermediate.includes("intermediate"));

  const advanced = await skillAIAgentTeaching("主题", "advanced");
  assert.ok(advanced.includes("advanced"));
});

test("skillComponentConsulting: should require knowledge context first", async () => {
  const result = await skillComponentConsulting("如何配置流式响应", "SuspendedBallChat");
  assert.ok(result.includes("requiresKnowledgeLookup"));
  assert.ok(result.includes("请先调用 search_knowledge"));
});

test("skillComponentConsulting: should summarize based on provided knowledge context", async () => {
  const result = await skillComponentConsulting(
    "如何配置流式响应",
    "SuspendedBallChat",
    "文档显示：enable-streaming 可开启流式响应；可通过 custom-request-config 追加请求参数。"
  );
  assert.ok(result.includes("basedOnKnowledge"));
  assert.ok(result.includes("enable-streaming"));
  assert.ok(result.includes("请严格基于以上文档摘要回答用户"));
});

test("skillComponentConsulting: should act as strict summarizer", async () => {
  const result = await skillComponentConsulting(
    "如何配置流式响应",
    "SuspendedBallChat",
    "文档显示：enable-streaming 可开启流式响应；可通过 custom-request-config 追加请求参数。"
  );
  assert.ok(result.includes("已检索到的组件文档摘要"));
  assert.ok(result.includes("不要脱离文档摘要自行补充未被检索到的组件事实"));
});

test("skillComponentConsulting: should use dynamic component title", async () => {
  const result = await skillComponentConsulting(
    "如何关闭面板",
    "ChatPanel",
    "文档显示：ChatPanel 支持 @close 事件，可通过关闭事件控制面板状态。"
  );
  assert.ok(result.includes("ChatPanel 组件咨询（基于已检索文档）"));
  assert.ok(result.includes("组件: ChatPanel"));
  assert.ok(result.includes("ChatPanel 支持 @close 事件"));
});

test("skillComponentConsulting: should generate consulting content", async () => {
  const result = await skillComponentConsulting("如何配置流式响应", "SuspendedBallChat");
  assert.ok(result.includes("SuspendedBallChat"));
  assert.ok(result.includes("如何配置流式响应"));
});

test("skillComponentConsulting: should use default component", async () => {
  const result = await skillComponentConsulting("问题");
  assert.ok(result.includes("SuspendedBallChat"));
});

test("skillCodeExplanation: should generate code explanation", async () => {
  const code = "async function fetch() { return await api.get(); }";
  const result = await skillCodeExplanation(code, "detailed");
  assert.ok(result.includes("fetch"));
  assert.ok(result.includes("detailed"));
});

test("skillCodeExplanation: should use default detail level", async () => {
  const code = "function test() {}";
  const result = await skillCodeExplanation(code);
  assert.ok(result.includes("normal"));
});
