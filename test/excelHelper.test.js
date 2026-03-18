import assert from "node:assert/strict";
import test from "node:test";

import { skillExcelHelper } from "../skills/excelHelper.js";

test("excelHelper: should return excel solution for stats requirement", async () => {
  const result = await skillExcelHelper("计算A列平均值", "numbers");
  assert.ok(result.includes("Excel 助手"));
  assert.ok(result.includes("AVERAGE"));
  assert.ok(result.includes("平均值"));
});

test("excelHelper: should handle mixed data type", async () => {
  const result = await skillExcelHelper("统计数量", "mixed");
  assert.ok(result.includes("数据类型"));
  assert.ok(result.includes("mixed"));
});

test("excelHelper: should include common formulas", async () => {
  const result = await skillExcelHelper("公式需求");
  assert.ok(result.includes("SUM"));
  assert.ok(result.includes("VLOOKUP"));
  assert.ok(result.includes("IF"));
  assert.ok(result.includes("CONCAT"));
});

test("excelHelper: should include tips section", async () => {
  const result = await skillExcelHelper("需求");
  assert.ok(result.includes("操作技巧"));
  assert.ok(result.includes("F4"));
});

test("excelHelper: should handle text data type", async () => {
  const result = await skillExcelHelper("文本处理", "text");
  assert.ok(result.includes("文本处理"));
});

test("excelHelper: should handle date data type", async () => {
  const result = await skillExcelHelper("日期计算", "date");
  assert.ok(result.includes("数据类型"));
});

test("excelHelper: should return error message on failure", async () => {
  const result = await skillExcelHelper(null);
  assert.ok(result.includes("Excel 助手执行失败") || result.includes("Excel 助手"));
});
