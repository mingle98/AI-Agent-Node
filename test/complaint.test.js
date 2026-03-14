import assert from "node:assert/strict";
import test from "node:test";

import { skillComplaintHandling } from "../skills/complaint.js";

test("skillComplaintHandling: should handle high severity complaint", async () => {
  const result = await skillComplaintHandling("ORD001", "质量问题", "小明");
  assert.ok(result.includes("订单信息"));
  assert.ok(result.includes("投诉级别"));
  assert.ok(result.includes("解决方案"));
  assert.ok(result.includes("高"));
  assert.ok(result.includes("立即处理"));
});

test("skillComplaintHandling: should handle medium severity complaint", async () => {
  const result = await skillComplaintHandling("ORD002", "配送延迟", "小红");
  assert.ok(result.includes("中"));
  assert.ok(result.includes("优先处理"));
});

test("skillComplaintHandling: should handle low severity complaint", async () => {
  const result = await skillComplaintHandling("ORD003", "其他", "小明");
  assert.ok(result.includes("低"));
  assert.ok(result.includes("标准流程"));
});

test("skillComplaintHandling: should handle unknown complaint type", async () => {
  const result = await skillComplaintHandling("ORD001", "未知类型", "小红");
  assert.ok(result.includes("中"));
});

test("skillComplaintHandling: should handle VIP user with priority", async () => {
  const result = await skillComplaintHandling("ORD001", "质量问题", "小明");
  assert.ok(result.includes("VIP加速"));
  assert.ok(result.includes("专属客服"));
});

test("skillComplaintHandling: should handle non-VIP user", async () => {
  const result = await skillComplaintHandling("ORD001", "质量问题", "小红");
  assert.ok(result.includes("24小时内"));
});
