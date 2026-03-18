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
  assert.equal(typeof TOOLS.daily_news, "function");
  assert.equal(typeof TOOLS.exec_code, "function");
  assert.equal(typeof TOOLS.script_generator, "function");
});

test("exec_code tool: should have language options", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "exec_code");
  assert.ok(tool);
  assert.equal(tool.params.length, 2);
  const langParam = tool.params.find(p => p.name === "编程语言");
  assert.ok(langParam);
  assert.ok(langParam.options.includes("javascript"));
  assert.ok(langParam.options.includes("python"));
});

test("script_generator tool: should have output format options", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "script_generator");
  assert.ok(tool);
  assert.equal(tool.params.length, 3);
  const formatParam = tool.params.find(p => p.name === "输出格式");
  assert.ok(formatParam);
  assert.ok(formatParam.options.includes("auto"));
  assert.ok(formatParam.options.includes("json"));
  assert.ok(formatParam.options.includes("summary"));
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

test("daily_news tool: should be defined", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "daily_news");
  assert.ok(tool);
  assert.equal(tool.params.length, 2);
});
