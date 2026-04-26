import assert from "node:assert/strict";
import test from "node:test";

import { expandCapabilitiesToAll, searchCapabilities, selectActiveCapabilities } from "../agent/capabilityRouter.js";

function tool(name, description = "", extra = {}) {
  return { name, description, params: [], example: `${name}()`, ...extra };
}

function skill(name, description = "", extra = {}) {
  return { name, description, functionality: "", params: [], example: `${name}()`, ...extra };
}

test("selectActiveCapabilities: should pick domain-matched capabilities and keep always-on", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("render_mermaid", "Mermaid 渲染"),
    tool("excel_read", "读取 Excel"),
  ];
  const skillDefinitions = [skill("mermaid_diagram", "生成流程图"), skill("excel_helper", "Excel 辅助")];

  const result = selectActiveCapabilities({
    userInput: "帮我画一个流程图描述登录流程",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: ["search_knowledge"],
    alwaysOnSkills: [],
    maxTools: 10,
    maxSkills: 10,
  });

  assert.ok(result.toolNames.includes("search_knowledge"));
  assert.ok(result.toolNames.includes("render_mermaid"));
  assert.ok(result.skillNames.includes("mermaid_diagram"));
  assert.ok(!result.toolNames.includes("analyze_chart"), "unknown tool should be filtered out");
});

test("selectActiveCapabilities: should include daily_news for hot news queries", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("analyze_code", "代码分析"),
    tool("exec_code", "脚本执行"),
    tool("daily_news", "查询今日热点新闻列表"),
  ];

  const result = selectActiveCapabilities({
    userInput: "今日热点有什么?",
    toolDefinitions,
    skillDefinitions: [],
    alwaysOnTools: ["search_knowledge", "analyze_code", "exec_code"],
    alwaysOnSkills: [],
  });

  assert.ok(result.toolNames.includes("daily_news"));
});

test("selectActiveCapabilities: should match broader mermaid terms like swimlane", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("render_mermaid", "Mermaid 渲染"),
    tool("analyze_chart", "图表分析"),
  ];
  const skillDefinitions = [skill("mermaid_diagram", "生成流程图")];

  const result = selectActiveCapabilities({
    userInput: "帮我画一个泳道图梳理审批流程",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: ["search_knowledge"],
    alwaysOnSkills: [],
  });

  assert.ok(result.toolNames.includes("render_mermaid"));
  assert.ok(result.skillNames.includes("mermaid_diagram"));
});

test("selectActiveCapabilities: should match broader debug terms like traceback", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("analyze_code", "代码分析"),
  ];
  const skillDefinitions = [skill("debug_assistant", "故障排查")];

  const result = selectActiveCapabilities({
    userInput: "程序崩溃了，帮我看下 traceback 和 stack trace",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: ["search_knowledge"],
    alwaysOnSkills: [],
  });

  assert.ok(result.toolNames.includes("analyze_code"));
  assert.ok(result.skillNames.includes("debug_assistant"));
});

test("selectActiveCapabilities: should match broader excel terms like pivot table", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("excel_read", "读取 Excel"),
    tool("excel_write", "写入 Excel"),
    tool("excel_append", "追加 Excel"),
  ];
  const skillDefinitions = [skill("excel_helper", "Excel 辅助")];

  const result = selectActiveCapabilities({
    userInput: "帮我做透视表并写个 vlookup 公式",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: ["search_knowledge"],
    alwaysOnSkills: [],
  });

  assert.ok(result.toolNames.includes("excel_read"));
  assert.ok(result.skillNames.includes("excel_helper"));
});

test("selectActiveCapabilities: should activate file content search for content-search queries", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("file_content_search", "按文件内容搜索关键词或目标文本"),
    tool("file_search", "按文件名搜索"),
  ];

  const result = selectActiveCapabilities({
    userInput: "帮我在项目文件内容里搜索 TODO 和某段文本",
    toolDefinitions,
    skillDefinitions: [],
    alwaysOnTools: ["search_knowledge"],
    alwaysOnSkills: [],
  });

  assert.ok(result.toolNames.includes("file_content_search"));
});

test("selectActiveCapabilities: should route component consultation queries to knowledge and component consulting", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("analyze_code", "代码分析"),
  ];
  const skillDefinitions = [
    skill("component_consulting", "组件咨询"),
    skill("code_explanation", "代码解释"),
  ];

  const result = selectActiveCapabilities({
    userInput: "组件怎么欢迎界面配置？",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: ["search_knowledge"],
    alwaysOnSkills: [],
  });

  assert.ok(result.toolNames.includes("search_knowledge"));
  assert.ok(result.skillNames.includes("component_consulting"));
});

test("selectActiveCapabilities: should respect max limits", () => {
  const toolDefinitions = [tool("t1", "测试"), tool("t2", "测试"), tool("t3", "测试")];
  const skillDefinitions = [skill("s1", "测试"), skill("s2", "测试")];

  const result = selectActiveCapabilities({
    userInput: "测试",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: ["t1"],
    alwaysOnSkills: ["s1"],
    maxTools: 2,
    maxSkills: 1,
  });

  assert.equal(result.toolNames.length, 2);
  assert.equal(result.skillNames.length, 1);
});

test("selectActiveCapabilities: should fallback to minimal tools when no match", () => {
  const toolDefinitions = [tool("a"), tool("b"), tool("c")];
  const skillDefinitions = [skill("s1")];

  const result = selectActiveCapabilities({
    userInput: "x",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: [],
    alwaysOnSkills: [],
  });

  assert.deepEqual(result.toolNames, ["a", "b", "c"]);
  assert.deepEqual(result.skillNames, []);
});

test("selectActiveCapabilities: should fallback to minimal tools when no match", () => {
  const toolDefinitions = [tool("a"), tool("b"), tool("c")];
  const skillDefinitions = [skill("s1")];

  const result = selectActiveCapabilities({
    userInput: "x",
    toolDefinitions,
    skillDefinitions,
    alwaysOnTools: [],
    alwaysOnSkills: [],
  });

  assert.deepEqual(result.toolNames, ["a", "b", "c"]);
  assert.deepEqual(result.skillNames, []);
});

test("selectActiveCapabilities: should include always-on search_tools when routing enabled", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("analyze_code", "代码分析"),
    tool("exec_code", "脚本执行"),
    tool("search_tools", "搜索工具和技能"),
  ];

  const result = selectActiveCapabilities({
    userInput: "你好",
    toolDefinitions,
    skillDefinitions: [],
    alwaysOnTools: ["search_knowledge", "analyze_code", "exec_code", "search_tools"],
    alwaysOnSkills: [],
  });

  assert.ok(result.toolNames.includes("search_tools"));
});

test("searchCapabilities: should find compact matching capabilities", () => {
  const toolDefinitions = [
    tool("excel_read", "读取 Excel 文件"),
    tool("email_send", "发送邮件"),
  ];
  const skillDefinitions = [
    skill("email_sender", "邮件发送助手"),
    skill("excel_helper", "Excel 助手"),
  ];

  const result = searchCapabilities({
    query: "处理 Excel 并发送邮件报告",
    toolDefinitions,
    skillDefinitions,
    limit: 3,
    kind: "all",
  });

  assert.ok(result.toolNames.includes("excel_read") || result.toolNames.includes("email_send"));
  assert.ok(result.skillNames.includes("email_sender") || result.skillNames.includes("excel_helper"));
  assert.ok(result.matches.some((item) => item.name === "excel_read" || item.name === "email_send" || item.name === "email_sender"));
  assert.ok(result.matches.every((item) => !Object.hasOwn(item, "functionality")));
  assert.ok(result.matches.every((item) => !Object.hasOwn(item, "example")));
  assert.ok(result.matches.length <= 3);
});

test("selectActiveCapabilities: should match MCP tools by explicit keywords", () => {
  const toolDefinitions = [
    tool("search_knowledge", "知识查询"),
    tool("mcp__weather__forecast", "[MCP:weather] 外部服务", {
      source: "mcp",
      keywords: ["天气", "天气预报", "AQI", "空气质量", "天气预警"],
    }),
  ];

  const result = selectActiveCapabilities({
    userInput: "帮我查一下北京明天的天气",
    toolDefinitions,
    skillDefinitions: [],
    alwaysOnTools: ["search_knowledge"],
    alwaysOnSkills: [],
    maxTools: 10,
  });

  assert.ok(result.toolNames.includes("mcp__weather__forecast"));
});

test("searchCapabilities: should find MCP tools by explicit keywords", () => {
  const toolDefinitions = [
    tool("mcp__weather__forecast", "[MCP:weather] 外部服务", {
      source: "mcp",
      keywords: ["天气", "天气预报", "AQI", "空气质量", "天气预警"],
    }),
  ];

  const result = searchCapabilities({
    query: "空气质量怎么样",
    toolDefinitions,
    skillDefinitions: [],
    limit: 4,
    kind: "tool",
  });

  assert.ok(result.toolNames.includes("mcp__weather__forecast"));
  assert.ok(result.matches.some((item) => item.name === "mcp__weather__forecast"));
  assert.ok(result.matches.every((item) => !Object.hasOwn(item, "source")));
});

test("expandCapabilitiesToAll: should include all tool and skill names", () => {
  const toolDefinitions = [tool("t1"), tool("t2")];
  const skillDefinitions = [skill("s1")];

  const result = expandCapabilitiesToAll(toolDefinitions, skillDefinitions);
  assert.deepEqual(result.toolNames, ["t1", "t2"]);
  assert.deepEqual(result.skillNames, ["s1"]);
  assert.deepEqual(result.capabilityNames, ["t1", "t2", "s1"]);
});
