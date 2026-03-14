import assert from "node:assert/strict";
import test from "node:test";

import { skillCodeExplanation } from "../skills/codeExplanation.js";

test("skillCodeExplanation: should explain code with normal detail", async () => {
  const code = "function add(a, b) { return a + b; }";
  const result = await skillCodeExplanation(code, "normal");
  assert.ok(result.includes("normal"));
  assert.ok(result.includes("add(a, b)"));
});

test("skillCodeExplanation: should support all detail levels", async () => {
  const code = "const x = 1;";
  
  const brief = await skillCodeExplanation(code, "brief");
  assert.ok(brief.includes("brief"));
  
  const normal = await skillCodeExplanation(code, "normal");
  assert.ok(normal.includes("normal"));
  
  const detailed = await skillCodeExplanation(code, "detailed");
  assert.ok(detailed.includes("detailed"));
});

test("skillCodeExplanation: should use default detail level", async () => {
  const result = await skillCodeExplanation("const y = 2;");
  assert.ok(result.includes("normal"));
});

test("skillCodeExplanation: should handle empty code", async () => {
  const result = await skillCodeExplanation("");
  assert.ok(result.includes("0")); // codeLength is 0
});
