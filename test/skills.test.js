import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { SKILL_DEFINITIONS, SKILLS } from "../skills/index.js";
import { generateManifestSuggestions, loadCommunitySkillDefinitions, writeManifestSuggestionForSkill, detectPythonCommand, installPythonDependencies, detectNodeCommand, getRuntimeHandler } from "../skills/communitySkills.js";

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

test("component_consulting skill: should require knowledge context param", () => {
  const skill = SKILL_DEFINITIONS.find(s => s.name === "component_consulting");
  assert.ok(skill);
  assert.equal(skill.params.length, 3);
  assert.ok(skill.params.find(p => p.name === "组件文档上下文"));
});

test("community skills: should auto-load markdown skills from skillMds", async () => {
  const loaded = loadCommunitySkillDefinitions();
  const skill = loaded.find((s) => s.name === "wechat-article-writer");

  assert.ok(skill, "wechat-article-writer should be loaded from skillMds");
  assert.equal(typeof skill.func, "function");
  assert.ok(skill.description.includes("微信公众号发布") || skill.description.includes("公众号"));

  const registered = SKILL_DEFINITIONS.find((s) => s.name === "wechat-article-writer");
  assert.ok(registered, "wechat-article-writer should be registered in SKILL_DEFINITIONS");
  assert.equal(typeof SKILLS["wechat-article-writer"], "function");

  const result = await SKILLS["wechat-article-writer"]("帮我写一篇公众号文章", "面向产品经理");
  assert.match(result, /wechat-article-writer/);
  assert.match(result, /面向产品经理/);
  assert.match(result, /公众号|标题|正文结构/);
});

test("community bundle skill: should load runtime and entry from manifest", () => {
  const loaded = loadCommunitySkillDefinitions();
  const skill = loaded.find((s) => s.name === "qr-code-generator");

  assert.ok(skill, "qr-code-generator should be loaded");
  assert.equal(skill.bundle?.manifest?.runtime, "node");
  assert.equal(skill.bundle?.manifest?.entry, "scripts/qr_generator.mjs");
  assert.ok(skill.bundle?.suggestedCommands.some((cmd) => cmd.includes("qr_generator.mjs")));
});

test("community manifest suggestions: should generate suggestions for bundle skills", () => {
  const suggestions = generateManifestSuggestions();
  const bundleSuggestion = suggestions.find((item) => item.skillName === "qr-code-generator");

  assert.ok(bundleSuggestion, "qr-code-generator should have manifest suggestion");
  assert.ok(Array.isArray(bundleSuggestion.suggestion.keywords));
  assert.ok(bundleSuggestion.suggestion.keywords.length > 0);
});

test("community manifest auto-write: should create manifest when missing", () => {
  const skillRoot = "/Users/zhoumingle/Desktop/myProjects/AI-Agent-Node/skillMds/qr-code-generator";
  const manifestPath = path.join(skillRoot, "manifest.json");
  const backupPath = `${manifestPath}.bak-test`;
  if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  fs.copyFileSync(manifestPath, backupPath);
  fs.unlinkSync(manifestPath);

  try {
    const definitions = loadCommunitySkillDefinitions();
    const skill = definitions.find((item) => item.name === "qr-code-generator");
    assert.ok(skill, "qr-code-generator should still load");
    assert.ok(fs.existsSync(manifestPath), "manifest should be regenerated on load");

    const written = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(written.runtime, "node");
    assert.equal(written.entry, "scripts/qr_generator.mjs");
  } finally {
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    fs.renameSync(backupPath, manifestPath);
  }
});

test("community manifest suggestions: should include qr bundle keywords", () => {
  const suggestions = generateManifestSuggestions();
  const qr = suggestions.find((item) => item.skillName === "qr-code-generator");

  assert.ok(qr, "qr-code-generator should have manifest suggestion");
  assert.ok(Array.isArray(qr.suggestion.keywords));
  assert.ok(qr.suggestion.keywords.length > 0);
  assert.ok(qr.suggestion.keywords.some((item) => /二维码|qr|png|svg/i.test(item)));
});

test("community manifest suggestions: should protect existing manifest unless overwrite", () => {
  const result = writeManifestSuggestionForSkill("qr-code-generator");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "manifest-exists");
  assert.ok(result.manifestPath.includes("manifest.json"));
});

test("community python runtime: should detect usable python command", () => {
  const runtime = detectPythonCommand();
  assert.ok(runtime.command === "python3" || runtime.command === "python" || runtime.command === "");
});

test("community python deps: install command should use selected interpreter", () => {
  const result = installPythonDependencies(["definitely-not-a-real-package-for-test-12345"], "python3");
  assert.equal(result.attempted, true);
  assert.deepEqual(result.packages, ["definitely-not-a-real-package-for-test-12345"]);
  assert.ok(result.commandResult.command === "python3" || result.commandResult.command === "python");
  assert.ok(Array.isArray(result.commandResult.args));
  assert.equal(result.commandResult.args[0], "-m");
  assert.equal(result.commandResult.args[1], "pip");
  assert.equal(result.commandResult.args[2], "install");
});

test("community runtime handlers: should expose node and python handlers", () => {
  const pythonHandler = getRuntimeHandler("python");
  const nodeHandler = getRuntimeHandler("node");
  const shellHandler = getRuntimeHandler("shell");

  assert.ok(pythonHandler);
  assert.ok(nodeHandler);
  assert.ok(shellHandler);
  assert.equal(typeof pythonHandler.detect, "function");
  assert.equal(typeof nodeHandler.checkDependencies, "function");
});

test("community node runtime: should detect usable node command", () => {
  const runtime = detectNodeCommand();
  assert.ok(runtime.command === "node" || runtime.command === "");
});

test("community manifest suggestions: should include runtimeOptions and install config", () => {
  const suggestions = generateManifestSuggestions();
  const bundleSuggestion = suggestions.find((item) => item.skillName === "qr-code-generator");

  assert.ok(bundleSuggestion);
  assert.ok(bundleSuggestion.suggestion.runtimeOptions && typeof bundleSuggestion.suggestion.runtimeOptions === "object");
  assert.ok(bundleSuggestion.suggestion.install && typeof bundleSuggestion.suggestion.install === "object");
});

test("community python runtime handler: should support venv-aware detect", () => {
  const handler = getRuntimeHandler("python");
  const runtimeInfo = handler.detect("/Users/zhoumingle/Desktop/myProjects/AI-Agent-Node/skillMds/pptx-generator/pptx-generator", {
    runtime: "python",
    runtimeOptions: { python: { useVenv: false, venvPath: ".community-venv", pythonCommand: "python3" } },
  });

  assert.ok(runtimeInfo);
  assert.equal(typeof runtimeInfo.command, "string");
});

test("community node runtime handler: should expose package manager info", () => {
  const handler = getRuntimeHandler("node");
  const runtimeInfo = handler.detect("/Users/zhoumingle/Desktop/myProjects/AI-Agent-Node", {
    runtime: "node",
    runtimeOptions: { node: { packageManager: "npm" } },
  });

  assert.ok(runtimeInfo);
  assert.ok(runtimeInfo.packageManager === "npm" || runtimeInfo.packageManager === "pnpm" || runtimeInfo.packageManager === "yarn");
});

test("community bundle execution: should preserve normalized manifest protocol fields", async () => {
  const loaded = loadCommunitySkillDefinitions();
  const skill = loaded.find((s) => s.name === "qr-code-generator");
  assert.ok(skill);
  assert.ok(skill.bundle?.manifest?.runtimeOptions && typeof skill.bundle.manifest.runtimeOptions === "object");
  assert.ok(skill.bundle?.manifest?.install && typeof skill.bundle.manifest.install === "object");
});

test("community bundle execution: should execute qr generation smoke path", async () => {
  const sessionId = `community_qr_smoke_${Date.now()}`;
  const loaded = loadCommunitySkillDefinitions();
  const skill = loaded.find((s) => s.name === "qr-code-generator");
  assert.ok(skill, "qr-code-generator should be loaded");

  const resultText = await skill.func("生成二维码", "测试二维码生成", "https://example.com/smoke", "qrcodes/smoke.png", '{"size":220,"format":"png"}', sessionId);
  const result = JSON.parse(resultText);

  assert.equal(result.sessionId, sessionId);
  assert.equal(result.mode, "bundle-executed");
  assert.equal(result.executed, true);
  assert.ok(fs.existsSync(result.resolvedOutputPath));
  assert.ok(result.resolvedOutputPath.endsWith(path.join(sessionId, "qrcodes", "smoke.png")));
});

test("community bundle execution: should resolve user workspace input/output path with sessionId", async () => {
  const sessionId = `community_skill_test_${Date.now()}`;
  const loaded = loadCommunitySkillDefinitions();
  const skill = loaded.find((s) => s.name === "qr-code-generator");
  assert.ok(skill, "qr-code-generator should be loaded");

  const resultText = await skill.func("生成二维码", "测试上下文", "https://example.com", "qrcodes/test.png", '{"size":200,"format":"png"}', sessionId);
  const result = JSON.parse(resultText);

  assert.equal(result.sessionId, sessionId);
  assert.equal(result.executed, true);
  assert.equal(result.mode, "bundle-executed");
  assert.equal(result.resolvedInputPath, "https://example.com");
  assert.ok(result.resolvedOutputPath.includes(path.join(sessionId, "qrcodes", "test.png")));
});

