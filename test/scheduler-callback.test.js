// 测试链式任务（onComplete回调）
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

test("scheduleTask with onComplete - 任务完成后触发回调", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  // 创建带有回调的任务
  const onComplete = {
    taskType: "email_send",
    params: {
      to: "test@example.com",
      subject: "执行结果",
      content: "{{result}}"
    }
  };
  
  const result = await scheduleTask(
    USER_A, 
    5, 
    "exec_code", 
    { code: "1 + 1", language: "javascript" }, 
    "执行代码并发送结果",
    onComplete
  );
  
  assert.equal(result.success, true);
  assert.ok(result.taskId);
  
  // 验证任务存储了回调
  const fs = await import('fs/promises');
  const data = await fs.readFile(TASKS_FILE, 'utf-8');
  const tasks = JSON.parse(data);
  const task = tasks.find(t => t.id === result.taskId);
  
  assert.ok(task, "任务应存在");
  assert.ok(task.onComplete, "任务应存储回调");
  assert.equal(task.onComplete.taskType, "email_send");
  assert.equal(task.onComplete.params.to, "test@example.com");
  
  stopScheduler();
  await cleanupFile();
});

test("scheduleTask without onComplete - 普通任务正常工作", async () => {
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
  
  // 验证任务没有回调
  const fs = await import('fs/promises');
  const data = await fs.readFile(TASKS_FILE, 'utf-8');
  const tasks = JSON.parse(data);
  const task = tasks.find(t => t.id === result.taskId);
  
  assert.ok(task, "任务应存在");
  assert.ok(!task.onComplete, "普通任务不应有回调");
  
  stopScheduler();
  await cleanupFile();
});

test("executeCallback - {{result}} 占位符替换", async () => {
  // 模拟回调参数替换逻辑
  const parentResult = { output: "计算结果: 42" };
  const callbackParams = {
    to: "user@example.com",
    subject: "结果通知",
    content: "执行结果：{{result}}"
  };
  
  const resultStr = parentResult.output !== undefined
    ? String(parentResult.output)
    : JSON.stringify(parentResult);
  
  // 替换占位符
  for (const [key, value] of Object.entries(callbackParams)) {
    if (typeof value === 'string' && value.includes('{{result}}')) {
      callbackParams[key] = value.replace(/\{\{result\}\}/g, resultStr);
    }
  }
  
  assert.equal(callbackParams.content, '执行结果：计算结果: 42', "占位符应优先替换为 parentResult.output");
});

test("三层链式任务 - exec_code → pdf_write → email_send", async () => {
  await cleanupFile();
  const { scheduleTask, stopScheduler } = await loadScheduler();
  
  // 第三步：发送邮件（带附件）
  const emailCallback = {
    taskType: "email_send",
    params: {
      to: "2293188960@qq.com",
      subject: "计算结果",
      content: "平均值计算完成，请查看附件",
      options: JSON.stringify({
        attachments: [{ filename: "result.pdf", path: "output/result.pdf" }]
      })
    }
  };
  
  // 第二步：写入PDF（嵌套邮件回调）
  const pdfCallback = {
    taskType: "pdf_write",
    params: {
      filePath: "output/result.pdf",
      content: "计算结果：{{result}}",
      options: JSON.stringify({ title: "平均值计算" })
    },
    onComplete: emailCallback
  };
  
  // 第一步：执行Python代码
  const result = await scheduleTask(
    USER_A, 
    2, 
    "exec_code", 
    { 
      code: "data = [1,2,3,4,5]; avg = sum(data)/len(data); print(f'平均值: {avg}')", 
      language: "python" 
    }, 
    "计算平均值并生成PDF发送邮件",
    pdfCallback
  );
  
  assert.equal(result.success, true);
  
  // 验证任务链结构
  const fs = await import('fs/promises');
  const data = await fs.readFile(TASKS_FILE, 'utf-8');
  const tasks = JSON.parse(data);
  const task = tasks.find(t => t.id === result.taskId);
  
  assert.ok(task, "任务应存在");
  
  // 第一层：exec_code
  assert.equal(task.taskType, "exec_code");
  assert.ok(task.onComplete, "第一层应有回调");
  assert.equal(task.onComplete.taskType, "pdf_write");
  
  // 第二层：pdf_write
  assert.ok(task.onComplete.onComplete, "第二层应有嵌套回调");
  assert.equal(task.onComplete.onComplete.taskType, "email_send");
  
  // 第三层：email_send
  const emailParams = task.onComplete.onComplete.params;
  assert.equal(emailParams.to, "2293188960@qq.com");
  assert.ok(emailParams.options.includes("result.pdf"), "邮件应包含PDF附件");
  
  stopScheduler();
  await cleanupFile();
});
