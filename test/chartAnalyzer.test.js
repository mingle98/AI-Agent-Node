import assert from "node:assert/strict";
import test from "node:test";

import { analyzeChart } from "../tools/chartAnalyzer.js";

test("analyzeChart: should return error when chartType is empty", () => {
  const result = analyzeChart("", "some source", "goal");
  assert.ok(result.includes("chartType 不能为空"));
});

test("analyzeChart: should return error when source is empty", () => {
  const result = analyzeChart("mermaid", "", "goal");
  assert.ok(result.includes("source 不能为空"));
});

test("analyzeChart: should return error for unsupported chart type", () => {
  const result = analyzeChart("unsupported", "source", "goal");
  assert.ok(result.includes("暂不支持的图表类型"));
});

test("analyzeChart: should analyze mermaid flowchart", () => {
  const mermaid = `graph TD
    A[Start] --> B[Process]
    B --> C[End]`;
  const result = analyzeChart("mermaid", mermaid, "分析流程");
  assert.ok(result.includes("flowchart"));
  assert.ok(result.includes("Mermaid"));
});

test("analyzeChart: should analyze mermaid sequence diagram", () => {
  const mermaid = `sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello
    B->>A: Hi`;
  const result = analyzeChart("mermaid", mermaid, "");
  assert.ok(result.includes("sequence"));
  assert.ok(result.includes("参与者"));
});

test("analyzeChart: should analyze mermaid class diagram", () => {
  const mermaid = `classDiagram
    class User {
      +String name
      +login()
    }
    User --> Account`;
  const result = analyzeChart("mermaid", mermaid, "分析类图");
  assert.ok(result.includes("class"));
});

test("analyzeChart: should handle mermaid with code block markers", () => {
  const mermaid = "```mermaid\ngraph TD\nA --> B\n```";
  const result = analyzeChart("mermaid", mermaid, "");
  assert.ok(result.includes("flowchart"));
});

test("analyzeChart: should detect issues in large mermaid chart", () => {
  const lines = Array(250).fill("A --> B");
  const mermaid = `graph TD\n${lines.join("\n")}`;
  const result = analyzeChart("mermaid", mermaid, "");
  assert.ok(result.includes("行数较多"));
});

test("analyzeChart: should detect missing arrows in flowchart", () => {
  const mermaid = `graph TD
    A[Start]
    B[End]`;
  const result = analyzeChart("mermaid", mermaid, "");
  assert.ok(result.includes("未检测到连线箭头"));
});

test("analyzeChart: should analyze echarts option", () => {
  const echarts = JSON.stringify({
    title: { text: "Sales Chart" },
    xAxis: { type: "category", name: "Month" },
    yAxis: { type: "value", name: "Revenue" },
    series: [{ type: "bar", data: [120, 200, 150] }],
  });
  const result = analyzeChart("echarts", echarts, "");
  assert.ok(result.includes("ECharts"));
  assert.ok(result.includes("bar"));
  assert.ok(result.includes("Sales Chart"));
});

test("analyzeChart: should analyze echarts pie chart without axis", () => {
  const echarts = JSON.stringify({
    title: { text: "Pie Chart" },
    series: [{ type: "pie", data: [{ name: "A", value: 10 }] }],
  });
  const result = analyzeChart("echarts", echarts, "");
  assert.ok(result.includes("pie"));
  assert.ok(!result.includes("series 数量：0"));
});

test("analyzeChart: should detect missing series in echarts", () => {
  const echarts = JSON.stringify({
    title: { text: "Empty Chart" },
    xAxis: { type: "category" },
    yAxis: { type: "value" },
  });
  const result = analyzeChart("echarts", echarts, "");
  assert.ok(result.includes("未发现 series"));
});

test("analyzeChart: should detect missing axis in non-pie chart", () => {
  const echarts = JSON.stringify({
    title: { text: "No Axis" },
    series: [{ type: "bar", data: [] }],
  });
  const result = analyzeChart("echarts", echarts, "");
  assert.ok(result.includes("缺少 xAxis/yAxis"));
});

test("analyzeChart: should handle invalid echarts JSON", () => {
  const result = analyzeChart("echarts", "invalid json", "");
  assert.ok(result.includes("无法解析"));
});

test("analyzeChart: should handle echarts with array title and series", () => {
  const echarts = JSON.stringify({
    title: [{ text: "Multi Title" }],
    series: [
      { type: "line", data: [1, 2, 3] },
      { type: "bar", data: [4, 5, 6] },
    ],
  });
  const result = analyzeChart("echarts", echarts, "");
  assert.ok(result.includes("line"));
  assert.ok(result.includes("bar"));
});

test("analyzeChart: should handle echart alias", () => {
  const echarts = JSON.stringify({
    title: { text: "Test" },
    series: [{ type: "line" }],
  });
  const result = analyzeChart("echart", echarts, "");
  assert.ok(result.includes("ECharts"));
});

test("analyzeChart: should handle mermaid gantt diagram", () => {
  const mermaid = `gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1
    Task 1 :2024-01-01, 10d`;
  const result = analyzeChart("mermaid", mermaid, "");
  assert.ok(result.includes("gantt") || result.includes("暂未对该图类型"));
});

test("analyzeChart: should handle mermaid pie diagram", () => {
  const mermaid = `pie
    title Distribution
    "A" : 100
    "B" : 200`;
  const result = analyzeChart("mermaid", mermaid, "");
  assert.ok(result.includes("pie") || result.includes("暂未对该图类型"));
});

test("analyzeChart: should handle mermaid unknown diagram kind", () => {
  const mermaid = `unknown
    A --> B`;
  const result = analyzeChart("mermaid", mermaid, "");
  assert.ok(result.includes("未能从首行识别") || result.includes("unknown"));
});

test("analyzeChart: should handle source as object", () => {
  const source = { data: [1, 2, 3] };
  const result = analyzeChart("echarts", source, "");
  assert.ok(result.includes("ECharts") || result.includes("无法解析"));
});
