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

test("TOOLS: should include file content search function", () => {
  assert.equal(typeof TOOLS.file_content_search, "function");
});

test("TOOLS: should include file_read_lines function", () => {
  assert.equal(typeof TOOLS.file_read_lines, "function");
});

test("file_read_lines tool: should be defined with correct params", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "file_read_lines");
  assert.ok(tool);
  assert.equal(tool.params.length, 4);
  assert.ok(tool.params.find(p => p.name === "文件路径"));
  assert.ok(tool.params.find(p => p.name === "起始行号"));
  assert.ok(tool.params.find(p => p.name === "结束行号"));
  assert.ok(tool.params.find(p => p.name === "最大读取字节数"));
  assert.match(tool.description, /最多 200 行/);
});

test("file_content_search tool: should be defined with correct params", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "file_content_search");
  assert.ok(tool);
  assert.equal(tool.params.length, 4);
  assert.ok(tool.params.find(p => p.name === "内容关键词或目标文本"));
  assert.ok(tool.params.find(p => p.name === "搜索目录"));
  assert.ok(tool.params.find(p => p.name === "最大返回结果数"));
  assert.ok(tool.params.find(p => p.name === "单文件最大读取字节数"));
  assert.match(tool.description, /30 个文本文件/);
  assert.match(tool.description, /256KB/);
  assert.match(tool.description, /2MB/);
});

test("toolNeedsSessionId: should include file_content_search", async () => {
  const { toolNeedsSessionId } = await import("../tools/toolConstants.js");
  assert.equal(toolNeedsSessionId("file_content_search"), true);
});

test("toolNeedsSessionId: should include file_read_lines", async () => {
  const { toolNeedsSessionId } = await import("../tools/toolConstants.js");
  assert.equal(toolNeedsSessionId("file_read_lines"), true);
});

test("email_send tool: should be defined with correct params", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "email_send");
  assert.ok(tool, "email_send tool should exist");
  assert.equal(tool.params.length, 4);
  assert.ok(tool.params.find(p => p.name === "收件人"));
  assert.ok(tool.params.find(p => p.name === "主题"));
  assert.ok(tool.params.find(p => p.name === "内容"));
  assert.ok(tool.params.find(p => p.name === "选项"));
});

test("email_template tool: should be defined with correct options", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "email_template");
  assert.ok(tool, "email_template tool should exist");
  assert.equal(tool.params.length, 4);
  const templateParam = tool.params.find(p => p.name === "模板");
  assert.ok(templateParam);
  assert.ok(templateParam.options.includes("notification"));
  assert.ok(templateParam.options.includes("alert"));
  assert.ok(templateParam.options.includes("report"));
});

test("email_verify tool: should be defined", () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === "email_verify");
  assert.ok(tool, "email_verify tool should exist");
  assert.equal(tool.params.length, 0);
});

test("TOOLS: should include email functions", () => {
  assert.equal(typeof TOOLS.email_send, "function");
  assert.equal(typeof TOOLS.email_template, "function");
  assert.equal(typeof TOOLS.email_verify, "function");
});
