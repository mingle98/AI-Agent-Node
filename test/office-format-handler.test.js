import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';

import { writeExcel, readExcel, appendToExcel, writeDocx, readWordAsHtml } from '../tools/fileFormatHandler.js';
import { TOOLS } from '../tools/index.js';

const TEST_SESSION = `office_format_${Date.now()}`;
const SESSION_ROOT = path.resolve('public/workspace', TEST_SESSION);

test('fileFormatHandler.writeExcel/readExcel should preserve styled cells, merges and columns', async () => {
  const filePath = 'tmp/styled-report.xlsx';

  const payload = {
    headers: [
      { value: '项目名称', font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } } },
      { value: '进度', font: { bold: true }, alignment: { horizontal: 'center' } },
    ],
    rows: [
      [
        { value: 'AI 平台升级', font: { bold: true }, alignment: { wrapText: true } },
        { value: 0.85, numFmt: '0%' },
      ],
      {
        cells: [
          { value: '负责人', fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } },
          { value: '张三', alignment: { horizontal: 'center' } },
        ],
        height: 24,
      },
    ],
    columns: [{ width: 24 }, { width: 14 }],
    merges: ['A4:B4'],
    autoWidth: false,
  };

  const writeResult = await writeExcel(filePath, TEST_SESSION, payload, { overwrite: true, sheetName: '项目状态' });
  assert.equal(writeResult.success, true);
  assert.equal(writeResult.mergeCount, 1);

  const readResult = await readExcel(filePath, TEST_SESSION, { sheetName: '项目状态' });
  assert.equal(readResult.success, true);
  assert.equal(readResult.currentSheet.name, '项目状态');
  assert.deepEqual(readResult.merges, ['A4']);
  assert.equal(readResult.columns[0].width, 24);
  assert.equal(readResult.data[0].values[0].text, '项目名称');
  assert.equal(readResult.data[1].values[1].formula, null);
  assert.equal(readResult.data[1].values[1].value, 0.85);
  assert.equal(readResult.data[1].values[1].style.numFmt, '0%');
  assert.equal(readResult.data[2].height, 24);
});

test('fileFormatHandler.appendToExcel should append styled rows without breaking existing workbook', async () => {
  const filePath = 'tmp/append-report.xlsx';

  const first = await writeExcel(filePath, TEST_SESSION, {
    rows: [[{ value: '阶段' }, { value: '说明' }]],
    columns: [{ width: 16 }, { width: 28 }],
  }, { overwrite: true, sheetName: '日志' });
  assert.equal(first.success, true);

  const appendResult = await appendToExcel(filePath, TEST_SESSION, {
    rows: [
      [{ value: '开发' }, { value: 'Prompt 设计完成', alignment: { wrapText: true } }],
      [{ value: '测试' }, { value: { formula: '1+1', result: 2 }, numFmt: '0' }],
    ],
  }, { sheetName: '日志' });
  assert.equal(appendResult.success, true);
  assert.equal(appendResult.appendedRows, 2);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(SESSION_ROOT, filePath));
  const worksheet = workbook.getWorksheet('日志');
  assert.equal(worksheet.rowCount, 3);
  assert.equal(worksheet.getCell('B2').alignment.wrapText, true);
  assert.equal(worksheet.getCell('B3').value.result, 2);
  assert.equal(worksheet.getCell('B3').numFmt, '0');
});

test('TOOLS excel wrappers should accept structured options without breaking existing usage', async () => {
  const filePath = 'tmp/tool-wrapped.xlsx';

  const writeResult = await TOOLS.excel_write(
    TEST_SESSION,
    filePath,
    JSON.stringify({
      headers: ['姓名', '评分'],
      rows: [[{ value: '李四', font: { bold: true } }, { value: 95, numFmt: '0' }]],
      columns: [{ width: 18 }, { width: 10 }],
      autoWidth: false,
    }),
    '绩效',
    JSON.stringify({ overwrite: true })
  );
  assert.equal(writeResult.success, true);

  const appendResult = await TOOLS.excel_append(
    TEST_SESSION,
    filePath,
    JSON.stringify({ rows: [[{ value: '王五' }, { value: 88, numFmt: '0' }]] }),
    JSON.stringify({ sheetName: '绩效' })
  );
  assert.equal(appendResult.success, true);

  const readResult = await TOOLS.excel_read(TEST_SESSION, filePath, '绩效');
  assert.equal(readResult.success, true);
  assert.equal(readResult.data[0].values[0].text, '姓名');
  assert.equal(readResult.data[1].values[0].text, '李四');
  assert.equal(readResult.data[2].values[1].value, 88);
});

test('fileFormatHandler.writeDocx should support markdown parsing for headings, lists and tables', async () => {
  const filePath = 'tmp/word-markdown.docx';
  const markdown = [
    '# AI 工程实践入门指南',
    '',
    '这是 **重点** 段落。',
    '',
    '1. 统一数据管理',
    '  1. 统一标注规范',
    '2. 模型生命周期管理',
    '',
    '> 这是引用说明',
    '',
    '```js',
    'console.log("hello")',
    '```',
    '',
    '| 阶段 | 关键活动 |',
    '| --- | --- |',
    '| 开发 | Prompt 设计 |',
    '| 测试 | 样本验证 |',
  ].join('\n');

  const result = await writeDocx(filePath, TEST_SESSION, markdown, { overwrite: true, title: 'Word Markdown Test' });
  assert.equal(result.success, true);
  assert.equal(result.tableCount, 1);
  assert.ok(result.paragraphCount >= 6);

  const htmlResult = await readWordAsHtml(filePath, TEST_SESSION);
  assert.equal(htmlResult.success, true);
  assert.match(htmlResult.html, /<h1[^>]*>AI 工程实践入门指南<\/h1>/i);
  assert.match(htmlResult.html, /<ol>/i);
  assert.match(htmlResult.html, /<table>/i);
  assert.match(htmlResult.html, /console\.log/i);
  assert.match(htmlResult.html, /这是引用说明/);
});

test('TOOLS.word_write_docx should accept object options without changing wrapper behavior', async () => {
  const filePath = 'tmp/tool-word-docx.docx';
  const result = await TOOLS.word_write_docx(
    TEST_SESSION,
    filePath,
    '# 标题\n\n正文段落',
    { title: 'Tool Word Docx Test' }
  );

  assert.equal(result.success, true);

  const htmlResult = await readWordAsHtml(filePath, TEST_SESSION);
  assert.equal(htmlResult.success, true);
  assert.match(htmlResult.html, /<h1[^>]*>标题<\/h1>/i);
  assert.match(htmlResult.html, /正文段落/);
});

test('TOOLS excel wrappers should parse markdown table text automatically', async () => {
  const filePath = 'tmp/tool-markdown-table.xlsx';
  const markdownTable = [
    '| 姓名 | 分数 | 日期 | 是否通过 |',
    '| --- | --- | --- | --- |',
    '| 张三 | 90 | 2026-04-14 | true |',
    '| 李四 | 88.5% | 2026-04-15 10:20:30 | false |',
  ].join('\n');

  const writeResult = await TOOLS.excel_write(
    TEST_SESSION,
    filePath,
    markdownTable,
    'Markdown表格',
    JSON.stringify({ overwrite: true, autoWidth: false, columns: [{ width: 16 }, { width: 10 }, { width: 20 }, { width: 12 }] })
  );
  assert.equal(writeResult.success, true);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(SESSION_ROOT, filePath));
  const worksheet = workbook.getWorksheet('Markdown表格');
  assert.equal(worksheet.getCell('B2').value, 90);
  assert.equal(worksheet.getCell('B3').value, 0.885);
  assert.equal(worksheet.getCell('D2').value, true);
  assert.ok(worksheet.getCell('C2').value instanceof Date);

  const readResult = await TOOLS.excel_read(TEST_SESSION, filePath, 'Markdown表格');
  assert.equal(readResult.success, true);
  assert.equal(readResult.data[0].values[0].text, '姓名');
  assert.equal(readResult.data[1].values[0].text, '张三');
  assert.equal(readResult.data[2].values[1].value, 0.885);
});

test('fileFormatHandler.writeDocx should support table/list/blank blocks', async () => {
  const filePath = 'tmp/word-structured.docx';
  const result = await writeDocx(filePath, TEST_SESSION, [
    { heading: 'HEADING_1', text: 'AI 工程实践入门指南' },
    { type: 'orderedList', items: ['统一数据管理', '模型生命周期管理'] },
    { type: 'table', rows: [['阶段', '关键活动'], ['开发', 'Prompt 设计']] },
    { type: 'blank' },
    { text: '交付闭环是 AI 工程落地的终极标尺。' },
  ], { overwrite: true, title: 'Word Structured Test' });

  assert.equal(result.success, true);
  assert.equal(result.tableCount, 1);
  assert.equal(result.blockCount, 6);
});

test('cleanup office format test workspace', async () => {
  await fs.rm(SESSION_ROOT, { recursive: true, force: true });
});
