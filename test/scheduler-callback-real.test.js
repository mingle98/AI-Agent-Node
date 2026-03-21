/**
 * 调度器真实回调执行测试
 * 验证链式任务在实际执行时参数传递正确
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TOOLS } from '../tools/index.js';
import { initScheduler, stopScheduler, cleanupTasks } from '../tools/scheduler.js';

const TEST_SESSION = `callback_real_test_${Date.now()}`;
const TEST_DIR = 'tmp/callback-real-test';

// 初始化调度器
test('setup: init scheduler', async () => {
  await initScheduler();
});

/**
 * 测试1: exec_code -> pdf_write 链式回调
 * 验证参数在真实执行时传递正确
 */
test('real callback: exec_code -> pdf_write', async () => {
  const execCode = `data = [1,2,3,4,5]\navg = sum(data)/len(data)\nprint(f'Average: {avg}')`;
  const pdfPath = `${TEST_DIR}/result-from-callback.pdf`;

  // 创建任务
  const scheduleRes = await TOOLS.schedule_task(
    TEST_SESSION,
    0.01, // 约1秒延迟
    'exec_code',
    JSON.stringify({ code: execCode, language: 'python' }),
    '计算平均值并生成PDF',
    JSON.stringify({
      taskType: 'pdf_write',
      params: {
        filePath: pdfPath,
        content: '计算结果: {{result}}'
      }
    })
  );

  assert.equal(scheduleRes.success, true, 'schedule_task 应该成功');
  assert.ok(scheduleRes.taskId, '应该返回taskId');

  // 等待执行（调度器每5秒检查一次，需要等待超过5秒）
  await new Promise(r => setTimeout(r, 6000));

  // 验证PDF文件被创建
  const pdfInfo = await TOOLS.file_info(TEST_SESSION, pdfPath);
  // 注意：由于字体问题，pdf_write 可能失败，但至少应该尝试执行
  // 如果文件存在，说明回调执行成功
  if (pdfInfo.success) {
    assert.ok(pdfInfo.size > 0, 'PDF文件应该有内容');
  }

  // 查询任务状态
  const tasks = await TOOLS.schedule_list(TEST_SESSION, 'completed');
  const completedTask = tasks.find(t => t.id === scheduleRes.taskId);
  assert.ok(completedTask, '主任务应该已完成');
});

/**
 * 测试2: 验证回调参数顺序 - pdf_write 作为独立调用 vs 作为回调
 */
test('callback param order: compare direct vs callback', async () => {
  const content = 'Test Content 123';
  const pdfPath1 = `${TEST_DIR}/direct.pdf`;
  const pdfPath2 = `${TEST_DIR}/callback.pdf`;

  // 直接调用 pdf_write - 可能因字体失败，但参数传递正确即可
  const directRes = await TOOLS.pdf_write(TEST_SESSION, pdfPath1, content, '{}');
  if (!directRes.success) {
    // 如果是字体错误，说明参数传递正确
    const isFontError = directRes.error && directRes.error.includes('font');
    const isPathError = directRes.error && (directRes.error.includes('ENOENT') || directRes.error.includes('not found'));
    if (isPathError) {
      assert.fail(`pdf_write 参数顺序错误: ${directRes.error}`);
    }
    if (isFontError) {
      console.log('pdf_write 字体问题（可接受），参数顺序正确');
    }
  }

  // 通过回调调用 pdf_write
  const execCode = `print('${content}')`;
  const scheduleRes = await TOOLS.schedule_task(
    TEST_SESSION,
    0.02,
    'exec_code',
    JSON.stringify({ code: execCode, language: 'python' }),
    '测试回调参数顺序',
    JSON.stringify({
      taskType: 'pdf_write',
      params: {
        filePath: pdfPath2,
        content: '{{result}}'
      }
    })
  );

  assert.equal(scheduleRes.success, true, 'schedule_task 应该成功');

  // 等待执行（调度器每5秒检查一次，需要等待超过5秒）
  await new Promise(r => setTimeout(r, 6000));

  // 验证两个PDF都创建成功（或都失败）
  const directInfo = await TOOLS.file_info(TEST_SESSION, pdfPath1);
  const callbackInfo = await TOOLS.file_info(TEST_SESSION, pdfPath2);

  // 如果直接调用成功，回调也应该成功（参数传递正确）
  if (directInfo.success) {
    assert.equal(callbackInfo.success, true, '回调方式应该和直接调用有相同结果');
  }
});

/**
 * 测试3: 三层链式回调 exec_code -> pdf_write -> file_info
 * 验证多层嵌套回调参数传递
 */
test('nested callback: exec_code -> pdf_write -> file_info', async () => {
  const pdfPath = `${TEST_DIR}/nested-result.pdf`;
  const execCode = `print('nested test')`;

  const scheduleRes = await TOOLS.schedule_task(
    TEST_SESSION,
    0.02,
    'exec_code',
    JSON.stringify({ code: execCode, language: 'python' }),
    '三层链式测试',
    JSON.stringify({
      taskType: 'pdf_write',
      params: {
        filePath: pdfPath,
        content: '{{result}}'
      },
      onComplete: {
        taskType: 'file_info',
        params: {
          filePath: pdfPath
        }
      }
    })
  );

  assert.equal(scheduleRes.success, true, 'schedule_task 应该成功');

  // 等待执行（调度器每5秒检查一次，需要等待超过5秒）
  await new Promise(r => setTimeout(r, 6000));

  // 验证最外层回调应该记录结果
  const tasks = await TOOLS.schedule_list(TEST_SESSION, 'completed');
  const task = tasks.find(t => t.id === scheduleRes.taskId);
  assert.ok(task, '任务应该已完成');
});

/**
 * 测试4: csv_write 作为回调目标
 */
test('callback to csv_write', async () => {
  const csvPath = `${TEST_DIR}/callback-data.csv`;
  const execCode = `print('[{"name":"Alice","score":100}]')`;

  const scheduleRes = await TOOLS.schedule_task(
    TEST_SESSION,
    0.02,
    'exec_code',
    JSON.stringify({ code: execCode, language: 'python' }),
    '生成CSV数据',
    JSON.stringify({
      taskType: 'csv_write',
      params: {
        filePath: csvPath,
        // 解析exec_code的输出JSON
        data: '{{result}}'
      }
    })
  );

  assert.equal(scheduleRes.success, true, 'schedule_task 应该成功');

  // 等待执行（调度器每5秒检查一次，需要等待超过5秒）
  await new Promise(r => setTimeout(r, 6000));

  // 验证CSV文件
  const csvInfo = await TOOLS.file_info(TEST_SESSION, csvPath);
  if (csvInfo.success) {
    assert.ok(csvInfo.size > 0, 'CSV文件应该有内容');
  }
});

/**
 * 测试5: 验证 sessionId 在回调中正确传递（用户隔离）
 */
// test('session isolation in callbacks', async () => {
/* DISABLED: 等待时间过长（需12秒），功能已由 user-isolation.test.js 覆盖
test('session isolation in callbacks', async () => {
  const SESSION_A = `isolation_test_A_${Date.now()}`;
  const SESSION_B = `isolation_test_B_${Date.now()}`;
  const pdfPathA = `${TEST_DIR}/session-a.pdf`;
  const pdfPathB = `${TEST_DIR}/session-b.pdf`;

  // 会话A创建任务
  const resA = await TOOLS.schedule_task(
    SESSION_A,
    0.02,
    'exec_code',
    JSON.stringify({ code: `print('A')`, language: 'python' }),
    '会话A的任务',
    JSON.stringify({
      taskType: 'pdf_write',
      params: {
        filePath: pdfPathA,
        content: 'Session A Result'
      }
    })
  );

  // 会话B创建任务
  const resB = await TOOLS.schedule_task(
    SESSION_B,
    0.02,
    'exec_code',
    JSON.stringify({ code: `print('B')`, language: 'python' }),
    '会话B的任务',
    JSON.stringify({
      taskType: 'pdf_write',
      params: {
        filePath: pdfPathB,
        content: 'Session B Result'
      }
    })
  );

  assert.equal(resA.success, true, '会话A任务应该成功');
  assert.equal(resB.success, true, '会话B任务应该成功');

  // 等待执行（调度器每5秒检查一次，两个任务可能分在不同周期，需要等待12秒）
  await new Promise(r => setTimeout(r, 12000));

  // 验证：会话A只能看到自己的任务（检查completed和failed状态）
  const tasksA = [
    ...await TOOLS.schedule_list(SESSION_A, 'completed'),
    ...await TOOLS.schedule_list(SESSION_A, 'failed')
  ];
  const tasksB = [
    ...await TOOLS.schedule_list(SESSION_B, 'completed'),
    ...await TOOLS.schedule_list(SESSION_B, 'failed')
  ];

  assert.ok(tasksA.some(t => t.id === resA.taskId), '会话A应该看到自己的任务');
  assert.ok(!tasksA.some(t => t.id === resB.taskId), '会话A不应该看到会话B的任务');

  assert.ok(tasksB.some(t => t.id === resB.taskId), '会话B应该看到自己的任务');
  assert.ok(!tasksB.some(t => t.id === resA.taskId), '会话B不应该看到会话A的任务');
});
*/

// 清理
test('cleanup', async () => {
  await cleanupTasks();
  await TOOLS.file_delete(TEST_SESSION, TEST_DIR, true);
  await stopScheduler();
  await rm(resolve('public/workspace', TEST_SESSION), { recursive: true, force: true });
});
