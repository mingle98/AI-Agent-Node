import assert from "node:assert/strict";
import test from "node:test";

import {
  generatePythonScript,
  analyzeScriptResult,
  setScriptGeneratorLLM,
  checkScriptSafety,
  SCRIPT_GENERATOR_METADATA
} from "../tools/scriptGenerator.js";

test("scriptGenerator: checkScriptSafety should detect dangerous code", () => {
  const dangerousCode = "import os; os.system('rm -rf /')";
  const result = checkScriptSafety(dangerousCode);
  assert.equal(result.safe, false);
  assert.ok(result.reason);
});

test("scriptGenerator: checkScriptSafety should allow safe code", () => {
  const safeCode = "import statistics; print(sum([1, 2, 3]))";
  const result = checkScriptSafety(safeCode);
  assert.equal(result.safe, true);
  assert.equal(result.reason, null);
});

test("scriptGenerator: checkScriptSafety should detect eval", () => {
  const code = "eval('print(1)')";
  const result = checkScriptSafety(code);
  assert.equal(result.safe, false);
  assert.ok(result.reason.includes("eval"));
});

test("scriptGenerator: checkScriptSafety should detect exec", () => {
  const code = "exec('print(1)')";
  const result = checkScriptSafety(code);
  assert.equal(result.safe, false);
  assert.ok(result.reason.includes("exec"));
});

test("scriptGenerator: checkScriptSafety should detect file write", () => {
  const code = "open('file.txt', 'w').write('data')";
  const result = checkScriptSafety(code);
  assert.equal(result.safe, false);
  assert.ok(result.reason.includes("写入"));
});

test("scriptGenerator: checkScriptSafety should detect infinite while loop", () => {
  const code = "while True: pass";
  const result = checkScriptSafety(code);
  assert.equal(result.safe, false);
  assert.ok(result.reason.includes("无限循环"));
});

test("scriptGenerator: checkScriptSafety should detect network imports", () => {
  const code = "import socket";
  const result = checkScriptSafety(code);
  assert.equal(result.safe, false);
  assert.ok(result.reason.includes("网络"));
});

test("scriptGenerator: generatePythonScript should use fallback without LLM", async () => {
  const result = await generatePythonScript("测试任务", "数据", "auto");
  assert.ok(result.includes("任务描述"));
  assert.ok(result.includes("test") || result.includes("测试"));
});

test("scriptGenerator: generatePythonScript should accept custom fallback", async () => {
  const customFallback = () => "# Custom fallback script";
  const result = await generatePythonScript("任务", "", "auto", customFallback);
  assert.ok(result.includes("Custom fallback"));
});

test("scriptGenerator: analyzeScriptResult should use fallback without LLM", async () => {
  const result = await analyzeScriptResult("任务", "脚本", "输出", "summary");
  assert.ok(result.includes("分析") || result.includes("结果") || result.includes("✅") || result.includes("📊"));
});

test("scriptGenerator: setScriptGeneratorLLM should accept null", () => {
  // Should not throw
  setScriptGeneratorLLM(null);
  assert.ok(true);
});

test("scriptGenerator: SCRIPT_GENERATOR_METADATA should be defined", () => {
  assert.equal(SCRIPT_GENERATOR_METADATA.name, "script_generator");
  assert.ok(SCRIPT_GENERATOR_METADATA.description);
  assert.ok(SCRIPT_GENERATOR_METADATA.parameters);
});

test("scriptGenerator: generatePythonScript should handle different output formats", async () => {
  const formats = ["auto", "summary", "json", "csv", "chart_data"];
  for (const format of formats) {
    const result = await generatePythonScript("统计", "1,2,3", format);
    assert.ok(result.length > 0);
  }
});
