import assert from "node:assert/strict";
import test from "node:test";
import { access, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_FILE = join(__dirname, '../data/scheduled_tasks.scheduler.test.json');

// 测试用户
const USER_A = "user_a_session";
const USER_B = "user_b_session";

// 动态导入调度器（避免初始化时自动启动）
async function loadScheduler() {
  process.env.SCHEDULER_TASKS_FILE = TASKS_FILE;
  const scheduler = await import(`../tools/scheduler.js?test=${Date.now()}-${Math.random()}`);
  return scheduler;
}

// 清理测试文件
async function cleanupFile() {
  try {
    await access(TASKS_FILE);
    await unlink(TASKS_FILE);
  } catch {
    // 忽略文件不存在错误
  }
}

test("scheduleTask - 为用户创建定时任务", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  const result = await scheduleTask(USER_A, 5, "email_send", { to: "test@example.com" }, "测试邮件");
  
  assert.equal(result.success, true);
  assert.ok(result.taskId);
  assert.equal(result.taskType, "email_send");
  
  stopScheduler();
  await cleanupFile();
});

test("scheduleTask - 缺少 sessionId 应失败", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  const result = await scheduleTask(null, 5, "email_send", { to: "test@example.com" });
  
  assert.equal(result.success, false);
  assert.ok(result.error.includes("会话ID"));
  
  stopScheduler();
  await cleanupFile();
});

test("scheduleTask - 延迟时间无效应失败", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  const result = await scheduleTask(USER_A, 0, "email_send", { to: "test@example.com" });
  
  assert.equal(result.success, false);
  assert.ok(result.error.includes("延迟时间"));
  
  stopScheduler();
  await cleanupFile();
});

test("scheduleTask - 负延迟时间应失败", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  const result = await scheduleTask(USER_A, -1, "email_send", { to: "test@example.com" });
  
  assert.equal(result.success, false);
  assert.ok(result.error.includes("延迟时间"));
  
  stopScheduler();
  await cleanupFile();
});

test("scheduleTask - 任务类型为空应失败", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  const result = await scheduleTask(USER_A, 5, null, { to: "test@example.com" });
  
  assert.equal(result.success, false);
  assert.ok(result.error.includes("任务类型"));
  
  stopScheduler();
  await cleanupFile();
});

test("scheduleTask - 任务持久化到文件", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  await scheduleTask(USER_A, 10, "exec_code", { code: "console.log(1)" }, "执行代码");
  
  // 验证文件是否存在
  await assert.doesNotReject(async () => {
    await access(TASKS_FILE);
  });
  
  stopScheduler();
  await cleanupFile();
});

test("getTasks - 只返回当前用户的任务", async () => {
  await cleanupFile();
  const { scheduleTask, getTasks, stopScheduler } = await loadScheduler();
  
  await scheduleTask(USER_A, 5, "email_send", {}, "任务A1");
  await scheduleTask(USER_A, 10, "exec_code", {}, "任务A2");
  await scheduleTask(USER_B, 5, "email_send", {}, "任务B1");
  
  const userATasks = getTasks(USER_A, "all");
  const userBTasks = getTasks(USER_B, "all");
  
  assert.equal(userATasks.length, 2);
  assert.equal(userBTasks.length, 1);
  assert.ok(userATasks.every(t => t.sessionId === USER_A));
  assert.equal(userBTasks[0].sessionId, USER_B);
  
  stopScheduler();
  await cleanupFile();
});

test("getTasks - 按状态过滤任务", async () => {
  await cleanupFile();
  const { scheduleTask, getTasks, stopScheduler } = await loadScheduler();
  
  await scheduleTask(USER_A, 5, "email_send", {}, "待执行任务");
  
  const pendingTasks = getTasks(USER_A, "pending");
  assert.ok(pendingTasks.length >= 1);
  assert.ok(pendingTasks.every(t => t.status === "pending"));
  
  stopScheduler();
  await cleanupFile();
});

test("getTasks - 无 sessionId 返回空数组", async () => {
  await cleanupFile();
  const { getTasks, stopScheduler } = await loadScheduler();
  
  const tasks = getTasks(null, "all");
  assert.equal(tasks.length, 0);
  
  stopScheduler();
  await cleanupFile();
});

test("getTaskById - 只能查询自己的任务", async () => {
  await cleanupFile();
  const { scheduleTask, getTaskById, stopScheduler } = await loadScheduler();
  
  const created = await scheduleTask(USER_A, 5, "email_send", {}, "查询测试");
  
  const task = getTaskById(USER_A, created.taskId);
  assert.ok(task);
  assert.equal(task.id, created.taskId);
  
  // 用户B无法查询用户A的任务
  const taskForB = getTaskById(USER_B, created.taskId);
  assert.equal(taskForB, null);
  
  stopScheduler();
  await cleanupFile();
});

test("getTaskById - 不存在任务返回 null", async () => {
  await cleanupFile();
  const { getTaskById, stopScheduler } = await loadScheduler();
  
  const task = getTaskById(USER_A, "non-existent-id");
  assert.equal(task, null);
  
  stopScheduler();
  await cleanupFile();
});

test("cancelTask - 只能取消自己的任务", async () => {
  await cleanupFile();
  const { scheduleTask, cancelTask, stopScheduler } = await loadScheduler();
  
  const created = await scheduleTask(USER_A, 5, "email_send", {}, "可取消任务");
  
  // 用户A可以取消自己的任务
  const cancelled = await cancelTask(USER_A, created.taskId);
  assert.equal(cancelled.success, true);
  
  stopScheduler();
  await cleanupFile();
});

test("cancelTask - 无法取消其他用户的任务", async () => {
  await cleanupFile();
  const { scheduleTask, cancelTask, stopScheduler } = await loadScheduler();
  
  const created = await scheduleTask(USER_A, 5, "email_send", {}, "A的任务");
  
  const result = await cancelTask(USER_B, created.taskId);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("无权操作") || result.error.includes("不属于"));
  
  stopScheduler();
  await cleanupFile();
});

test("cancelTask - 不存在任务应失败", async () => {
  await cleanupFile();
  const { cancelTask, stopScheduler } = await loadScheduler();
  
  const result = await cancelTask(USER_A, "fake-id");
  
  assert.equal(result.success, false);
  assert.ok(result.error.includes("不存在"));
  
  stopScheduler();
  await cleanupFile();
});

test("cancelTask - 重复取消应失败", async () => {
  await cleanupFile();
  const { scheduleTask, cancelTask, stopScheduler } = await loadScheduler();
  
  const created = await scheduleTask(USER_A, 5, "email_send", {}, "重复取消测试");
  await cancelTask(USER_A, created.taskId);
  
  const result = await cancelTask(USER_A, created.taskId);
  assert.equal(result.success, false);
  
  stopScheduler();
  await cleanupFile();
});

test("cancelTask - 缺少 sessionId 应失败", async () => {
  await cleanupFile();
  const { cancelTask, stopScheduler } = await loadScheduler();
  
  const result = await cancelTask(null, "some-id");
  assert.equal(result.success, false);
  assert.ok(result.error.includes("会话ID"));
  
  stopScheduler();
  await cleanupFile();
});

test("用户隔离 - 用户间任务完全隔离", async () => {
  await cleanupFile();
  const { scheduleTask, getTasks, getTaskById, stopScheduler } = await loadScheduler();
  
  // 用户A创建任务
  const a1 = await scheduleTask(USER_A, 5, "email_send", {}, "A的邮件");
  const a2 = await scheduleTask(USER_A, 10, "exec_code", {}, "A的代码");
  
  // 用户B创建任务
  const b1 = await scheduleTask(USER_B, 5, "email_send", {}, "B的邮件");
  
  // 验证查询隔离
  const aTasks = getTasks(USER_A, "all");
  const bTasks = getTasks(USER_B, "all");
  
  assert.equal(aTasks.length, 2);
  assert.equal(bTasks.length, 1);
  
  // 验证getTaskById隔离
  assert.ok(getTaskById(USER_A, a1.taskId));
  assert.ok(getTaskById(USER_A, a2.taskId));
  assert.equal(getTaskById(USER_A, b1.taskId), null);
  
  assert.equal(getTaskById(USER_B, a1.taskId), null);
  assert.equal(getTaskById(USER_B, a2.taskId), null);
  assert.ok(getTaskById(USER_B, b1.taskId));
  
  stopScheduler();
  await cleanupFile();
});

test("scheduleTask - 支持多种任务类型", async () => {
  await cleanupFile();
  const { scheduleTask, getTasks, stopScheduler } = await loadScheduler();
  
  const types = ["email_send", "email_template", "exec_code", "script_generator"];
  
  for (const type of types) {
    const result = await scheduleTask(USER_A, 5, type, { test: true }, `类型: ${type}`);
    assert.equal(result.success, true);
    assert.equal(result.taskType, type);
  }
  
  const tasks = getTasks(USER_A, "all");
  assert.equal(tasks.length, 4);
  
  stopScheduler();
  await cleanupFile();
});
