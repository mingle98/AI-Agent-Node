import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../config.js";

test("CONFIG: should have required configuration fields", () => {
  assert.equal(typeof CONFIG.maxHistoryMessages, "number");
  assert.equal(typeof CONFIG.maxContextLength, "number");
  assert.equal(typeof CONFIG.ragTopK, "number");
  assert.equal(typeof CONFIG.streamEnabled, "boolean");
});

test("CONFIG: default values should be reasonable", () => {
  assert.ok(CONFIG.maxHistoryMessages > 0);
  assert.ok(CONFIG.maxContextLength > 0);
  assert.ok(CONFIG.ragTopK > 0);
  assert.ok(CONFIG.streamEnabled === true || CONFIG.streamEnabled === false);
});
