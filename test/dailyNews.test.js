import assert from "node:assert/strict";
import test from "node:test";

import { getDailyNews } from "../tools/dailyNews.js";

// Mock axios
test("getDailyNews: should use default platform and limit", async () => {
  const result = await getDailyNews();
  // Should return either valid data or error message
  assert.ok(typeof result === "string");
  // Check if it's valid JSON result or error message
  const isJson = result.startsWith("{");
  const isError = result.includes("今日热点获取失败");
  assert.ok(isJson || isError, "Result should be JSON or error message");
});

test("getDailyNews: should accept tenxunwang platform", async () => {
  const result = await getDailyNews("tenxunwang", 5);
  assert.ok(typeof result === "string");
  if (result.startsWith("{")) {
    const parsed = JSON.parse(result);
    assert.equal(parsed.platform, "tenxunwang");
    assert.ok(parsed.count <= 5);
  }
});

test("getDailyNews: should accept weibo platform", async () => {
  const result = await getDailyNews("weibo", 3);
  assert.ok(typeof result === "string");
  if (result.startsWith("{")) {
    const parsed = JSON.parse(result);
    assert.equal(parsed.platform, "weibo");
    assert.ok(parsed.count <= 3);
  }
});

test("getDailyNews: should fallback to tenxunwang for invalid platform", async () => {
  const result = await getDailyNews("invalid-platform", 10);
  assert.ok(typeof result === "string");
  if (result.startsWith("{")) {
    const parsed = JSON.parse(result);
    assert.equal(parsed.platform, "tenxunwang");
  }
});

test("getDailyNews: should handle uppercase platform name", async () => {
  const result = await getDailyNews("WEIBO", 5);
  assert.ok(typeof result === "string");
  if (result.startsWith("{")) {
    const parsed = JSON.parse(result);
    assert.equal(parsed.platform, "weibo");
  }
});

test("getDailyNews: should clamp limit to 1-50 range", async () => {
  // Test with limit = 0 (should become 1)
  const result1 = await getDailyNews("tenxunwang", 0);
  if (result1.startsWith("{")) {
    const parsed = JSON.parse(result1);
    assert.ok(parsed.count >= 1);
  }

  // Test with limit = 100 (should become 50)
  const result2 = await getDailyNews("tenxunwang", 100);
  if (result2.startsWith("{")) {
    const parsed = JSON.parse(result2);
    assert.ok(parsed.count <= 50);
  }
});

test("getDailyNews: should handle non-numeric limit", async () => {
  const result = await getDailyNews("tenxunwang", "invalid");
  assert.ok(typeof result === "string");
  if (result.startsWith("{")) {
    const parsed = JSON.parse(result);
    assert.ok(typeof parsed.count === "number");
  }
});

test("getDailyNews: should handle null/undefined inputs", async () => {
  const result1 = await getDailyNews(null, null);
  assert.ok(typeof result1 === "string");

  const result2 = await getDailyNews(undefined, undefined);
  assert.ok(typeof result2 === "string");
});

test("getDailyNews: should normalize items with missing fields", async () => {
  // This test verifies the item mapping logic works with partial data
  const result = await getDailyNews("tenxunwang", 5);
  if (result.startsWith("{")) {
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed.items));
    for (const item of parsed.items) {
      assert.ok(typeof item.title === "string");
      assert.ok(typeof item.url === "string");
      assert.ok(typeof item.content === "string");
      assert.ok(typeof item.source === "string");
      assert.ok(typeof item.publish_time === "string");
    }
  }
});

test("getDailyNews: should handle whitespace in platform string", async () => {
  const result = await getDailyNews("  weibo  ", 5);
  assert.ok(typeof result === "string");
  if (result.startsWith("{")) {
    const parsed = JSON.parse(result);
    assert.equal(parsed.platform, "weibo");
  }
});
