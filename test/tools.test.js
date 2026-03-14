import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_DEFINITIONS, TOOLS } from "../tools/index.js";

test("TOOL_DEFINITIONS: should export all tool definitions", () => {
  assert.ok(Array.isArray(TOOL_DEFINITIONS));
  assert.ok(TOOL_DEFINITIONS.length >= 4);
});

test("TOOL_DEFINITIONS: each tool should have required fields", () => {
  for (const tool of TOOL_DEFINITIONS) {
    assert.ok(tool.name, "Tool should have name");
    assert.ok(tool.description, "Tool should have description");
    assert.ok(Array.isArray(tool.params), "Tool should have params array");
    assert.ok(tool.example, "Tool should have example");
    assert.equal(typeof tool.func, "function", "Tool should have func");
  }
});

test("TOOLS: should map tool names to functions", () => {
  assert.equal(typeof TOOLS.search_knowledge, "function");
  assert.equal(typeof TOOLS.analyze_code, "function");
  assert.equal(typeof TOOLS.generate_document, "function");
  assert.equal(typeof TOOLS.render_mermaid, "function");
});

test("search_knowledge tool: should be defined", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "search_knowledge");
  assert.ok(tool);
  assert.equal(tool.params.length, 1);
  assert.ok(tool.special);
});

test("analyze_code tool: should have language options", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "analyze_code");
  assert.ok(tool);
  assert.equal(tool.params.length, 2);
  assert.ok(tool.params[1].options.includes("javascript"));
});

test("generate_document tool: should have optional outline param", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "generate_document");
  assert.ok(tool);
  const outlineParam = tool.params.find(p => p.name === "文档大纲");
  assert.ok(outlineParam);
  assert.equal(outlineParam.required, false);
});
