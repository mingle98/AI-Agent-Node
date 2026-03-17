import assert from "node:assert/strict";
import test from "node:test";

import { resolveThinkingMode } from "../utils/thinkingMode.js";

test("resolveThinkingMode: should return undefined enableThinking when useThinkMode not provided", () => {
  const { enableThinking, useThinkMode } = resolveThinkingMode({}, true);
  assert.equal(enableThinking, undefined);
  assert.equal(useThinkMode, undefined);
});

test("resolveThinkingMode: should return true enableThinking when streaming and useThinkMode=true", () => {
  const { enableThinking, useThinkMode } = resolveThinkingMode({ useThinkMode: true }, true);
  assert.equal(enableThinking, true);
  assert.equal(useThinkMode, true);
});

test("resolveThinkingMode: should return false enableThinking when streaming and useThinkMode=false", () => {
  const { enableThinking, useThinkMode } = resolveThinkingMode({ useThinkMode: false }, true);
  assert.equal(enableThinking, false);
  assert.equal(useThinkMode, false);
});

test("resolveThinkingMode: should ignore useThinkMode in non-streaming", () => {
  const { enableThinking, useThinkMode } = resolveThinkingMode({ useThinkMode: true }, false);
  assert.equal(enableThinking, undefined);
  assert.equal(useThinkMode, true);
});

test("resolveThinkingMode: should ignore non-boolean useThinkMode", () => {
  const { enableThinking, useThinkMode } = resolveThinkingMode({ useThinkMode: "true" }, true);
  assert.equal(enableThinking, undefined);
  assert.equal(useThinkMode, undefined);
});
