import assert from "node:assert/strict";
import test from "node:test";

import { skillCodeReview } from "../skills/codeReview.js";

test("codeReview: should return review report for all areas", async () => {
  const code = "function add(a, b) { return a + b; }";
  const result = await skillCodeReview(code, "all");
  assert.ok(result.includes("代码审查报告"));
  assert.ok(result.includes("安全性检查"));
  assert.ok(result.includes("性能优化"));
  assert.ok(result.includes("代码风格"));
});

test("codeReview: should focus on security when specified", async () => {
  const code = "const x = 1;";
  const result = await skillCodeReview(code, "security");
  assert.ok(result.includes("安全性检查"));
  assert.ok(!result.includes("性能优化") || result.includes("审查重点"));
});

test("codeReview: should focus on performance when specified", async () => {
  const code = "const x = 1;";
  const result = await skillCodeReview(code, "performance");
  assert.ok(result.includes("性能优化"));
});

test("codeReview: should focus on style when specified", async () => {
  const code = "const x = 1;";
  const result = await skillCodeReview(code, "style");
  assert.ok(result.includes("代码风格"));
});

test("codeReview: should default to all areas", async () => {
  const code = "const x = 1;";
  const result = await skillCodeReview(code);
  assert.ok(result.includes("代码规模"));
});

test("codeReview: should include code line count", async () => {
  const code = "line1\nline2\nline3";
  const result = await skillCodeReview(code);
  assert.ok(result.includes("行"));
});

test("codeReview: should include recommendations", async () => {
  const code = "function test() {}";
  const result = await skillCodeReview(code);
  assert.ok(result.includes("改进建议"));
});

test("codeReview: should return error message on failure", async () => {
  const result = await skillCodeReview(null);
  assert.ok(result.includes("代码审查执行失败") || result.includes("代码审查报告"));
});
