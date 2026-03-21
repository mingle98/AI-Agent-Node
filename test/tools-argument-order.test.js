/**
 * 工具函数参数顺序断言测试
 * 直接验证 toolFunc 接收到的参数位置
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../tools/index.js';

const TEST_SESSION = `arg_order_test_${Date.now()}`;

/**
 * 验证文件格式工具参数顺序
 * 关键：sessionId 应该作为第一个参数传入底层函数
 */
test('argument order: excel tools', async () => {
  const excelPath = 'tmp/arg-order-test.xlsx';

  // excel_write: (sessionId, filePath, data, sheetName)
  // 底层: writeExcel(filePath, sessionId, data, options)
  // 验证通过构造数据来判断
  const testData = [['TestHeader'], ['TestValue']];

  // 如果参数顺序错误，writeExcel 会把 sessionId 当成 filePath 或反之
  // 正确的顺序应该能成功创建文件
  const writeRes = await TOOLS.excel_write(
    TEST_SESSION,
    excelPath,
    JSON.stringify(testData),
    'TestSheet'
  );

  // 断言：参数顺序正确时应该成功
  assert.equal(writeRes.success, true, 'excel_write 参数顺序应该正确');
  assert.equal(writeRes.filePath, excelPath, 'filePath 应该匹配');

  // excel_read: (sessionId, filePath, sheetName) -> readExcel(filePath, sessionId, options)
  const readRes = await TOOLS.excel_read(TEST_SESSION, excelPath, 'TestSheet');
  assert.equal(readRes.success, true, 'excel_read 参数顺序应该正确');

  // 清理
  await TOOLS.file_delete(TEST_SESSION, 'tmp/arg-order-test.xlsx', false);
});

test('argument order: pdf tools', async () => {
  const pdfPath = 'tmp/arg-order-test.pdf';

  // pdf_write: (sessionId, filePath, content, options)
  // 底层: writePdf(filePath, sessionId, pages, options)
  const writeRes = await TOOLS.pdf_write(
    TEST_SESSION,
    pdfPath,
    'Test PDF Content',
    '{}'
  );

  // 即使 pdf_write 内部可能因字体失败，参数传递应该正确
  // 错误应该是字体相关，而不是路径相关
  if (!writeRes.success) {
    // 如果是字体错误，说明参数顺序是对的（执行到了字体注册）
    const isFontError = writeRes.error && writeRes.error.includes('font');
    const isPathError = writeRes.error && (
      writeRes.error.includes('ENOENT') ||
      writeRes.error.includes('not found') ||
      writeRes.error.includes('路径')
    );

    if (isPathError) {
      assert.fail(`pdf_write 参数顺序错误: ${writeRes.error}`);
    }
    // 字体错误是可接受的，说明参数传递到了正确的函数
  } else {
    // 成功是最好的验证
    assert.equal(writeRes.filePath, pdfPath, 'pdf_write 路径应该匹配');

    // pdf_read: (sessionId, filePath) -> readPdf(filePath, sessionId)
    const readRes = await TOOLS.pdf_read(TEST_SESSION, pdfPath);
    assert.equal(readRes.success, true, 'pdf_read 应该成功');
  }

  // 清理
  await TOOLS.file_delete(TEST_SESSION, pdfPath, false).catch(() => {});
});

test('argument order: csv and json tools', async () => {
  // csv_write: (sessionId, filePath, data)
  // 底层: writeCsv(filePath, sessionId, data, options)
  const csvPath = 'tmp/arg-order-test.csv';
  const csvData = [{ name: 'test', value: 123 }];

  const csvWriteRes = await TOOLS.csv_write(
    TEST_SESSION,
    csvPath,
    JSON.stringify(csvData)
  );
  assert.equal(csvWriteRes.success, true, 'csv_write 参数顺序应该正确');
  assert.equal(csvWriteRes.filePath, csvPath, 'csv 路径应该匹配');

  // csv_read: (sessionId, filePath) -> readCsv(filePath, sessionId)
  const csvReadRes = await TOOLS.csv_read(TEST_SESSION, csvPath);
  assert.equal(csvReadRes.success, true, 'csv_read 参数顺序应该正确');
  assert.ok(Array.isArray(csvReadRes.data), 'csv_read 应该返回数组');

  // json_write: (sessionId, filePath, data)
  // 底层: writeJson(filePath, sessionId, data, options)
  const jsonPath = 'tmp/arg-order-test.json';
  const jsonData = { test: true, value: 456 };

  const jsonWriteRes = await TOOLS.json_write(
    TEST_SESSION,
    jsonPath,
    JSON.stringify(jsonData)
  );
  assert.equal(jsonWriteRes.success, true, 'json_write 参数顺序应该正确');

  // json_read: (sessionId, filePath) -> readJson(filePath, sessionId)
  const jsonReadRes = await TOOLS.json_read(TEST_SESSION, jsonPath);
  assert.equal(jsonReadRes.success, true, 'json_read 参数顺序应该正确');
  assert.equal(jsonReadRes.data.value, 456, 'json 数据应该匹配');

  // 清理
  await TOOLS.file_delete(TEST_SESSION, csvPath, false);
  await TOOLS.file_delete(TEST_SESSION, jsonPath, false);
});

test('argument order: word tools', async () => {
  // word_read: (sessionId, filePath) -> readWord(filePath, sessionId)
  // 创建一个假的 docx 文件测试
  const wordPath = 'tmp/arg-order-test.docx';

  // 先写入一个空文件
  await TOOLS.file_write(TEST_SESSION, wordPath, 'not a real docx', true);

  // word_read 会失败（因为不是真实 docx），但如果参数顺序错误会报路径错误
  const readRes = await TOOLS.word_read(TEST_SESSION, wordPath);

  // 如果参数顺序正确，错误应该是解析相关而非路径相关
  if (!readRes.success) {
    const isPathError = readRes.error && (
      readRes.error.includes('ENOENT') ||
      readRes.error.includes('not found')
    );
    assert.equal(isPathError, false, 'word_read 错误应该是解析错误而非路径错误');
  }

  // word_read_html: (sessionId, filePath) -> readWordAsHtml(filePath, sessionId)
  const htmlRes = await TOOLS.word_read_html(TEST_SESSION, wordPath);
  if (!htmlRes.success) {
    const isPathError = htmlRes.error && (
      htmlRes.error.includes('ENOENT') ||
      htmlRes.error.includes('not found')
    );
    assert.equal(isPathError, false, 'word_read_html 错误应该是解析错误而非路径错误');
  }

  // 清理
  await TOOLS.file_delete(TEST_SESSION, wordPath, false);
});

test('argument order: image and svg tools', async () => {
  // svg_write: (sessionId, filePath, content)
  // 底层: writeSvg(filePath, sessionId, content, options)
  const svgPath = 'tmp/arg-order-test.svg';

  const writeRes = await TOOLS.svg_write(
    TEST_SESSION,
    svgPath,
    '<rect width="100" height="100"/>'
  );
  assert.equal(writeRes.success, true, 'svg_write 参数顺序应该正确');
  assert.equal(writeRes.filePath, svgPath, 'svg 路径应该匹配');

  // image_info: (sessionId, filePath) -> getImageInfo(filePath, sessionId)
  const infoRes = await TOOLS.image_info(TEST_SESSION, svgPath);
  assert.equal(infoRes.success, true, 'image_info 参数顺序应该正确');
  assert.equal(infoRes.filePath, svgPath, 'image_info 路径应该匹配');

  // 清理
  await TOOLS.file_delete(TEST_SESSION, svgPath, false);
});

test('argument order: zip tools', async () => {
  // 先创建一些文件用于压缩
  await TOOLS.file_write(TEST_SESSION, 'tmp/zip-test/file1.txt', 'content1', true);
  await TOOLS.file_write(TEST_SESSION, 'tmp/zip-test/file2.txt', 'content2', true);

  // zip_compress: (sessionId, sourcePaths, outputPath, options)
  // 底层: compressFiles(sessionId, sourcePaths, outputPath, options) - 注意顺序相同！
  const zipPath = 'tmp/arg-order-test.zip';
  const compressRes = await TOOLS.zip_compress(
    TEST_SESSION,
    'tmp/zip-test',
    zipPath,
    '{}'
  );
  assert.equal(compressRes.success, true, 'zip_compress 参数顺序应该正确');
  assert.equal(compressRes.outputPath, zipPath, 'zip 输出路径应该匹配');

  // zip_info: (sessionId, zipPath) -> getArchiveInfo(sessionId, zipPath) - 顺序相同！
  const infoRes = await TOOLS.zip_info(TEST_SESSION, zipPath);
  assert.equal(infoRes.success, true, 'zip_info 参数顺序应该正确');

  // zip_list: (sessionId, zipPath, maxFiles) -> listArchiveContents(sessionId, zipPath, options)
  const listRes = await TOOLS.zip_list(TEST_SESSION, zipPath, 100);
  assert.equal(listRes.success, true, 'zip_list 参数顺序应该正确');

  // zip_extract: (sessionId, zipPath, extractPath, options)
  // 底层: extractArchive(sessionId, zipPath, extractPath, options) - 顺序相同！
  const extractRes = await TOOLS.zip_extract(
    TEST_SESSION,
    zipPath,
    'tmp/zip-extracted',
    '{}'
  );
  assert.equal(extractRes.success, true, 'zip_extract 参数顺序应该正确');

  // 清理
  await TOOLS.file_delete(TEST_SESSION, 'tmp/zip-test', true);
  await TOOLS.file_delete(TEST_SESSION, zipPath, false);
  await TOOLS.file_delete(TEST_SESSION, 'tmp/zip-extracted', true);
});

/**
 * 关键测试：验证调度器回调中参数顺序
 * 通过检查错误类型来判断
 */
test('argument order in scheduler callbacks', async () => {
  const { initScheduler, stopScheduler, scheduleTask, getTasks } = await import('../tools/scheduler.js');

  await initScheduler();

  const pdfPath = 'tmp/callback-arg-order.pdf';

  // 创建一个0延迟任务，回调执行 pdf_write
  const scheduleRes = await scheduleTask(
    TEST_SESSION,
    0.01, // 约1秒延迟（最小值）
    'exec_code',
    { code: `print('callback test')`, language: 'python' },
    '测试回调参数顺序',
    {
      taskType: 'pdf_write',
      params: {
        filePath: pdfPath,
        content: 'Result: {{result}}'
      }
    }
  );

  assert.equal(scheduleRes.success, true, 'scheduleTask 应该成功');

  // 等待执行（调度器每5秒检查一次，所以需要等待超过5秒）
  await new Promise(r => setTimeout(r, 6000));

  // 检查任务状态
  const tasks = await getTasks(TEST_SESSION, 'completed');
  const task = tasks.find(t => t.id === scheduleRes.taskId);

  assert.ok(task, '任务应该已完成');

  // 如果回调参数顺序错误，callbackError 会包含路径相关的错误
  if (task.callbackError) {
    const isPathError = task.callbackError.includes('ENOENT') ||
                       task.callbackError.includes('not found') ||
                       task.callbackError.includes('路径');
    assert.equal(isPathError, false, `回调参数顺序错误: ${task.callbackError}`);
  }

  // 如果 pdf 创建成功，说明参数顺序完全正确
  const pdfInfo = await TOOLS.file_info(TEST_SESSION, pdfPath);
  if (pdfInfo.success) {
    assert.ok(pdfInfo.size > 0, 'PDF应该成功创建且有内容');
  }

  await stopScheduler();

  // 清理
  await TOOLS.file_delete(TEST_SESSION, pdfPath, false).catch(() => {});
});

/**
 * 对比测试：手动调用 vs 通过 Object.values 调用
 * 验证展开参数的顺序问题
 */
test('argument passing: manual vs Object.values', async () => {
  const jsonPath = 'tmp/manual-vs-spread.json';
  const data = { test: 'order', value: 999 };

  // 方式1：直接调用（正确）
  const directRes = await TOOLS.json_write(
    TEST_SESSION,
    jsonPath,
    JSON.stringify(data)
  );
  assert.equal(directRes.success, true, '直接调用应该成功');

  // 方式2：模拟调度器的方式（Object.values 展开）
  const paramsObj = {
    sessionId: TEST_SESSION,
    filePath: 'tmp/spread-test.json',
    data: JSON.stringify({ test: 'spread', value: 888 })
  };

  // 这模拟了 scheduler.js 中的调用方式
  const spreadRes = await TOOLS.json_write(...Object.values(paramsObj));

  // Object.values 的顺序依赖于对象属性插入顺序
  // 如果顺序错误，会出现路径错误或 session 错误
  if (!spreadRes.success) {
    const isOrderError = spreadRes.error && (
      spreadRes.error.includes('sessionId') ||
      spreadRes.error.includes('需要提供') ||
      spreadRes.error.includes('ENOENT')
    );
    assert.equal(isOrderError, false, `Object.values 展开参数顺序错误: ${spreadRes.error}`);
  }

  // 清理
  await TOOLS.file_delete(TEST_SESSION, jsonPath, false);
  await TOOLS.file_delete(TEST_SESSION, 'tmp/spread-test.json', false);
});
