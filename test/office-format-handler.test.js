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

test('fileFormatHandler.writeExcel should parse JSON-string payloads passed directly to implementation', async () => {
  const filePath = 'tmp/direct-json-string.xlsx';
  const payload = JSON.stringify({
    sheetName: 'conversion_funnel',
    headers: ['日期', '渠道', '曝光量', '点击量', '注册量', '付费量', 'ROI'],
    rows: [['2024-04-01', 'Web', 128500, 8920, 1160, 210, '18.6%']],
    columns: [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }],
    autoWidth: false,
  });

  const writeResult = await writeExcel(filePath, TEST_SESSION, payload, { overwrite: true });
  assert.equal(writeResult.success, true);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(SESSION_ROOT, filePath));
  const worksheet = workbook.getWorksheet('conversion_funnel');
  assert.equal(worksheet.getCell('A1').value, '日期');
  assert.equal(worksheet.getCell('A2').value, '2024-04-01');
  assert.equal(worksheet.getCell('B2').value, 'Web');
  assert.equal(worksheet.getCell('C2').value, 128500);
});

test('fileFormatHandler.writeExcel should support multi-sheet payloads and normalize color strings', async () => {
  const filePath = 'tmp/multi-sheet-report.xlsx';
  const payload = {
    sheets: [
      {
        sheetName: '销售漏斗',
        headers: [
          ['阶段总览', '阶段总览', '阶段总览', '阶段总览'],
          ['阶段', 'UV', '转化率', '备注'],
        ],
        rows: [
          [{ value: '曝光', font: { bold: true } }, { value: 120000, numFmt: '#,##0' }, null, '全渠道广告投放'],
          [{ value: '点击', font: { bold: true } }, { value: 8400, numFmt: '#,##0' }, { value: 0.07, numFmt: '0.0%' }, '落地页优化中'],
        ],
        columns: [{ width: 12 }, { width: 14 }, { width: 14 }, { width: 22 }],
        merges: ['A1:D1'],
        autoWidth: false,
      },
      {
        sheetName: '用户反馈',
        headers: ['日期', '用户ID', '情感倾向'],
        rows: [
          [{ value: '2024-04-01', numFmt: 'yyyy-mm-dd' }, { value: 'U1001' }, { value: '负', font: { color: '#ff4d4f' } }],
          [{ value: '2024-04-05', numFmt: 'yyyy-mm-dd' }, { value: 'U1002' }, { value: '正', font: { color: '#52c41a' } }],
        ],
        columns: [{ width: 12 }, { width: 12 }, { width: 12 }],
        autoWidth: false,
      },
    ],
  };

  const writeResult = await writeExcel(filePath, TEST_SESSION, payload, { overwrite: true });
  assert.equal(writeResult.success, true);
  assert.equal(writeResult.sheetCount, 2);
  assert.equal(writeResult.headerCount, 3);
  assert.equal(writeResult.mergeCount, 1);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(SESSION_ROOT, filePath));
  assert.equal(workbook.worksheets.length, 2);
  assert.equal(workbook.getWorksheet('销售漏斗').getCell('A1').value, '阶段总览');
  assert.equal(workbook.getWorksheet('销售漏斗').getCell('B4').value, 8400);
  assert.equal(workbook.getWorksheet('用户反馈').getCell('C2').font.color.argb, 'FFFF4D4F');
  assert.equal(workbook.getWorksheet('用户反馈').getCell('C3').font.color.argb, 'FF52C41A');
});

test('fileFormatHandler.writeExcel should support legacy parallel-array multi-sheet payloads', async () => {
  const filePath = 'tmp/legacy-parallel-multisheet.xlsx';
  const payload = {
    headers: [
      ['订单ID', '客户姓名', '产品名称'],
      ['客户ID', '客户姓名', '联系电话'],
      ['产品ID', '产品名称', '类别'],
    ],
    rows: [
      [
        ['ORD-001', '张三', 'iPhone 15'],
        ['ORD-002', '李四', 'MacBook Pro'],
      ],
      [
        ['CUST-001', '张三', '13800138000'],
        ['CUST-002', '李四', '13900139000'],
      ],
      [
        ['PROD-001', 'iPhone 15', '手机'],
        ['PROD-002', 'MacBook Pro', '电脑'],
      ],
    ],
    columns: [
      [{ width: 12 }, { width: 12 }, { width: 15 }],
      [{ width: 12 }, { width: 12 }, { width: 15 }],
      [{ width: 12 }, { width: 15 }, { width: 12 }],
    ],
    merges: [
      [[0, 0, 0, 2]],
      [[0, 0, 0, 2]],
      [[0, 0, 0, 2]],
    ],
  };

  const writeResult = await writeExcel(filePath, TEST_SESSION, payload, { overwrite: true, sheetName: '销售数据' });
  assert.equal(writeResult.success, true);
  assert.equal(writeResult.sheetCount, 3);
  assert.equal(writeResult.mergeCount, 3);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(SESSION_ROOT, filePath));
  assert.equal(workbook.worksheets.length, 3);
  assert.equal(workbook.getWorksheet('销售数据').getCell('A1').value, '订单ID');
  assert.equal(workbook.getWorksheet('销售数据_2').getCell('A2').value, 'CUST-001');
  assert.equal(workbook.getWorksheet('销售数据_3').getCell('B2').value, 'iPhone 15');
});

test('fileFormatHandler.writeDocx should parse JSON-string payloads passed directly to implementation', async () => {
  const filePath = 'tmp/direct-json-string.docx';
  const payload = JSON.stringify([
    { heading: 'HEADING_1', text: '春夜观代码有感' },
    { alignment: 'RIGHT', text: '—— 甲辰年三月于\n云栈机房' },
    { type: 'blank' },
    { text: '星轨盘桓未肯休，云栈千层接斗牛。' },
  ]);

  const result = await writeDocx(filePath, TEST_SESSION, payload, { overwrite: true, title: 'Direct JSON Word Test' });
  assert.equal(result.success, true);

  const htmlResult = await readWordAsHtml(filePath, TEST_SESSION);
  assert.equal(htmlResult.success, true);
  assert.match(htmlResult.html, /<h1[^>]*>春夜观代码有感<\/h1>/i);
  assert.match(htmlResult.html, /甲辰年三月于/i);
  assert.match(htmlResult.html, /星轨盘桓未肯休/i);
});

test('fileFormatHandler.writeDocx should parse inline markdown inside list items and strip html tags', async () => {
  const filePath = 'tmp/word-inline-markdown.docx';
  const markdown = [
    '1. **需求分析阶段**',
    '   - 支持 *斜体* 与 **加粗** 样式',
    '   - 可包含 [外部链接](https://example.com)',
    '',
    '<span style="background-color:#f0f8ff;padding:4px 8px;border-left:3px solid #1890ff;">仅保留引用内容（代码）</span>',
  ].join('\n');

  const result = await writeDocx(filePath, TEST_SESSION, markdown, { overwrite: true, title: 'Word Inline Markdown Test' });
  assert.equal(result.success, true);

  const htmlResult = await readWordAsHtml(filePath, TEST_SESSION);
  assert.equal(htmlResult.success, true);
  assert.match(htmlResult.html, /需求分析阶段/);
  assert.match(htmlResult.html, /<strong[^>]*>需求分析阶段<\/strong>|<b[^>]*>需求分析阶段<\/b>/i);
  assert.match(htmlResult.html, /<em[^>]*>斜体<\/em>|<i[^>]*>斜体<\/i>/i);
  assert.match(htmlResult.html, /外部链接/);
  assert.match(htmlResult.html, /仅保留引用内容（代码）/);
  assert.doesNotMatch(htmlResult.html, /<span style=/i);
  assert.doesNotMatch(htmlResult.html, /\*\*需求分析阶段\*\*/);
});

test('fileFormatHandler.writeDocx should parse markdown strings passed directly to implementation', async () => {
  const filePath = 'tmp/direct-markdown.docx';
  const markdown = '# 主标题\n\n- 第一项\n- 第二项\n\n| 列1 | 列2 |\n| --- | --- |\n| A | B |';

  const result = await writeDocx(filePath, TEST_SESSION, markdown, { overwrite: true, title: 'Direct Markdown Word Test' });
  assert.equal(result.success, true);

  const htmlResult = await readWordAsHtml(filePath, TEST_SESSION);
  assert.equal(htmlResult.success, true);
  assert.match(htmlResult.html, /<h1[^>]*>主标题<\/h1>/i);
  assert.match(htmlResult.html, /<ul>/i);
  assert.match(htmlResult.html, /<table>/i);
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
