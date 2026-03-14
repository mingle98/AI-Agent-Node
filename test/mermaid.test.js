import assert from "node:assert/strict";
import test from "node:test";

import { renderMermaid, MERMAID_DIAGRAM_TYPES } from "../tools/mermaid.js";

test("MERMAID_DIAGRAM_TYPES: should include all diagram types", () => {
  assert.ok(MERMAID_DIAGRAM_TYPES.includes("flowchart"));
  assert.ok(MERMAID_DIAGRAM_TYPES.includes("sequence"));
  assert.ok(MERMAID_DIAGRAM_TYPES.includes("gantt"));
  assert.ok(MERMAID_DIAGRAM_TYPES.includes("class"));
});

test("renderMermaid: should render with type and body", () => {
  const result = renderMermaid("sequence", "A-->B");
  assert.ok(result.includes("sequenceDiagram"));
  assert.ok(result.includes("A-->B"));
  assert.ok(result.includes("```mermaid"));
});

test("renderMermaid: should render flowchart", () => {
  const result = renderMermaid("flowchart", "A-->B");
  assert.ok(result.includes("graph TD"));
});

test("renderMermaid: should render gantt", () => {
  const result = renderMermaid("gantt", "title test");
  assert.ok(result.includes("gantt"));
});

test("renderMermaid: should render pie", () => {
  const result = renderMermaid("pie", '"A": 10"');
  assert.ok(result.includes("pie"));
});

test("renderMermaid: should return error for unsupported type", () => {
  const result = renderMermaid("unsupported", "body");
  assert.ok(result.includes("不支持"));
});

test("renderMermaid: should handle raw source code", () => {
  const raw = "graph TD\nA-->B";
  const result = renderMermaid(raw);
  assert.ok(result.includes("graph TD"));
});

test("renderMermaid: should return error for empty source", () => {
  const result = renderMermaid("");
  assert.equal(result, "Mermaid源码不能为空");
});

test("renderMermaid: should normalize markdown code block markers", () => {
  const withMarkers = "```mermaid\ngraph TD\n```";
  const result = renderMermaid(withMarkers);
  assert.ok(result.includes("graph TD"));
  assert.ok(!result.includes("```mermaid\n```mermaid"));
});
