import assert from "node:assert/strict";
import test from "node:test";

import { SKILL_DEFINITIONS, SKILLS } from "../skills/index.js";

test("SKILL_DEFINITIONS: should export all skill definitions", () => {
  assert.ok(Array.isArray(SKILL_DEFINITIONS));
  assert.ok(SKILL_DEFINITIONS.length >= 5);
});

test("SKILL_DEFINITIONS: each skill should have required fields", () => {
  for (const skill of SKILL_DEFINITIONS) {
    assert.ok(skill.name, "Skill should have name");
    assert.ok(skill.description, "Skill should have description");
    assert.ok(skill.functionality, "Skill should have functionality");
    assert.ok(Array.isArray(skill.params), "Skill should have params array");
    assert.ok(skill.example, "Skill should have example");
    assert.equal(typeof skill.func, "function", "Skill should have func");
  }
});

test("SKILLS: should map skill names to functions", () => {
  assert.equal(typeof SKILLS.ai_agent_teaching, "function");
  assert.equal(typeof SKILLS.component_consulting, "function");
  assert.equal(typeof SKILLS.code_explanation, "function");
  assert.equal(typeof SKILLS.ai_agent_echart, "function");
  assert.equal(typeof SKILLS.mermaid_diagram, "function");
  assert.equal(typeof SKILLS.debug_assistant, "function");
  assert.equal(typeof SKILLS.code_review, "function");
  assert.equal(typeof SKILLS.excel_helper, "function");
  assert.equal(typeof SKILLS.decision_helper, "function");
  assert.equal(typeof SKILLS.email_writer, "function");
  assert.equal(typeof SKILLS.email_sender, "function");  // 新增
  assert.equal(typeof SKILLS.python_executor, "function");
});

test("email_sender skill: should be defined with correct params", () => {
  const skill = SKILL_DEFINITIONS.find(s => s.name === "email_sender");
  assert.ok(skill, "email_sender skill should exist");
  assert.ok(skill.params.find(p => p.name === "收件人"));
  assert.ok(skill.params.find(p => p.name === "主题"));
  assert.ok(skill.params.find(p => p.name === "内容"));
  assert.ok(skill.params.find(p => p.name === "场景类型"));
  const typeParam = skill.params.find(p => p.name === "场景类型");
  assert.ok(typeParam.options.includes("notification"));
  assert.ok(typeParam.options.includes("alert"));
  assert.ok(typeParam.options.includes("thanks"));
});

test("ai_agent_teaching skill: should have difficulty options", () => {
  const skill = SKILL_DEFINITIONS.find(s => s.name === "ai_agent_teaching");
  assert.ok(skill);
  const levelParam = skill.params.find(p => p.name === "难度级别");
  assert.ok(levelParam);
  assert.ok(levelParam.options.includes("beginner"));
  assert.ok(levelParam.options.includes("advanced"));
});

test("component_consulting skill: should have component options", () => {
  const skill = SKILL_DEFINITIONS.find(s => s.name === "component_consulting");
  assert.ok(skill);
  const compParam = skill.params.find(p => p.name === "组件名称");
  assert.ok(compParam);
  assert.ok(compParam.options.includes("SuspendedBallChat"));
});

test("code_explanation skill: should have detail level options", () => {
  const skill = SKILL_DEFINITIONS.find(s => s.name === "code_explanation");
  assert.ok(skill);
  const detailParam = skill.params.find(p => p.name === "详细程度");
  assert.ok(detailParam);
  assert.ok(detailParam.options.includes("brief"));
  assert.ok(detailParam.options.includes("detailed"));
});
