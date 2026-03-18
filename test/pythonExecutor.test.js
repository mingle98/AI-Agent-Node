import assert from "node:assert/strict";
import test from "node:test";

import { skillPythonExecutor, setScriptGeneratorLLM } from "../skills/pythonExecutor.js";

test("pythonExecutor: should handle task without LLM (fallback)", async () => {
  const result = await skillPythonExecutor("计算平均值", "10, 20, 30");
  assert.ok(result.includes("Python 脚本执行结果"));
  assert.ok(result.includes("任务"));
});

test("pythonExecutor: should handle empty data input", async () => {
  const result = await skillPythonExecutor("测试任务");
  assert.ok(result.includes("Python 脚本执行结果"));
});

test("pythonExecutor: should handle stats-related task", async () => {
  const result = await skillPythonExecutor("统计数据", "1, 2, 3, 4, 5");
  assert.ok(result.includes("任务"));
  assert.ok(result.includes("执行脚本"));
});

test("pythonExecutor: should handle funnel-related task", async () => {
  const result = await skillPythonExecutor("漏斗分析", "exposure=1000, click=100");
  assert.ok(result.includes("任务"));
});

test("pythonExecutor: should include output format option", async () => {
  const result = await skillPythonExecutor("计算", "", "json");
  assert.ok(result.includes("任务"));
});

test("pythonExecutor: setScriptGeneratorLLM should be exported", () => {
  assert.equal(typeof setScriptGeneratorLLM, "function");
});
