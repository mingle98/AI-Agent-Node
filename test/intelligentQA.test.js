import assert from "node:assert/strict";
import test from "node:test";

import { skillIntelligentQA } from "../skills/intelligentQA.js";

test("skillIntelligentQA: should handle ai_agent domain", async () => {
  const result = await skillIntelligentQA("什么是AI Agent", "ai_agent");
  assert.ok(result.includes("AI Agent"));
  assert.ok(result.includes("AI Agent 相关"));
});

test("skillIntelligentQA: should handle component domain", async () => {
  const result = await skillIntelligentQA("如何使用组件", "component");
  assert.ok(result.includes("前端组件相关"));
});

test("skillIntelligentQA: should use default general domain", async () => {
  const result = await skillIntelligentQA("一般问题");
  assert.ok(result.includes("通用问题"));
});

test("skillIntelligentQA: should handle unknown domain", async () => {
  const result = await skillIntelligentQA("问题", "unknown");
  assert.ok(result.includes("unknown"));
});
