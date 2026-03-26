/**
 * 调度器基础功能测试
 * 验证定时任务创建、执行、查询、取消的基本流程
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TOOLS } from '../tools/index.js';
import { initScheduler, stopScheduler, cleanupTasks } from '../tools/scheduler.js';

const TEST_SESSION = `scheduler_test_${Date.now()}`;
const TEST_DIR = 'tmp/scheduler-test';

// 初始化调度器
test('setup: init scheduler', async () => {
  await initScheduler();
});

/**
 * 测试1: 创建定时任务并验证执行
 */
test('schedule_task: 创建并执行定时任务', async () => {
  const execCode = `data = [1, 2, 3, 4, 5]\navg = sum(data) / len(data)\nprint(f'Average: {avg}')`;

  const res = await TOOLS.schedule_task(
    TEST_SESSION,
    0.01, // 约1秒
    'exec_code',
    JSON.stringify({ code: execCode, language: 'python' }),
    '计算平均值'
  );

  assert.equal(res.success, true, 'schedule_task 应该成功');
  assert.ok(res.taskId, '应该返回 taskId');
  assert.ok(res.executeAt, '应该返回 executeAt');

  // 等待执行
  await new Promise(r => setTimeout(r, 6000));

  // 验证任务状态
  const tasks = await TOOLS.schedule_list(TEST_SESSION, 'completed');
  const task = tasks.find(t => t.id === res.taskId);
  assert.ok(task, '任务应该已完成');
  assert.equal(task.taskType, 'exec_code', '任务类型应该正确');
});

/**
 * 测试2: 查询待执行任务
 */
test('schedule_list: 查询待执行任务', async () => {
  // 创建一个待执行任务
  await TOOLS.schedule_task(
    TEST_SESSION,
    5, // 5分钟后
    'exec_code',
    JSON.stringify({ code: 'print(1)', language: 'python' }),
    '延迟任务'
  );

  const tasks = await TOOLS.schedule_list(TEST_SESSION, 'pending');
  assert.ok(tasks.length >= 1, '应该至少有一个待执行任务');
});

/**
 * 测试3: 取消定时任务
 */
test('schedule_cancel: 取消定时任务', async () => {
  // 创建任务
  const res = await TOOLS.schedule_task(
    TEST_SESSION,
    10,
    'exec_code',
    JSON.stringify({ code: 'print(1)', language: 'python' }),
    '待取消的任务'
  );

  assert.equal(res.success, true, '创建任务应该成功');

  // 取消任务
  const cancelRes = await TOOLS.schedule_cancel(TEST_SESSION, res.taskId);
  assert.equal(cancelRes.success, true, '取消任务应该成功');

  // 验证任务状态
  const tasks = await TOOLS.schedule_list(TEST_SESSION, 'cancelled');
  const task = tasks.find(t => t.id === res.taskId);
  assert.ok(task, '任务应该被取消');
});

/**
 * 测试4: 用户隔离（只能看到自己的任务）
 */
test('用户隔离：只能看到自己的任务', async () => {
  const SESSION_A = `isolation_A_${Date.now()}`;
  const SESSION_B = `isolation_B_${Date.now()}`;

  const resA = await TOOLS.schedule_task(
    SESSION_A,
    0.01,
    'exec_code',
    JSON.stringify({ code: 'print("A")', language: 'python' }),
    '会话A的任务'
  );

  const resB = await TOOLS.schedule_task(
    SESSION_B,
    0.01,
    'exec_code',
    JSON.stringify({ code: 'print("B")', language: 'python' }),
    '会话B的任务'
  );

  assert.equal(resA.success, true);
  assert.equal(resB.success, true);

  await new Promise(r => setTimeout(r, 6000));

  const tasksA = await TOOLS.schedule_list(SESSION_A, 'completed');
  const tasksB = await TOOLS.schedule_list(SESSION_B, 'completed');

  assert.ok(tasksA.some(t => t.id === resA.taskId), '会话A应该看到自己的任务');
  assert.ok(!tasksA.some(t => t.id === resB.taskId), '会话A不应该看到会话B的任务');
  assert.ok(tasksB.some(t => t.id === resB.taskId), '会话B应该看到自己的任务');
  assert.ok(!tasksB.some(t => t.id === resA.taskId), '会话B不应该看到会话A的任务');
});

/**
 * 测试5: email_send 附件路径含 /workspace/{sessionId}/ 前缀时不再重复拼接
 */
test('email_send: 附件路径含完整前缀不抛双 sessionId 错误', async () => {
  const pdfPath = `${TEST_DIR}/attachment-test.pdf`;
  const pdfRes = await TOOLS.pdf_write(
    TEST_SESSION,
    pdfPath,
    '# 测试附件\n\nPDF 附件路径测试',
    JSON.stringify({ overwrite: true })
  );
  assert.equal(pdfRes.success, true, 'PDF 创建失败');

  const fullUrlPath = pdfRes.url;

  const result = await TOOLS.email_send(
    TEST_SESSION,
    'test@example.com',
    '测试邮件',
    '附件路径测试',
    JSON.stringify({
      attachments: [{ filename: 'test.pdf', path: fullUrlPath }]
    })
  );

  const errMsg = result.error || '';
  const isPathNotFound = errMsg.includes('ENOENT') || errMsg.includes('no such file');
  const isDoubleSession = errMsg.includes('workspace') && errMsg.includes('workspace');
  assert.ok(
    !isDoubleSession && !isPathNotFound,
    `附件路径解析错误（疑似双 sessionId）: ${errMsg}`
  );
});

// 清理
test('cleanup', async () => {
  await cleanupTasks();
  await TOOLS.file_delete(TEST_SESSION, TEST_DIR, true);
  await stopScheduler();
  await rm(resolve('public/workspace', TEST_SESSION), { recursive: true, force: true });
});
