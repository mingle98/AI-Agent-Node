/**
 * 调度器基础功能测试
 */
import assert from "node:assert/strict";
import test from "node:test";
import { access, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_FILE = join(__dirname, '../data/scheduled_tasks.callback.test.json');
const USER_A = "test_user_callback";

async function loadScheduler() {
  process.env.SCHEDULER_TASKS_FILE = TASKS_FILE;
  const scheduler = await import(`../tools/scheduler.js?test=${Date.now()}-${Math.random()}`);
  return scheduler;
}

async function cleanupFile() {
  try {
    await access(TASKS_FILE);
    await unlink(TASKS_FILE);
  } catch {}
}

test("scheduleTask: 创建普通定时任务", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();

  const result = await scheduleTask(
    USER_A,
    5,
    "exec_code",
    { code: "console.log('hello')", language: "javascript" },
    "普通任务"
  );

  assert.equal(result.success, true);
  assert.ok(result.taskId);
  assert.ok(result.executeAt);

  stopScheduler();
  await cleanupFile();
});

test("scheduleTask: 任务对象不包含 onComplete", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();

  const result = await scheduleTask(
    USER_A,
    5,
    "exec_code",
    { code: "1 + 1", language: "javascript" },
    "测试任务"
  );

  assert.equal(result.success, true);

  const fs = await import('fs/promises');
  const data = await fs.readFile(TASKS_FILE, 'utf-8');
  const tasks = JSON.parse(data);
  const task = tasks.find(t => t.id === result.taskId);

  assert.ok(task, "任务应存在");
  assert.ok(!('onComplete' in task), "任务对象不应包含 onComplete 属性");

  stopScheduler();
  await cleanupFile();
});

test("scheduleTask: 无效参数返回错误", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();

  // 无效 sessionId（email_send 需 sessionId）
  const res1 = await scheduleTask(null, 5, "email_send", { to: "a@b.com", subject: "t", content: "c" }, "测试");
  assert.equal(res1.success, false);

  // 延迟为负数
  const res2 = await scheduleTask(USER_A, -1, "exec_code", {}, "测试");
  assert.equal(res2.success, false);

  stopScheduler();
  await cleanupFile();
});

test("getTasks: 查询任务列表", async () => {
  await cleanupFile();
  const { scheduleTask, getTasks, stopScheduler } = await loadScheduler();

  await scheduleTask(USER_A, 10, "exec_code", { code: "1", language: "javascript" }, "任务1");
  await scheduleTask(USER_A, 20, "exec_code", { code: "2", language: "javascript" }, "任务2");

  const all = getTasks(USER_A, 'all');
  assert.ok(all.length >= 2, "应至少看到2个任务");

  const pending = getTasks(USER_A, 'pending');
  assert.ok(pending.length >= 2, "应至少看到2个待执行任务");

  stopScheduler();
  await cleanupFile();
});

test("cancelTask: 取消待执行任务", async () => {
  await cleanupFile();
  const { scheduleTask, cancelTask, getTasks, stopScheduler } = await loadScheduler();

  const res = await scheduleTask(USER_A, 60, "exec_code", { code: "1", language: "javascript" }, "待取消");
  assert.equal(res.success, true);

  const cancelRes = await cancelTask(USER_A, res.taskId);
  assert.equal(cancelRes.success, true);

  const cancelled = getTasks(USER_A, 'cancelled');
  assert.ok(cancelled.some(t => t.id === res.taskId), "任务应被标记为取消");

  stopScheduler();
  await cleanupFile();
});

test("用户隔离: 只能操作自己的任务", async () => {
  await cleanupFile();
  const { scheduleTask, cancelTask, stopScheduler } = await loadScheduler();

  const USER_B = "test_user_B";
  const resA = await scheduleTask(USER_A, 60, "exec_code", { code: "A", language: "javascript" }, "A的任务");
  const resB = await scheduleTask(USER_B, 60, "exec_code", { code: "B", language: "javascript" }, "B的任务");

  // A 无法取消 B 的任务
  const cancelB = await cancelTask(USER_A, resB.taskId);
  assert.equal(cancelB.success, false);

  // A 可以取消自己的任务
  const cancelA = await cancelTask(USER_A, resA.taskId);
  assert.equal(cancelA.success, true);

  stopScheduler();
  await cleanupFile();
});
