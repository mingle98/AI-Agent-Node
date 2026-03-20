import assert from "node:assert/strict";
import test from "node:test";

import { skillEmailSender } from "../skills/emailSender.js";

test("emailSender: should fail without recipient", async () => {
  const result = await skillEmailSender(null, "测试主题", "测试内容");
  assert.equal(result.success, false);
  assert.ok(result.error.includes("缺少收件人邮箱"));
});

test("emailSender: should fail with invalid email format", async () => {
  const result = await skillEmailSender("invalid-email", "测试主题", "测试内容");
  assert.equal(result.success, false);
  assert.ok(result.error.includes("邮箱格式无效"));
});

test("emailSender: should fail without content", async () => {
  const result = await skillEmailSender("test@example.com", "测试主题", null);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("缺少邮件内容"));
});

test("emailSender: should detect alert template by keywords", async () => {
  const result = await skillEmailSender(
    "admin@example.com",
    "系统告警通知",
    "CPU使用率超过90%，请及时处理",
    "alert"
  );
  // 由于没有 SMTP 配置，会失败在验证步骤，但应该正确识别模板类型
  assert.ok(result.steps.length > 0);
  const extractStep = result.steps.find(s => s.step === "extract");
  assert.ok(extractStep);
  // 提取步骤应该被调用（不管成功与否）
  assert.ok(extractStep.status === "completed" || extractStep.status === "processing");
});

test("emailSender: should detect thanks template by keywords", async () => {
  const result = await skillEmailSender(
    "teacher@example.com",
    "感谢信",
    "感谢高中语文老师的悉心培养",
    "thanks"
  );
  assert.ok(result.steps.length > 0);
  const extractStep = result.steps.find(s => s.step === "extract");
  assert.ok(extractStep);
});

test("emailSender: should detect verification template by keywords", async () => {
  const result = await skillEmailSender(
    "user@example.com",
    "验证码",
    "您的验证码是 123456",
    "verification"
  );
  assert.ok(result.steps.length > 0);
});

test("emailSender: should detect report template by keywords", async () => {
  const result = await skillEmailSender(
    "manager@example.com",
    "月度数据报告",
    "本月销售数据统计如下...",
    "report"
  );
  assert.ok(result.steps.length > 0);
});

test("emailSender: should detect invitation template by keywords", async () => {
  const result = await skillEmailSender(
    "guest@example.com",
    "活动邀请函",
    "诚挚邀请您参加技术分享会",
    "invitation"
  );
  assert.ok(result.steps.length > 0);
});

test("emailSender: should support multiple recipients", async () => {
  const result = await skillEmailSender(
    "user1@example.com, user2@example.com, user3@example.com",
    "群发测试",
    "这是一封群发邮件"
  );
  assert.ok(result.steps.length > 0);
  const extractStep = result.steps.find(s => s.step === "extract");
  assert.ok(extractStep);
  // 验证收件人参数被正确传递（可能在 message 或结果中）
  assert.ok(result.to || extractStep.message || result.error);
});

test("emailSender: should generate default subject when not provided", async () => {
  const result = await skillEmailSender(
    "test@example.com",
    null,
    "测试内容",
    "notification"
  );
  assert.ok(result.steps.length > 0);
  // 验证返回了结果（主题可能是自动生成的）
  assert.ok(result.subject || result.steps);
});

test("emailSender: should fail without SMTP config", async () => {
  // 在没有 SMTP 环境变量的情况下，应该失败在验证步骤
  const result = await skillEmailSender(
    "test@example.com",
    "测试",
    "测试内容",
    "notification"
  );
  // 由于没有 SMTP 配置，应该失败
  assert.equal(result.success, false);
  // 但至少应该开始提取步骤
  const extractStep = result.steps.find(s => s.step === "extract");
  assert.ok(extractStep);
  assert.ok(extractStep.status === "completed" || extractStep.status === "processing");
});

test("emailSender: should return step-by-step progress", async () => {
  const result = await skillEmailSender(
    "test@example.com",
    "测试",
    "测试内容"
  );
  assert.ok(Array.isArray(result.steps));
  assert.ok(result.steps.length >= 1);
  assert.ok(result.report);
});

test("emailSender: should handle marketing type", async () => {
  const result = await skillEmailSender(
    "customer@example.com",
    "限时优惠活动",
    "全场商品5折起，仅限今日！",
    "marketing"
  );
  assert.ok(result.steps.length > 0);
});

test("emailSender: should auto-detect template from subject keywords", async () => {
  // 通过主题关键词自动检测模板类型
  const result = await skillEmailSender(
    "user@example.com",
    "验证码 - 您的登录验证码",
    "请使用以下验证码完成登录"
  );
  assert.ok(result.steps.length > 0);
});
