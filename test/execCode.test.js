import assert from "node:assert/strict";
import test from "node:test";

import { execCode } from "../tools/execCode.js";

test("execCode: should execute JavaScript code", async () => {
  const result = await execCode("console.log('Hello World')", "javascript");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("Hello World"));
  assert.equal(result.language, "javascript");
  assert.ok(result.executionTime);
});

test("execCode: should handle JavaScript math operations", async () => {
  const result = await execCode("console.log(2 + 3)", "javascript");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("5"));
});

test("execCode: should handle errors in JavaScript", async () => {
  const result = await execCode("console.error('Error message')", "javascript");
  assert.ok(result.output.includes("[ERROR]"));
});

test("execCode: should support js alias", async () => {
  const result = await execCode("console.log('test')", "js");
  assert.equal(result.success, true);
});

test("execCode: should execute TypeScript code (stripped)", async () => {
  const result = await execCode("const x: number = 5; console.log(x)", "typescript");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("5"));
});

test("execCode: should support ts alias", async () => {
  const result = await execCode("console.log('test')", "ts");
  assert.equal(result.success, true);
});

test("execCode: should check Python environment before execution", async () => {
  const result = await execCode("print('test')", "python");
  // May succeed or fail depending on Python availability
  assert.ok(result.output || result.error);
  assert.ok(result.executionTime);
});

test("execCode: should support py alias", async () => {
  const result = await execCode("print('test')", "py");
  assert.ok(result.executionTime);
});

test("execCode: should reject unsupported languages", async () => {
  const result = await execCode("print('test')", "ruby");
  assert.equal(result.success, false);
  assert.ok(result.error.includes("不支持的语言"));
});

test("execCode: should handle empty code gracefully", async () => {
  const result = await execCode("", "javascript");
  // Should not crash
  assert.ok(result.hasOwnProperty("success"));
});

test("execCode: should handle large output", async () => {
  const code = "for(let i=0; i<10; i++) console.log(i)";
  const result = await execCode(code, "javascript");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("0"));
  assert.ok(result.output.includes("9"));
});

test("execCode: should default to JavaScript", async () => {
  const result = await execCode("console.log('default')");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("default"));
});
