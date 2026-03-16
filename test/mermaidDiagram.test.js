import assert from "node:assert/strict";
import test from "node:test";

import { skillMermaidDiagram } from "../skills/mermaidDiagram.js";

test("skillMermaidDiagram: should generate mermaid skill guide for auto type", async () => {
  const result = await skillMermaidDiagram("画一个流程图", "auto");
  assert.ok(result.includes("Mermaid图生成技能流程"));
  assert.ok(result.includes("auto"));
});

test("skillMermaidDiagram: should support all diagram types", async () => {
  const types = ["flowchart", "sequence", "gantt", "pie", "class", "state", "er", "journey", "mindmap", "timeline", "gitgraph"];
  for (const type of types) {
    const result = await skillMermaidDiagram("需求描述", type);
    assert.ok(result.includes(type), `Should support ${type}`);
  }
});

test("skillMermaidDiagram: should return error for unsupported type", async () => {
  const result = await skillMermaidDiagram("需求", "unsupported");
  assert.ok(result.includes("不支持"));
});

test("skillMermaidDiagram: should not include embedded mermaid examples", async () => {
  const result = await skillMermaidDiagram("需求", "auto");
  assert.ok(result.includes("Mermaid图生成技能流程"));
  assert.ok(result.includes("三段式流程"));
  assert.ok(result.includes("render_mermaid"));
  assert.ok(!result.includes("```mermaid"), "Should not embed mermaid code blocks in the skill guide");
  assert.ok(result.includes("graph TD"), "Should include flowchart syntax example");
  assert.ok(result.includes("sequenceDiagram"), "Should include sequence syntax example");
  assert.ok(result.includes("gantt"), "Should include gantt syntax example");
  assert.ok(result.includes("pie"), "Should include pie syntax example");
  assert.ok(result.includes("classDiagram"), "Should include class syntax example");
});
