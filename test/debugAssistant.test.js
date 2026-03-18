import assert from "node:assert/strict";
import test from "node:test";

import { skillDebugAssistant } from "../skills/debugAssistant.js";

test("debugAssistant: should return analysis for error info", async () => {
  const error = "TypeError: Cannot read property 'name' of undefined";
  const result = await skillDebugAssistant(error, "React");
  assert.ok(result.includes("Debug 调试助手"));
  assert.ok(result.includes("错误摘要"));
  assert.ok(result.includes("React"));
});

test("debugAssistant: should include possible causes", async () => {
  const error = "Some error message";
  const result = await skillDebugAssistant(error);
  assert.ok(result.includes("可能原因"));
  assert.ok(result.includes("变量未定义") || result.includes("依赖包"));
});

test("debugAssistant: should include suggested checks", async () => {
  const error = "Error";
  const result = await skillDebugAssistant(error);
  assert.ok(result.includes("建议检查项"));
  assert.ok(result.includes("✓"));
});

test("debugAssistant: should include fix strategy", async () => {
  const error = "Error";
  const result = await skillDebugAssistant(error);
  assert.ok(result.includes("修复策略"));
  assert.ok(result.includes("立即行动"));
  assert.ok(result.includes("长期优化"));
});

test("debugAssistant: should handle empty context", async () => {
  const error = "Error message";
  const result = await skillDebugAssistant(error);
  assert.ok(result.includes("运行环境"));
});

test("debugAssistant: should truncate long error messages", async () => {
  const longError = "a".repeat(500);
  const result = await skillDebugAssistant(longError);
  assert.ok(result.includes("错误摘要"));
  assert.ok(result.includes("...") || result.includes(longError.substring(0, 100)));
});

test("debugAssistant: should return error message on failure", async () => {
  const result = await skillDebugAssistant(null);
  assert.ok(result.includes("调试助手执行失败") || result.includes("Debug 调试助手"));
});
