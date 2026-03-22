import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml, wrapThinkingOpen, wrapThinkingClose } from "../utils/thinkingRenderer.js";

test("escapeHtml: should escape ampersand", () => {
  const result = escapeHtml("&");
  assert.equal(result, "&amp;");
});

test("escapeHtml: should escape less than", () => {
  const result = escapeHtml("<");
  assert.equal(result, "&lt;");
});

test("escapeHtml: should escape greater than", () => {
  const result = escapeHtml(">");
  assert.equal(result, "&gt;");
});

test("escapeHtml: should escape double quotes", () => {
  const result = escapeHtml('"');
  assert.equal(result, "&quot;");
});

test("escapeHtml: should escape single quotes", () => {
  const result = escapeHtml("'");
  assert.equal(result, "&#39;");
});

test("escapeHtml: should escape all special characters", () => {
  const result = escapeHtml('<script>alert("xss")</script>');
  assert.equal(result, "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
});

test("escapeHtml: should handle empty string", () => {
  const result = escapeHtml("");
  assert.equal(result, "");
});

test("escapeHtml: should handle number input", () => {
  const result = escapeHtml(123);
  assert.equal(result, "123");
});

test("escapeHtml: should handle null/undefined", () => {
  const result1 = escapeHtml(null);
  assert.equal(result1, "null");
  
  const result2 = escapeHtml(undefined);
  assert.equal(result2, "undefined");
});

test("escapeHtml: should handle plain text", () => {
  const result = escapeHtml("Hello World");
  assert.equal(result, "Hello World");
});

test("wrapThinkingOpen: should generate opening HTML with default summary", () => {
  const result = wrapThinkingOpen();
  assert.ok(result.includes('<details open'));
  assert.ok(result.includes('深度思考过程'));
  assert.ok(result.includes('🌀'));
  assert.ok(result.includes('<summary'));
  assert.ok(result.includes('<div'));
});

test("wrapThinkingOpen: should generate opening HTML with custom summary", () => {
  const result = wrapThinkingOpen("Custom Summary");
  assert.ok(result.includes('<details open'));
  assert.ok(result.includes('Custom Summary'));
  assert.ok(result.includes('🌀'));
});

test("wrapThinkingOpen: should escape HTML in summary text", () => {
  const result = wrapThinkingOpen("<script>alert('xss')</script>");
  assert.ok(!result.includes('<script>'));
  assert.ok(result.includes('&lt;script&gt;'));
});

test("wrapThinkingOpen: should handle empty summary", () => {
  const result = wrapThinkingOpen("");
  assert.ok(result.includes('<details open'));
});

test("wrapThinkingClose: should generate closing HTML", () => {
  const result = wrapThinkingClose();
  assert.equal(result, "</div></div></details>\n\n");
});

test("wrapThinkingOpen and wrapThinkingClose: should produce matching tags", () => {
  const open = wrapThinkingOpen("Test");
  const close = wrapThinkingClose();
  
  // The open tag should have a matching close structure
  assert.ok(open.includes('<details'));
  assert.ok(close.includes('</details>'));
  assert.ok(open.includes('<div'));
  assert.ok(close.includes('</div>'));
});
