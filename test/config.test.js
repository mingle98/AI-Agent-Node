import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../config.js";

test("CONFIG: should have required configuration fields", () => {
  assert.equal(typeof CONFIG.maxHistoryMessages, "number");
  assert.equal(typeof CONFIG.maxContextLength, "number");
  assert.equal(typeof CONFIG.ragTopK, "number");
  assert.equal(typeof CONFIG.streamEnabled, "boolean");
  assert.equal(typeof CONFIG.knowledgeSearchProvider, "string");
  assert.equal(typeof CONFIG.llmWikiTopK, "number");
  assert.equal(typeof CONFIG.llmWikiAutoLearningEnabled, "boolean");
  assert.equal(typeof CONFIG.llmWikiLearningMode, "string");
});

test("CONFIG: default values should be reasonable", () => {
  assert.ok(CONFIG.maxHistoryMessages > 0);
  assert.ok(CONFIG.maxContextLength > 0);
  assert.ok(CONFIG.ragTopK > 0);
  assert.ok(CONFIG.streamEnabled === true || CONFIG.streamEnabled === false);
  assert.ok(["rag", "llm_wiki"].includes(CONFIG.knowledgeSearchProvider));
  assert.ok(CONFIG.llmWikiTopK > 0);
  assert.ok(CONFIG.llmWikiAutoLearningEnabled === true || CONFIG.llmWikiAutoLearningEnabled === false);
  assert.ok(["candidate", "direct"].includes(CONFIG.llmWikiLearningMode));
});
