import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCode } from "../tools/codeAnalyzer.js";

test("analyzeCode: should analyze code with default language", () => {
  const code = "function add(a, b) { return a + b; }";
  const result = analyzeCode(code);
  assert.ok(result.includes("javascript"));
  assert.ok(result.includes("codeLength"));
});

test("analyzeCode: should analyze code with specified language", () => {
  const code = "def add(a, b): return a + b";
  const result = analyzeCode(code, "python");
  assert.ok(result.includes("python"));
});

test("analyzeCode: should handle empty code", () => {
  const result = analyzeCode("");
  assert.ok(result.includes("0")); // codeLength should be 0
});
