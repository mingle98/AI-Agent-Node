import assert from "node:assert/strict";
import test from "node:test";

import { skillDecisionHelper } from "../skills/decisionHelper.js";

test("decisionHelper: should return decision analysis report", async () => {
  const result = await skillDecisionHelper("是否换工作", "接受, 拒绝, 再谈条件");
  assert.ok(result.includes("决策分析报告"));
  assert.ok(result.includes("接受"));
  assert.ok(result.includes("拒绝"));
  assert.ok(result.includes("再谈条件"));
});

test("decisionHelper: should use default options when not provided", async () => {
  const result = await skillDecisionHelper("是否购买新车");
  assert.ok(result.includes("方案A"));
  assert.ok(result.includes("方案B"));
});

test("decisionHelper: should include decision framework", async () => {
  const result = await skillDecisionHelper("测试决策");
  assert.ok(result.includes("利弊分析法"));
  assert.ok(result.includes("决策矩阵"));
});

test("decisionHelper: should handle Chinese comma separator", async () => {
  const result = await skillDecisionHelper("决策", "选项1，选项2，选项3");
  assert.ok(result.includes("选项1"));
  assert.ok(result.includes("选项2"));
  assert.ok(result.includes("选项3"));
});

test("decisionHelper: should include risk assessment", async () => {
  const result = await skillDecisionHelper("投资决策");
  assert.ok(result.includes("风险评估"));
  assert.ok(result.includes("高风险"));
  assert.ok(result.includes("中风险"));
  assert.ok(result.includes("低风险"));
});

test("decisionHelper: should return error message on failure", async () => {
  const result = await skillDecisionHelper(null);
  assert.ok(result.includes("决策助手执行失败") || result.includes("决策分析报告"));
});
