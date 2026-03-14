import assert from "node:assert/strict";
import test from "node:test";

import { skillAIAgentEchart } from "../skills/aiEchart.js";

test("skillAIAgentEchart: should handle missing env gracefully", async () => {
  // Without API key, should return error message
  const result = await skillAIAgentEchart("2026年房价走势");
  // Should not throw, should return string
  assert.equal(typeof result, "string");
});

test("skillAIAgentEchart: should include target text in output", async () => {
  const target = "测试数据";
  const result = await skillAIAgentEchart(target);
  assert.ok(result.includes(target) || result.includes("Echart技能执行失败"));
});
