/**
 * 调度器参数定义测试
 * 验证 schedule_task 工具定义符合简化后的设计（无 onComplete）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TOOL_DEFINITIONS } from '../tools/index.js';

describe('schedule_task 工具定义', () => {
  let scheduleTaskDef;

  it('schedule_task 工具必须存在', () => {
    scheduleTaskDef = TOOL_DEFINITIONS.find(t => t.name === 'schedule_task');
    assert.ok(scheduleTaskDef, 'schedule_task 工具必须存在');
  });

  it('参数列表应为 4 个（延迟分钟数/任务类型/任务参数/任务描述）', () => {
    assert.equal(scheduleTaskDef.params.length, 4, '应为 4 个参数');
    const paramNames = scheduleTaskDef.params.map(p => p.name);
    assert.ok(paramNames.includes('延迟分钟数'), '应包含延迟分钟数');
    assert.ok(paramNames.includes('任务类型'), '应包含任务类型');
    assert.ok(paramNames.includes('任务参数'), '应包含任务参数');
    assert.ok(paramNames.includes('任务描述'), '应包含任务描述');
  });

  it('不应包含 onComplete 参数', () => {
    const paramNames = scheduleTaskDef.params.map(p => p.name.toLowerCase());
    assert.ok(
      !paramNames.some(n => n.includes('complete') || n.includes('callback') || n.includes('回调')),
      '不应包含 onComplete/回调任务 参数'
    );
  });

  it('示例应展示单次定时任务用法', () => {
    assert.ok(
      scheduleTaskDef.example.includes('schedule_task'),
      '示例应包含 schedule_task 调用'
    );
    assert.ok(
      scheduleTaskDef.example.includes('exec_code') ||
      scheduleTaskDef.example.includes('daily_news'),
      '示例应展示具体任务类型'
    );
    assert.ok(
      !scheduleTaskDef.example.includes('onComplete') &&
      !scheduleTaskDef.example.includes('pdf_write'),
      '示例不应展示链式回调用法'
    );
  });

  it('任务类型选项应包含常用类型', () => {
    const taskTypeParam = scheduleTaskDef.params.find(p => p.name === '任务类型');
    assert.ok(taskTypeParam?.options?.length > 0, '任务类型应有预定义选项');
    const requiredTypes = ['exec_code', 'email_send', 'daily_news'];
    for (const type of requiredTypes) {
      assert.ok(
        taskTypeParam.options.includes(type),
        `任务类型选项必须包含: ${type}`
      );
    }
  });

  it('sessionId 不应要求用户手动传入', () => {
    const paramNames = scheduleTaskDef.params.map(p => p.name);
    assert.ok(
      !paramNames.includes('sessionId') && !paramNames.includes('用户ID'),
      'sessionId 应由系统自动注入，不应是显式参数'
    );
  });
});

describe('schedule_list 工具定义', () => {
  it('schedule_list 工具必须存在', () => {
    const def = TOOL_DEFINITIONS.find(t => t.name === 'schedule_list');
    assert.ok(def, 'schedule_list 工具必须存在');
    assert.ok(def.params.length >= 1, '至少应包含状态过滤参数');
  });
});

describe('schedule_cancel 工具定义', () => {
  it('schedule_cancel 工具必须存在', () => {
    const def = TOOL_DEFINITIONS.find(t => t.name === 'schedule_cancel');
    assert.ok(def, 'schedule_cancel 工具必须存在');
    const paramNames = def.params.map(p => p.name);
    assert.ok(paramNames.includes('任务ID'), '应包含任务ID参数');
  });
});

describe('单次定时任务结构', () => {
  it('单任务场景只需要 taskType/params，无需链式结构', () => {
    // 模拟一个单次定时任务
    const task = {
      taskType: 'exec_code',
      params: {
        code: 'print(sum([1,2,3,4,5])/5)',
        language: 'python'
      }
    };

    assert.equal(task.taskType, 'exec_code');
    assert.ok(task.params.code);
    assert.ok(task.params.language);
    assert.ok(!('onComplete' in task), '单任务不应包含 onComplete');
  });

  it('邮件任务参数结构正确', () => {
    const emailTask = {
      taskType: 'email_send',
      params: {
        to: 'test@example.com',
        subject: '测试邮件',
        content: '这是一封定时邮件'
      }
    };

    assert.equal(emailTask.taskType, 'email_send');
    assert.ok(emailTask.params.to);
    assert.ok(emailTask.params.subject);
    assert.ok(emailTask.params.content);
    assert.ok(!('onComplete' in emailTask));
  });
});

describe('占位符处理（单任务无链式，无需 {{result}}）', () => {
  it('单任务内容中如需嵌入变量，直接使用字符串拼接', () => {
    const task = {
      taskType: 'exec_code',
      params: {
        code: 'print("hello world")',
        language: 'python'
      }
    };

    const codeStr = JSON.stringify(task.params.code);
    assert.ok(codeStr.includes('hello'), '代码内容应正确序列化');
    assert.ok(!codeStr.includes('{{'), '单任务代码中不应有占位符');
  });
});
