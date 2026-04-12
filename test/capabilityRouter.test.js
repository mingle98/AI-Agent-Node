import assert from "node:assert/strict";
import test from "node:test";

import { expandCapabilitiesToAll, selectActiveCapabilities } from "../agent/capabilityRouter.js";

function tool(name, description = "") {
  return { name, description, params: [], example: `${name}()` };
}

function skill(name, description = "") {
  return { name, description, functionality: "", params: [], example: `${name}()` };
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

test("expandCapabilitiesToAll: should include all tool and skill names", () => {
  const toolDefinitions = [tool("t1"), tool("t2")];
  const skillDefinitions = [skill("s1")];

  const result = expandCapabilitiesToAll(toolDefinitions, skillDefinitions);
  assert.deepEqual(result.toolNames, ["t1", "t2"]);
  assert.deepEqual(result.skillNames, ["s1"]);
  assert.deepEqual(result.capabilityNames, ["t1", "t2", "s1"]);
});
