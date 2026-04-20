import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../agent/promptBuilder.js";

test("buildSystemPrompt: should include tools, skills and rules", () => {
  const toolDefs = [
    {
      name: "t1",
      description: "d1",
      params: [{ name: "p1", type: "string", example: "x" }],
      example: 't1("x")',
    },
  ];
  const skillDefs = [
    {
      name: "s1",
      description: "sd1",
      functionality: "f1",
      params: [{ name: "k1", type: "string", example: "y", options: ["a", "b"] }],
      example: 's1("y")',
    },
  ];

  const prompt = buildSystemPrompt(toolDefs, skillDefs, { roleName: "R", roleDescription: "D" });
  assert.match(prompt, /你是一个R，D/);
  assert.match(prompt, /使用规则/);
  assert.match(prompt, /智能决策示例/);
  assert.match(prompt, /定时任务调度|schedule_task/);
  assert.match(prompt, /支持用户隔离|只执行一次/);
});

test("buildSystemPrompt: should document file name and content search tools", () => {
  const prompt = buildSystemPrompt([], [], {});
  assert.match(prompt, /按文件名搜索: file_search/);
  assert.match(prompt, /按行读取文件片段: file_read_lines/);
  assert.match(prompt, /按行编辑文件片段: file_edit_lines/);
  assert.match(prompt, /按文本替换文件内容: file_replace_text/);
  assert.match(prompt, /maxReplacements=0 表示全部替换/);
  assert.match(prompt, /若读取被截断则禁止编辑/);
  assert.match(prompt, /单次最多 200 行/);
  assert.match(prompt, /按文件内容搜索: file_content_search/);
  assert.match(prompt, /默认最多返回 3 条/);
  assert.match(prompt, /最多扫描 30 个文本文件/);
  assert.match(prompt, /搜索 TODO \/ 某段文本/);
});

test("buildSystemPrompt: compact mode should enforce KB-first for risky domains", () => {
  const prompt = buildSystemPrompt([], [], {
    roleName: "R",
    roleDescription: "D",
    compact: true,
  });

  assert.match(prompt, /必须先用 search_knowledge 检索相关 SOP\/guardrails\/support matrix/);
  assert.match(prompt, /search_knowledge 在单轮中通常调用 1 次就够了/);
  assert.match(prompt, /不要围绕同一问题反复检索/);
  assert.match(prompt, /组件类问题（如 SuspendedBallChat \/ ChatPanel 配置、接入、流式、回调、样式）应优先先用 search_knowledge 检索组件文档/);
  assert.match(prompt, /禁止在没有文档上下文时直接调用 component_consulting/);
  assert.match(prompt, /component_consulting、ai_agent_teaching、generate_document、ai_agent_echart、analyze_chart/);
  assert.match(prompt, /如果知识库提示需要澄清，就先追问，不要直接执行/);
});

test("buildSystemPrompt: should include explicit component knowledge-to-consulting example", () => {
  const prompt = buildSystemPrompt([], [{
    name: "component_consulting",
    description: "d",
    functionality: "f",
    params: [],
    example: "e",
  }], {});
  assert.match(prompt, /search_knowledge\("SuspendedBallChat 流式响应 配置"\)/);
  assert.match(prompt, /component_consulting\("如何配置流式响应", "SuspendedBallChat", "…检索结果…"\)/);
});

test("buildSystemPrompt: compact mode should trim examples and detail fields", () => {
  const toolDefs = [
    {
      name: "t1",
      description: "d1",
      params: [{ name: "p1", type: "string", example: "x" }],
      example: "TOOL_EXAMPLE_TOKEN",
    },
  ];
  const skillDefs = [
    {
      name: "s1",
      description: "sd1",
      functionality: "SKILL_FUNCTIONALITY_TOKEN",
      params: [{ name: "k1", type: "string", example: "y", options: ["a", "b"] }],
      example: "SKILL_EXAMPLE_TOKEN",
    },
  ];

  const prompt = buildSystemPrompt(toolDefs, skillDefs, {
    roleName: "R",
    roleDescription: "D",
    compact: true,
  });

  assert.doesNotMatch(prompt, /TOOL_EXAMPLE_TOKEN/);
  assert.doesNotMatch(prompt, /SKILL_FUNCTIONALITY_TOKEN/);
  assert.doesNotMatch(prompt, /SKILL_EXAMPLE_TOKEN/);
  assert.match(prompt, /优先选择最匹配用户意图/);
  assert.doesNotMatch(prompt, /批量压缩这些图片/);
});

test("buildSystemPrompt: capability routing should align examples with active capabilities", () => {
  const prompt = buildSystemPrompt([
    {
      name: "search_knowledge",
      description: "知识查询",
      params: [],
      example: 'search_knowledge("AI Agent")',
    },
    {
      name: "search_tools",
      description: "能力搜索",
      params: [],
      example: 'search_tools("画流程图")',
    },
  ], [
    {
      name: "component_consulting",
      description: "组件咨询",
      functionality: "组件配置与集成说明",
      params: [],
      example: 'component_consulting("如何配置流式响应")',
    },
  ], {
    compact: true,
    capabilityRoutingEnabled: true,
  });

  assert.match(prompt, /优先调用 search_tools 搜索并激活匹配能力/);
  assert.match(prompt, /AI Agent是什么？/);
  assert.match(prompt, /如何配置流式响应/);
  assert.doesNotMatch(prompt, /执行这段js代码看看结果/);
  assert.doesNotMatch(prompt, /批量压缩这些图片/);
});

test("buildSystemPrompt: capability routing should keep search_tools fallback examples when no mapped capability examples exist", () => {
  const prompt = buildSystemPrompt([
    {
      name: "search_tools",
      description: "能力搜索",
      params: [],
      example: 'search_tools("未知任务")',
    },
  ], [], {
    compact: true,
    capabilityRoutingEnabled: true,
  });

  assert.match(prompt, /需要更多可用能力时/);
  assert.match(prompt, /当前能力不足时/);
  assert.match(prompt, /search_tools/);
});
