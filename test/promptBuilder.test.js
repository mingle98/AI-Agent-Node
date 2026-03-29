import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../agent/promptBuilder.js";

test("buildSystemPrompt: should include tools, skills and rules", () => {
  const toolDefs = [
    {
      name: "t1",
      description: "d1",
      params: [{ name: "p1", type: "string", example: "x" }],
      example: 't1("x")',
    },
  ];
  const skillDefs = [
    {
      name: "s1",
      description: "sd1",
      functionality: "f1",
      params: [{ name: "k1", type: "string", example: "y", options: ["a", "b"] }],
      example: 's1("y")',
    },
  ];

  const prompt = buildSystemPrompt(toolDefs, skillDefs, { roleName: "R", roleDescription: "D" });
  assert.match(prompt, /你是一个R，D/);
  assert.match(prompt, /使用规则/);
  assert.match(prompt, /智能决策示例/);
  assert.match(prompt, /定时任务调度|schedule_task/);
  assert.match(prompt, /支持用户隔离|只执行一次/);
});

test("buildSystemPrompt: compact mode should trim examples and detail fields", () => {
  const toolDefs = [
    {
      name: "t1",
      description: "d1",
      params: [{ name: "p1", type: "string", example: "x" }],
      example: "TOOL_EXAMPLE_TOKEN",
    },
  ];
  const skillDefs = [
    {
      name: "s1",
      description: "sd1",
      functionality: "SKILL_FUNCTIONALITY_TOKEN",
      params: [{ name: "k1", type: "string", example: "y", options: ["a", "b"] }],
      example: "SKILL_EXAMPLE_TOKEN",
    },
  ];

  const prompt = buildSystemPrompt(toolDefs, skillDefs, {
    roleName: "R",
    roleDescription: "D",
    compact: true,
  });

  assert.doesNotMatch(prompt, /TOOL_EXAMPLE_TOKEN/);
  assert.doesNotMatch(prompt, /SKILL_FUNCTIONALITY_TOKEN/);
  assert.doesNotMatch(prompt, /SKILL_EXAMPLE_TOKEN/);
  assert.match(prompt, /优先选择最匹配用户意图/);
  assert.doesNotMatch(prompt, /批量压缩这些图片/);
});
