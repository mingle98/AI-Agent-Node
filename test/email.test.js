import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";

import {
  sendEmail,
  sendTemplateEmail,
  verifySmtpConfig
} from "../tools/email.js";

const originalCreateTransport = nodemailer.createTransport;

function mockTransport({ verifyImpl, sendMailImpl, closeImpl } = {}) {
  const transport = {
    verify: verifyImpl || (async () => true),
    sendMail: sendMailImpl || (async (mail) => ({
      messageId: "msg-1",
      accepted: [mail.to],
      rejected: [],
      response: "250 OK",
      envelope: { to: [mail.to], from: "sender@test.com" }
    })),
    close: closeImpl || (() => {})
  };

  nodemailer.createTransport = () => transport;
  return transport;
}

test("email.sendEmail: should validate required fields", async () => {
  let result = await sendEmail({ subject: "s", text: "c" });
  assert.equal(result.success, false);
  assert.match(result.error, /收件人邮箱/);

  result = await sendEmail({ to: "a@test.com", text: "c" });
  assert.equal(result.success, false);
  assert.match(result.error, /邮件主题/);

  result = await sendEmail({ to: "a@test.com", subject: "s" });
  assert.equal(result.success, false);
  assert.match(result.error, /邮件内容/);
});

test("email.sendEmail: should fail when smtp config incomplete", async () => {
  const result = await sendEmail({
    to: "a@test.com",
    subject: "subject",
    text: "hello",
    smtp: { host: "smtp.test.com", auth: { user: "" } }
  });

  assert.equal(result.success, false);
  assert.match(result.error, /SMTP 配置不完整/);
});

test("email.sendEmail: should send html mail with attachments", async () => {
  let capturedMail;
  let verifyCalled = false;
  const smtp = { host: "smtp.test.com", port: 587, secure: false, auth: { user: "sender@test.com", pass: "x" } };

  mockTransport({
    verifyImpl: async () => {
      verifyCalled = true;
      return true;
    },
    sendMailImpl: async (mail) => {
      capturedMail = mail;
      return {
        messageId: "msg-2",
        accepted: ["to@test.com"],
        rejected: [],
        response: "250 sent",
        envelope: { to: ["to@test.com"], from: "sender@test.com" }
      };
    }
  });

  const result = await sendEmail({
    to: "to@test.com",
    subject: "hello",
    text: "plain",
    html: "<p>html</p>",
    from: "系统通知",
    attachments: [{ filename: "a.txt", content: "A", contentType: "text/plain" }],
    smtp
  });

  assert.equal(result.success, true);
  assert.equal(verifyCalled, true);
  assert.equal(capturedMail.from, '"系统通知" <sender@test.com>');
  assert.equal(capturedMail.text, undefined);
  assert.equal(capturedMail.html, "<p>html</p>");
  assert.equal(capturedMail.attachments.length, 1);
  assert.equal(result.messageId, "msg-2");
});

test("email.sendEmail: should return error object when transporter fails", async () => {
  mockTransport({
    verifyImpl: async () => {
      const err = new Error("auth failed");
      err.code = "EAUTH";
      throw err;
    }
  });

  const result = await sendEmail({
    to: "to@test.com",
    subject: "hello",
    text: "plain",
    smtp: { host: "smtp.test.com", auth: { user: "sender@test.com", pass: "x" } }
  });

  assert.equal(result.success, false);
  assert.equal(result.code, "EAUTH");
  assert.match(result.error, /auth failed/);
});

test("email.sendTemplateEmail: should render builtin template and replace variables", async () => {
  let capturedMail;

  mockTransport({
    sendMailImpl: async (mail) => {
      capturedMail = mail;
      return {
        messageId: "msg-3",
        accepted: [mail.to],
        rejected: [],
        response: "250 ok",
        envelope: { to: [mail.to], from: "sender@test.com" }
      };
    }
  });

  const result = await sendTemplateEmail({
    to: "u@test.com",
    template: "verification",
    variables: {
      title: "登录验证码",
      message: "请使用验证码",
      code: "123456",
      expireTime: "5 分钟",
      time: "2026-03-30"
    },
    subject: "验证码",
    smtp: { host: "smtp.test.com", auth: { user: "sender@test.com", pass: "x" } }
  });

  assert.equal(result.success, true);
  assert.match(capturedMail.html, /123456/);
  assert.match(capturedMail.html, /登录验证码/);
});

test("email.sendTemplateEmail: should support custom template string", async () => {
  let capturedMail;

  mockTransport({
    sendMailImpl: async (mail) => {
      capturedMail = mail;
      return {
        messageId: "msg-4",
        accepted: [mail.to],
        rejected: [],
        response: "250 ok",
        envelope: { to: [mail.to], from: "sender@test.com" }
      };
    }
  });

  const result = await sendTemplateEmail({
    to: "u@test.com",
    template: "Hi {{name}}",
    variables: { name: "Alice" },
    subject: "custom",
    smtp: { host: "smtp.test.com", auth: { user: "sender@test.com", pass: "x" } }
  });

  assert.equal(result.success, true);
  assert.equal(capturedMail.html, "Hi Alice");
});

test("email.verifySmtpConfig: should fail when host missing", async () => {
  const result = await verifySmtpConfig({ auth: { user: "a", pass: "b" } });
  assert.equal(result.success, false);
  assert.equal(result.code, "SMTP_NOT_CONFIGURED");
});

test("email.verifySmtpConfig: should return success when verify passes", async () => {
  let closed = false;
  mockTransport({
    verifyImpl: async () => true,
    closeImpl: () => {
      closed = true;
    }
  });

  const result = await verifySmtpConfig({ host: "smtp.test.com", auth: { user: "a", pass: "b" } });
  assert.equal(result.success, true);
  assert.equal(closed, true);
});

test("email.verifySmtpConfig: should return failure and close transporter", async () => {
  let closed = false;
  mockTransport({
    verifyImpl: async () => {
      const err = new Error("verify failed");
      err.code = "ECONNECTION";
      throw err;
    },
    closeImpl: () => {
      closed = true;
    }
  });

  const result = await verifySmtpConfig({ host: "smtp.test.com", auth: { user: "a", pass: "b" } });
  assert.equal(result.success, false);
  assert.equal(result.code, "ECONNECTION");
  assert.equal(closed, true);
});

test.after(() => {
  nodemailer.createTransport = originalCreateTransport;
});
