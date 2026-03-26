import { randomUUID } from 'crypto';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { dirname, join, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { TOOLS_NEEDING_SESSION_ID, toolNeedsSessionId } from './toolConstants.js';

// ========== 轻量级任务调度器 ==========
// 支持持久化存储，服务重启后自动恢复待执行任务

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TASKS_FILE = join(__dirname, '../data/scheduled_tasks.json');
const TASKS_FILE = process.env.SCHEDULER_TASKS_FILE
  ? (isAbsolute(process.env.SCHEDULER_TASKS_FILE)
    ? process.env.SCHEDULER_TASKS_FILE
    : join(__dirname, '..', process.env.SCHEDULER_TASKS_FILE))
  : DEFAULT_TASKS_FILE;
const CHECK_INTERVAL = 5000; // 每5秒检查一次待执行任务
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 每1小时清理一次过期任务

// 内存中的任务列表
let scheduledTasks = new Map();
let checkTimer = null;
let cleanupTimer = null;
let isInitialized = false;

/**
 * 深度清理不可序列化的字段（Buffer、Error、正则、函数、Symbol 等），
 * 防止 JSON 序列化失败或 IPC 克隆报错。
 * @param {any} value
 * @returns {any}
 */
function sanitizeResult(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'function' || typeof value === 'symbol') return undefined;

  if (Buffer.isBuffer(value)) {
    // Buffer 转为基础对象（不含实际数据），仅保留元信息
    return { __type: 'Buffer', length: value.length };
  }

  if (value instanceof Error) {
    return { __type: 'Error', message: value.message, stack: value.stack };
  }

  if (value instanceof RegExp) {
    return { __type: 'RegExp', source: value.source, flags: value.flags };
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeResult);
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'function') continue;
      out[k] = sanitizeResult(v);
    }
    return out;
  }

  return value;
}

/**
 * 初始化调度器
 * 从文件恢复待执行任务，启动定时检查
 */
export async function initScheduler() {
  if (isInitialized) return;
  
  try {
    // 确保数据目录存在
    const dataDir = dirname(TASKS_FILE);
    try {
      await access(dataDir);
    } catch {
      await mkdir(dataDir, { recursive: true });
    }
    
    // 从文件加载任务
    await loadTasksFromFile();
    
    // 启动定时检查
    startTaskChecker();
    
    // 启动定时清理
    startCleanupTimer();
    
    isInitialized = true;
    console.log('✅ 任务调度器已初始化');
  } catch (error) {
    console.error('❌ 调度器初始化失败:', error.message);
  }
}

/**
 * 关闭调度器
 */
export function stopScheduler() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  isInitialized = false;
  // 清空内存中的任务（测试时需要）
  scheduledTasks.clear();
  console.log('🛑 任务调度器已停止');
}

/**
 * 创建定时任务（带用户隔离）
 * @param {string} sessionId - 用户会话ID
 * @param {number} delayMinutes - 延迟分钟数
 * @param {string} taskType - 任务类型
 * @param {Object} params - 任务参数
 * @param {string} description - 任务描述
 * @returns {Promise<Object>} - 任务创建结果
 */
export async function scheduleTask(sessionId, delayMinutes, taskType, params, description = '') {
  if (!sessionId && toolNeedsSessionId(taskType)) {
    return { success: false, error: '缺少用户会话ID' };
  }
  
  if (!delayMinutes || delayMinutes <= 0) {
    return { success: false, error: '延迟时间必须大于0分钟' };
  }
  
  if (!taskType) {
    return { success: false, error: '任务类型不能为空' };
  }

  const MAX_TASKS_PER_USER = 20;
  const userPendingCount = () => [...scheduledTasks.values()].filter(
    t => t.sessionId === sessionId && t.status === 'pending'
  ).length;

  if (userPendingCount() >= MAX_TASKS_PER_USER) {
    // 优先清除该用户已完成/失败/取消/过期的任务
    const now = Date.now();
    for (const [id, t] of scheduledTasks) {
      if (t.sessionId !== sessionId) continue;
      const isExpired = t.status === 'pending' && t.executeAt < now;
      if (['completed', 'failed', 'cancelled'].includes(t.status) || isExpired) {
        scheduledTasks.delete(id);
      }
    }
  }

  if (userPendingCount() >= MAX_TASKS_PER_USER) {
    return {
      success: false,
      error: `任务数量已达上限（每用户最多 ${MAX_TASKS_PER_USER} 个待执行任务），请等待现有任务完成或取消后再创建`
    };
  }

  const task = {
    id: randomUUID(),
    sessionId,  // 关联用户
    taskType,
    params,
    description: description || `${taskType} 任务`,
    executeAt: Date.now() + delayMinutes * 60 * 1000,
    createdAt: Date.now(),
    status: 'pending',
  };

  // 存入内存
  scheduledTasks.set(task.id, task);

  // 持久化到文件
  await saveTasksToFile();

  const executeTime = new Date(task.executeAt).toLocaleString('zh-CN');
  console.log(`⏰ 任务已创建 [${task.id}] 用户[${sessionId}]，将在 ${delayMinutes} 分钟后执行 (${executeTime})`);
  
  return {
    success: true,
    taskId: task.id,
    taskType,
    delayMinutes,
    executeAt: task.executeAt,
    executeTimeFormatted: executeTime,
    message: `任务已预约：${description || taskType}`
  };
}

/**
 * 取消任务（带权限验证）
 * @param {string} sessionId - 用户会话ID
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} - 取消结果
 */
export async function cancelTask(sessionId, taskId) {
  if (!sessionId) {
    return { success: false, error: '缺少用户会话ID' };
  }
  
  const task = scheduledTasks.get(taskId);
  
  if (!task) {
    return { success: false, error: '任务不存在或已执行/取消' };
  }
  
  // 权限检查：只能取消自己的任务
  if (task.sessionId !== sessionId) {
    return { success: false, error: '无权操作此任务（不属于当前用户）' };
  }
  
  if (task.status !== 'pending') {
    return { success: false, error: `任务状态为 ${task.status}，无法取消` };
  }
  
  task.status = 'cancelled';
  await saveTasksToFile();
  
  console.log(`🚫 任务已取消 [${taskId}] 用户[${sessionId}]`);
  
  return {
    success: true,
    taskId,
    message: '任务已取消'
  };
}

/**
 * 获取任务列表（带用户隔离）
 * @param {string} sessionId - 用户会话ID
 * @param {string} status - 过滤状态
 * @returns {Array} - 任务列表
 */
export function getTasks(sessionId, status = 'all') {
  if (!sessionId) {
    return [];
  }
  
  // 只返回当前用户的任务
  let tasks = Array.from(scheduledTasks.values()).filter(t => t.sessionId === sessionId);
  
  if (status !== 'all') {
    tasks = tasks.filter(task => task.status === status);
  }
  
  return tasks;
}

/**
 * 获取任务详情（带权限验证）
 * @param {string} sessionId - 用户会话ID
 * @param {string} taskId - 任务ID
 * @returns {Object|null} - 任务详情
 */
export function getTaskById(sessionId, taskId) {
  if (!sessionId || !taskId) return null;
  
  const task = scheduledTasks.get(taskId);
  if (!task || task.sessionId !== sessionId) {
    return null;  // 任务不存在或不属于当前用户
  }
  
  return task;
}

/**
 * 从文件加载任务
 * @param {boolean} skipOverdueExecution - 是否跳过逾期任务的立即执行（测试用）
 */
async function loadTasksFromFile(skipOverdueExecution = false) {
  try {
    const data = await readFile(TASKS_FILE, 'utf-8');
    const tasks = JSON.parse(data, (key, value) => {
      if (value && typeof value === 'object' && value.__type === 'Buffer') {
        return { __type: 'Buffer', length: value.length, _restored: true };
      }
      return value;
    });
    
    // 恢复 pending 和 overdue 的任务
    const now = Date.now();
    let restoredCount = 0;
    
    for (const task of tasks) {
      // 只恢复 pending 状态的任务
      if (task.status === 'pending') {
        // 如果任务已超时，标记为 overdue
        if (task.executeAt <= now) {
          task.status = 'overdue';
        }
        scheduledTasks.set(task.id, task);
        restoredCount++;
      }
    }
    
    console.log(`📂 已恢复 ${restoredCount} 个待执行任务`);
    
    // 如果有逾期任务且未标记跳过，立即执行
    if (!skipOverdueExecution) {
      for (const [id, task] of scheduledTasks) {
        if (task.status === 'overdue') {
          executeTask(task);
        }
      }
    }
    
  } catch (error) {
    // 文件不存在或格式错误，初始化为空
    scheduledTasks.clear();
    console.log('📂 无历史任务，初始化空调度器');
  }
}

/**
 * 保存任务到文件
 */
async function saveTasksToFile() {
  try {
    const tasks = Array.from(scheduledTasks.values());
    await writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ 保存任务失败:', error.message);
  }
}

/**
 * 启动任务检查器
 */
function startTaskChecker() {
  if (checkTimer) return;
  
  checkTimer = setInterval(() => {
    checkAndExecuteTasks();
  }, CHECK_INTERVAL);
  
  // 允许 Node.js 进程在没有其他工作时退出（测试需要）
  checkTimer.unref();
  
  console.log(`🔄 任务检查器已启动（每 ${CHECK_INTERVAL/1000} 秒检查一次）`);
}

/**
 * 启动清理定时器
 */
function startCleanupTimer() {
  if (cleanupTimer) return;
  
  cleanupTimer = setInterval(() => {
    cleanupTasks();
  }, CLEANUP_INTERVAL);
  
  cleanupTimer.unref();
  
  console.log(`🧹 任务清理器已启动（每 ${CLEANUP_INTERVAL/1000/60} 分钟清理一次过期任务）`);
}

/**
 * 检查并执行到期任务
 */
async function checkAndExecuteTasks() {
  const now = Date.now();
  
  for (const [id, task] of scheduledTasks) {
    if (task.status === 'pending' && task.executeAt <= now) {
      await executeTask(task);
    }
  }
}

/**
 * 执行任务
 * @param {Object} task - 任务对象
 */
async function executeTask(task) {
  console.log(`🚀 开始执行任务 [${task.id}] - ${task.taskType}`);
  
  task.status = 'running';
  
  try {
    // 动态导入对应工具
    const { TOOLS } = await import('./index.js');

    // 工具名别名映射（skill 名 → 实际 tool 名）
    const TASK_TYPE_ALIASES = {
      email_sender: 'email_send',
      pdf_sender: 'pdf_write',
    };
    const resolvedTaskType = TASK_TYPE_ALIASES[task.taskType] || task.taskType;

    const toolFunc = TOOLS[resolvedTaskType];

    if (!toolFunc) {
      throw new Error(`未知的任务类型: ${task.taskType}`);
    }

    // 执行任务
    // 使用统一的工具常量判断是否需要 sessionId

    let result;
    if (TOOLS_NEEDING_SESSION_ID.includes(resolvedTaskType)) {
      // 需要 sessionId 的工具：注入为第一个参数
      const paramsWithSession = { sessionId: task.sessionId, ...task.params };
      result = await toolFunc(...Object.values(paramsWithSession));
    } else {
      // 不需要 sessionId 的工具：直接使用原始参数
      result = await toolFunc(...Object.values(task.params));
    }

    if (result && typeof result === 'object' && result.success === false) {
      throw new Error(result.error || `${task.taskType} 执行失败`);
    }
    
    // 记录执行结果（清理不可序列化字段，避免 JSON 序列化失败和 IPC 克隆报错）
    task.status = 'completed';
    task.executedAt = Date.now();
    task.result = sanitizeResult(result);
    
    console.log(`✅ 任务执行成功 [${task.id}]`);
  } catch (error) {
    task.status = 'failed';
    task.executedAt = Date.now();
    task.error = error.message;
    
    console.error(`❌ 任务执行失败 [${task.id}]:`, error.message);
  }
  
  // 保存状态
  await saveTasksToFile();
}

/**
 * 清理已完成/失败/取消的任务（保留最近7天的）
 */
export async function cleanupTasks() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let cleanedCount = 0;
  
  for (const [id, task] of scheduledTasks) {
    if (task.status !== 'pending' && task.executedAt && task.executedAt < sevenDaysAgo) {
      scheduledTasks.delete(id);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    await saveTasksToFile();
    console.log(`🧹 已清理 ${cleanedCount} 个过期任务`);
  }
  
  return { cleanedCount };
}
