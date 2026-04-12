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

test("buildSystemPrompt: should document file name and content search tools", () => {
  const prompt = buildSystemPrompt([], [], {});
  assert.match(prompt, /按文件名搜索: file_search/);
  assert.match(prompt, /按行读取文件片段: file_read_lines/);
  assert.match(prompt, /按行编辑文件片段: file_edit_lines/);
  assert.match(prompt, /按文本替换文件内容: file_replace_text/);
  assert.match(prompt, /maxReplacements=0 表示全部替换/);
  assert.match(prompt, /若读取被截断则禁止编辑/);
  assert.match(prompt, /单次最多 200 行/);
  assert.match(prompt, /按文件内容搜索: file_content_search/);
  assert.match(prompt, /默认最多返回 3 条/);
  assert.match(prompt, /最多扫描 30 个文本文件/);
  assert.match(prompt, /搜索 TODO \/ 某段文本/);
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
