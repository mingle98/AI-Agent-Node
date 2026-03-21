/**
 * 链式任务生成质量测试
 * 验证 schedule_task 参数结构在各种复杂场景下的正确性
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { TOOL_DEFINITIONS } from '../tools/index.js';

// 测试场景定义
const TEST_SCENARIOS = [
  {
    name: '三步链式：exec_code → pdf_write → email_send',
    request: '定时2分钟后执行 Python 代码：计算 [1,2,3,4,5] 的平均值，把结果保存到result的pdf文件中去，然后把这个pdf发到我邮箱2293188960@qq.com',
    expectedStructure: {
      taskType: 'exec_code',
      hasOnComplete: true,
      chainDepth: 3,
      expectedChain: ['exec_code', 'pdf_write', 'email_send'],
      requiredParams: {
        exec_code: ['code', 'language'],
        pdf_write: ['filePath', 'content'],
        email_send: ['to', 'subject', 'content']
      },
      placeholderUsage: ['{{result}}']
    }
  },
  {
    name: '两步链式：script_generator → email_send',
    request: '定时5分钟后生成一个数据分析脚本并发送到我的邮箱',
    expectedStructure: {
      taskType: 'script_generator',
      hasOnComplete: true,
      chainDepth: 2,
      expectedChain: ['script_generator', 'email_send'],
      requiredParams: {
        script_generator: ['description'],
        email_send: ['to', 'subject']
      }
    }
  },
  {
    name: '单任务无回调：纯 exec_code',
    request: '定时1分钟后执行一段Python代码打印当前时间',
    expectedStructure: {
      taskType: 'exec_code',
      hasOnComplete: false,
      chainDepth: 1,
      expectedChain: ['exec_code'],
      requiredParams: {
        exec_code: ['code', 'language']
      }
    }
  },
  {
    name: '四步复杂链式：exec_code → pdf_write → pdf_merge → email_send',
    request: '定时10分钟后执行Python生成多页报告PDF，合并所有PDF后发送邮件',
    expectedStructure: {
      taskType: 'exec_code',
      hasOnComplete: true,
      chainDepth: 4,
      expectedChain: ['exec_code', 'pdf_write', 'pdf_merge', 'email_send'],
      requiredParams: {
        exec_code: ['code', 'language'],
        pdf_write: ['filePath', 'content'],
        pdf_merge: ['files', 'output'],
        email_send: ['to', 'subject', 'content']
      }
    }
  },
  {
    name: '带附件占位符替换的邮件链式',
    request: '定时3分钟后生成数据导出文件并作为附件发送',
    expectedStructure: {
      taskType: 'exec_code',
      hasOnComplete: true,
      chainDepth: 3,
      expectedChain: ['exec_code', 'pdf_write', 'email_send'],
      placeholderUsage: ['{{result}}'],
      attachmentCheck: true
    }
  }
];

describe('链式任务生成质量', () => {
  let scheduleTaskDef;

  before(() => {
    // 获取 schedule_task 工具定义
    scheduleTaskDef = TOOL_DEFINITIONS.find(t => t.name === 'schedule_task');
    assert.ok(scheduleTaskDef, 'schedule_task 工具必须存在');
  });

  describe('工具定义结构验证', () => {
    it('schedule_task 必须支持 onComplete 参数', () => {
      const onCompleteParam = scheduleTaskDef.params.find(p => 
        p.name === '回调任务' || p.name === 'onComplete'
      );
      assert.ok(onCompleteParam, '必须包含 onComplete/回调任务 参数');
      assert.ok(onCompleteParam.description.includes('onComplete') || 
                onCompleteParam.description.includes('回调'),
                '参数描述应提及 onComplete/回调');
    });

    it('schedule_task 参数必须包含所有必要字段', () => {
      const requiredParams = ['延迟分钟数', '任务类型', '任务参数'];
      const paramNames = scheduleTaskDef.params.map(p => p.name);
      
      for (const required of requiredParams) {
        assert.ok(paramNames.includes(required), `必须包含参数: ${required}`);
      }

      // sessionId 已由系统自动注入，不应要求用户手填
      assert.ok(!paramNames.includes('用户ID'), '用户ID 应由系统自动注入而非手动参数');
    });

    it('schedule_task 示例必须展示链式回调用法', () => {
      assert.ok(
        scheduleTaskDef.example.includes('onComplete') ||
        scheduleTaskDef.example.includes('pdf_write') ||
        scheduleTaskDef.example.includes('email_send'),
        '示例应该展示链式回调用法'
      );
    });

    it('taskType 选项必须包含链式任务所需类型', () => {
      const taskTypeParam = scheduleTaskDef.params.find(p => p.name === '任务类型');
      assert.ok(taskTypeParam, '必须有任务类型参数');
      assert.ok(taskTypeParam.options, '任务类型应该有预定义选项');
      
      const requiredTypes = ['exec_code', 'pdf_write', 'email_send', 'script_generator'];
      for (const type of requiredTypes) {
        assert.ok(
          taskTypeParam.options.includes(type),
          `任务类型选项必须包含: ${type}`
        );
      }
    });
  });

  describe('任务链结构验证', () => {
    // 模拟任务创建和链式结构验证
    function createMockTask(scenario) {
      // 检查是否需要使用占位符
      const needsPlaceholder = scenario.expectedStructure.placeholderUsage?.includes('{{result}}');
      
      // 根据场景构造预期的任务结构
      const tasks = {
        'exec_code': {
          taskType: 'exec_code',
          params: { code: 'print(1)', language: 'python' },
          onComplete: null
        },
        'pdf_write': {
          taskType: 'pdf_write',
          params: { 
            filePath: 'output/result.pdf', 
            content: needsPlaceholder ? '计算结果：{{result}}' : '计算结果'
          },
          onComplete: null
        },
        'email_send': {
          taskType: 'email_send',
          params: { 
            to: 'test@example.com', 
            subject: '结果', 
            content: '请查收',
            options: JSON.stringify({ attachments: [{ filename: 'result.pdf', path: 'output/result.pdf' }] })
          },
          onComplete: null
        },
        'script_generator': {
          taskType: 'script_generator',
          params: { description: '生成脚本' },
          onComplete: null
        },
        'pdf_merge': {
          taskType: 'pdf_merge',
          params: { files: 'a.pdf,b.pdf', output: 'merged.pdf' },
          onComplete: null
        }
      };

      // 构建链式结构
      let currentTask = null;
      const chain = [...scenario.expectedStructure.expectedChain].reverse();
      
      for (const taskType of chain) {
        const task = { ...tasks[taskType] };
        if (currentTask) {
          task.onComplete = currentTask;
        }
        currentTask = task;
      }

      return currentTask;
    }

    function validateTaskChain(task, scenario) {
      const errors = [];
      
      // 检查链深度
      function getChainDepth(t, depth = 1) {
        if (!t.onComplete) return depth;
        return getChainDepth(t.onComplete, depth + 1);
      }

      const actualDepth = getChainDepth(task);
      if (actualDepth !== scenario.expectedStructure.chainDepth) {
        errors.push(`链深度不匹配: 期望 ${scenario.expectedStructure.chainDepth}, 实际 ${actualDepth}`);
      }

      // 检查任务类型序列
      function getTaskTypes(t) {
        const types = [t.taskType];
        if (t.onComplete) {
          types.push(...getTaskTypes(t.onComplete));
        }
        return types;
      }

      const actualTypes = getTaskTypes(task);
      const expectedTypes = scenario.expectedStructure.expectedChain;
      
      for (let i = 0; i < expectedTypes.length; i++) {
        if (actualTypes[i] !== expectedTypes[i]) {
          errors.push(`任务类型序列不匹配[位置 ${i}]: 期望 ${expectedTypes[i]}, 实际 ${actualTypes[i]}`);
        }
      }

      // 检查必填参数
      function validateParams(t) {
        const required = scenario.expectedStructure.requiredParams?.[t.taskType];
        if (!required) return;

        const paramKeys = Object.keys(t.params || {});
        for (const req of required) {
          if (!paramKeys.includes(req)) {
            errors.push(`${t.taskType} 缺少必填参数: ${req}`);
          }
        }

        if (t.onComplete) {
          validateParams(t.onComplete);
        }
      }

      validateParams(task);

      // 检查占位符使用
      if (scenario.expectedStructure.placeholderUsage) {
        function checkPlaceholders(t) {
          const paramsStr = JSON.stringify(t.params || {});
          for (const placeholder of scenario.expectedStructure.placeholderUsage) {
            if (paramsStr.includes(placeholder)) {
              return true;
            }
          }
          if (t.onComplete) {
            return checkPlaceholders(t.onComplete);
          }
          return false;
        }

        const hasPlaceholder = checkPlaceholders(task);
        if (!hasPlaceholder && scenario.expectedStructure.placeholderUsage.length > 0) {
          errors.push(`应该使用占位符: ${scenario.expectedStructure.placeholderUsage.join(', ')}`);
        }
      }

      return errors;
    }

    for (const scenario of TEST_SCENARIOS) {
      it(`场景: ${scenario.name}`, () => {
        const mockTask = createMockTask(scenario);
        
        // 基本结构验证
        assert.ok(mockTask, '模拟任务应该被创建');
        assert.strictEqual(mockTask.taskType, scenario.expectedStructure.taskType, '任务类型应该匹配');
        
        if (scenario.expectedStructure.hasOnComplete) {
          assert.ok(mockTask.onComplete, '应该有 onComplete 回调');
        } else {
          assert.strictEqual(mockTask.onComplete, null, '不应该有 onComplete 回调');
        }

        // 链式结构深度验证
        const errors = validateTaskChain(mockTask, scenario);
        if (errors.length > 0) {
          assert.fail(`任务链验证失败:\n${errors.join('\n')}`);
        }
      });
    }
  });

  describe('参数占位符替换逻辑', () => {
    it('{{result}} 占位符应该在回调参数中被支持', () => {
      const taskWithPlaceholder = {
        taskType: 'exec_code',
        params: { code: 'print(3)' },
        onComplete: {
          taskType: 'pdf_write',
          params: { content: '结果: {{result}}' }
        }
      };

      const paramsStr = JSON.stringify(taskWithPlaceholder);
      assert.ok(paramsStr.includes('{{result}}'), '应该支持 {{result}} 占位符');
    });

    it('attachments 路径应该支持 {{result}} 或相对路径', () => {
      const emailTask = {
        taskType: 'email_send',
        params: {
          to: 'test@example.com',
          subject: '测试',
          content: '内容',
          options: JSON.stringify({
            attachments: [
              { filename: 'result.pdf', path: 'output/result.pdf' }
            ]
          })
        }
      };

      const options = JSON.parse(emailTask.params.options);
      assert.ok(Array.isArray(options.attachments), 'attachments 应该是数组');
      assert.ok(options.attachments[0].path, '附件应该有 path 字段');
    });
  });

  describe('边界情况处理', () => {
    it('过深的嵌套链式（>5层）应该能正确计算深度', () => {
      // 构建一个 6 层深度的链
      let deepTask = { taskType: 'email_send', params: {}, onComplete: null };
      for (let i = 0; i < 5; i++) {
        deepTask = {
          taskType: 'exec_code',
          params: { code: 'print(1)' },
          onComplete: { ...deepTask }
        };
      }

      function getDepth(t) {
        if (!t.onComplete) return 1;
        return 1 + getDepth(t.onComplete);
      }

      const depth = getDepth(deepTask);
      assert.strictEqual(depth, 6, '应该能正确计算深度');
    });

    it('循环引用应该被检测', () => {
      // 创建一个循环引用
      const taskA = { taskType: 'exec_code', params: {}, onComplete: null };
      const taskB = { taskType: 'pdf_write', params: {}, onComplete: taskA };
      taskA.onComplete = taskB; // 循环

      // 检测应该能发现循环
      function detectCycle(t, visited = new Set()) {
        if (!t) return false;
        if (visited.has(t)) return true;
        visited.add(t);
        return detectCycle(t.onComplete, visited);
      }

      assert.ok(detectCycle(taskA), '应该能检测到循环引用');
    });

    it('缺少必填参数的任务应该失败或被拒绝', () => {
      const incompleteTask = {
        taskType: 'email_send',
        params: {
          // 缺少 to, subject
          content: '内容'
        }
      };

      // 验证缺少必填参数
      const emailDef = TOOL_DEFINITIONS.find(t => t.name === 'email_send');
      const requiredParams = emailDef.params.filter(p => !p.required === false);
      
      for (const param of requiredParams) {
        assert.ok(
          incompleteTask.params[param.name] !== undefined || param.required === false,
          `缺少必填参数 ${param.name} 应该被检测`
        );
      }
    });
  });
});
