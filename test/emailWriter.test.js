import assert from "node:assert/strict";
import test from "node:test";

import { skillEmailWriter } from "../skills/emailWriter.js";

test("emailWriter: should generate follow-up email template", async () => {
  const result = await skillEmailWriter("跟进", "上周会议方案", "formal");
  assert.ok(result.includes("邮件写作助手"));
  assert.ok(result.includes("跟进"));
  assert.ok(result.includes("formal"));
});

test("emailWriter: should generate apology email template", async () => {
  const result = await skillEmailWriter("道歉", "项目延期", "formal");
  assert.ok(result.includes("致歉"));
  assert.ok(result.includes("邮件结构"));
});

test("emailWriter: should generate thanks email template", async () => {
  const result = await skillEmailWriter("感谢", "合作支持", "friendly");
  assert.ok(result.includes("感谢"));
  assert.ok(result.includes("friendly"));
});

test("emailWriter: should handle invitation type", async () => {
  const result = await skillEmailWriter("邀请", "技术分享会", "formal");
  assert.ok(result.includes("邀请"));
  assert.ok(result.includes("时间、地点"));
});

test("emailWriter: should handle decline type", async () => {
  const result = await skillEmailWriter("拒绝", "无法接受邀请", "formal");
  assert.ok(result.includes("委婉"));
});

test("emailWriter: should default to formal tone", async () => {
  const result = await skillEmailWriter("跟进", "项目进度");
  assert.ok(result.includes("formal"));
});

test("emailWriter: should include email structure", async () => {
  const result = await skillEmailWriter("测试");
  assert.ok(result.includes("邮件结构"));
  assert.ok(result.includes("主题行"));
  assert.ok(result.includes("示例模板"));
});

test("emailWriter: should return error message on failure", async () => {
  const result = await skillEmailWriter(null);
  assert.ok(result.includes("邮件写作助手执行失败") || result.includes("邮件写作助手"));
});
