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
