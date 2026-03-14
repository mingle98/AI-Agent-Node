import assert from "node:assert/strict";
import test from "node:test";

import { generateDocument } from "../tools/document.js";

test("generateDocument: should generate tutorial document by default", () => {
  const result = generateDocument("AI入门");
  assert.ok(result.includes("AI入门"));
  assert.ok(result.includes("教程文档"));
});

test("generateDocument: should generate different doc types", () => {
  const apiDoc = generateDocument("API设计", "api");
  assert.ok(apiDoc.includes("API文档"));

  const readmeDoc = generateDocument("项目说明", "readme");
  assert.ok(readmeDoc.includes("README文档"));

  const archDoc = generateDocument("系统架构", "architecture");
  assert.ok(archDoc.includes("架构文档"));

  const guideDoc = generateDocument("用户手册", "guide");
  assert.ok(guideDoc.includes("用户指南"));
});

test("generateDocument: should include custom outline", () => {
  const outline = "1. 介绍 2. 使用 3. 示例";
  const result = generateDocument("教程", "tutorial", outline);
  assert.ok(result.includes(outline));
});

test("generateDocument: should use default outline when not provided", () => {
  const result = generateDocument("教程", "tutorial");
  assert.ok(result.includes("将根据主题自动生成大纲"));
});
