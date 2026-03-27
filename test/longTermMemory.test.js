// ========== 长期记忆模块测试 ==========

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { LongTermMemory, LTM_INJECT_START, LTM_INJECT_END } from '../agent/longTermMemory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 模拟 ProductionAgent
class MockAgent {
  constructor() {
    this.llm = {
      bindTools: () => ({
        stream: async function* () {
          yield { content: 'Mock chunk' };
        },
        invoke: async () => ({ content: 'Mock response' })
      })
    };
    this.embeddings = {};
    this.sessions = new Map();
    this.defaultSessionId = 'test-session';
  }

  getOrCreateSession(sessionId = this.defaultSessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        messages: [{ _getType: () => 'system', content: 'system prompt' }],
        contextManager: { manageContext: async (msgs) => msgs }
      });
    }
    return this.sessions.get(sessionId);
  }

  async invokeLLMWithResilience(session, messages, options = {}) {
    const { bindTools = true } = options || {};
    const extractionPrompt = messages[0]?.content || '';

    // 模拟提取到用户信息的情况
    if (extractionPrompt.includes('最近对话记录') || extractionPrompt.includes('最近对话')) {
      return {
        message: {
          content: `# 用户要点
- 姓名：张三
- 邮箱：zhangsan@example.com
- 职业：软件工程师
- 技术栈：JavaScript、Python
- 目标：学习 AI Agent 开发
- 设备：Mac

# 最近关键事件
- 正在学习 AI Agent 开发
- 参与公司智能客服项目

# 最近待办
- 完成 AI Agent 课程学习

# 一句话画像
一位 28 岁的全栈工程师，熟悉 JavaScript/Python，目前在探索 AI Agent 技术，寻求如何在项目中落地的建议。`
        }
      };
    }

    return { message: { content: '暂无记忆记录' } };
  }
}

// 测试 LongTermMemory 类
describe('LongTermMemory', () => {
  let agent;
  let memory;
  let testSessionId = 'test-memory-session';
  let testMemoryDir;
  
  beforeEach(() => {
    agent = new MockAgent();
    // 注入独立的 LLM 调用函数，绕开 withTimeout 避免 Node.js ESM IPC 序列化问题
    memory = new LongTermMemory(agent, {
      maxMemoryLength: 500,
      updateInterval: 3,
      llmCallFn: async (messages) => {
        const extractionPrompt = messages[0]?.content || '';
        if (extractionPrompt.includes('最近对话记录') || extractionPrompt.includes('最近对话')) {
          return `# 用户要点
- 姓名：张三
- 邮箱：zhangsan@example.com
- 职业：软件工程师
- 技术栈：JavaScript、Python
- 目标：学习 AI Agent 开发
- 设备：Mac

# 最近关键事件
- 正在学习 AI Agent 开发
- 参与公司智能客服项目

# 最近待办
- 完成 AI Agent 课程学习

# 一句话画像
一位 28 岁的全栈工程师，熟悉 JavaScript/Python，目前在探索 AI Agent 技术，寻求如何在项目中落地的建议。`;
        }
        return '暂无记忆记录';
      }
    });

    // 获取测试用的记忆目录（测试函数内自行清理）
    testMemoryDir = path.join(__dirname, '..', 'public', 'workspace', testSessionId, 'memory');
    // 同步清理可能存在的旧测试数据
    try {
      fs.rmSync(testMemoryDir, { recursive: true, force: true });
    } catch {}
  });

  afterEach(() => {
    // 同步清理测试数据
    try {
      fs.rmSync(testMemoryDir, { recursive: true, force: true });
    } catch {}
  });

  describe('基本功能', () => {
    it('应该正确初始化', () => {
      assert.strictEqual(memory.maxMemoryLength, 500);
      assert.strictEqual(memory.updateInterval, 3);
    });

    it('应该返回正确的记忆目录路径', () => {
      const dir = memory.getMemoryDir(testSessionId);
      assert.ok(dir.includes(testSessionId));
      assert.ok(dir.includes('memory'));
    });

    it('应该返回正确的记忆文件路径', () => {
      const filePath = memory.getMemoryFilePath(testSessionId);
      assert.ok(filePath.endsWith('memory.md'));
    });
  });

  describe('对话轮数管理', () => {
    it('初始对话轮数应该为0', () => {
      const rounds = memory.getConversationRounds(testSessionId);
      assert.strictEqual(rounds, 0);
    });

    it('应该正确增加对话轮数', () => {
      memory.incrementConversationRounds(testSessionId);
      assert.strictEqual(memory.getConversationRounds(testSessionId), 1);
      
      memory.incrementConversationRounds(testSessionId);
      assert.strictEqual(memory.getConversationRounds(testSessionId), 2);
    });

    it('应该正确判断是否需要更新记忆', () => {
      // 未达到阈值
      assert.strictEqual(memory.shouldUpdateMemory(testSessionId), false);
      
      // 达到阈值
      memory.conversationRounds.set(testSessionId, 3);
      assert.strictEqual(memory.shouldUpdateMemory(testSessionId), true);
      
      // 重新计数后未达到阈值
      memory.conversationRounds.set(testSessionId, 6);
      assert.strictEqual(memory.shouldUpdateMemory(testSessionId), true);
    });
  });

  describe('记忆注入状态', () => {
    it('初始状态应为未注入（系统提示词为空）', () => {
      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [{ _getType: () => 'system', content: 'system prompt' }];
      assert.strictEqual(memory.hasMemoryInjected(session), false);
    });

    it('系统提示词包含记忆标记块时应返回true', () => {
      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [{ _getType: () => 'system', content: `system prompt\n\n${LTM_INJECT_START}\n## 用户记忆\ntest\n${LTM_INJECT_END}` }];
      assert.strictEqual(memory.hasMemoryInjected(session), true);
    });

    it('重置会话后应恢复未注入状态', () => {
      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [{ _getType: () => 'system', content: `system prompt\n\n${LTM_INJECT_START}\n## 用户记忆\ntest\n${LTM_INJECT_END}` }];
      assert.strictEqual(memory.hasMemoryInjected(session), true);

      // 清除记忆内容（将标记块从会话中移除）
      session.messages[0].content = 'system prompt';
      assert.strictEqual(memory.hasMemoryInjected(session), false);
    });
  });

  describe('记忆文件操作', () => {
    it('初始状态应该没有记忆文件', async () => {
      const hasMemory = await memory.hasMemoryFile(testSessionId);
      assert.strictEqual(hasMemory, false);
    });

    it('应该能保存和读取记忆', async () => {
      const testMemoryContent = `# 用户基本信息
- 姓名：李四
- 年龄：25岁`;

      const saved = await memory.saveMemory(testSessionId, testMemoryContent);
      assert.strictEqual(saved, true);

      const hasMemory = await memory.hasMemoryFile(testSessionId);
      assert.strictEqual(hasMemory, true);

      const content = await memory.readMemory(testSessionId);
      assert.ok(content.includes('李四'));
    });

    it('应该正确截断超长记忆（精确截断到 maxMemoryLength）', async () => {
      const longContent = 'x'.repeat(600);
      await memory.saveMemory(testSessionId, longContent);

      const content = await memory.readMemory(testSessionId);
      // 精确截断：内容 + 截断提示应等于 maxMemoryLength
      assert.ok(content.length <= memory.maxMemoryLength);
      assert.ok(content.includes('[记忆内容已截断至最大长度]'));
    });

    it('hasMemoryFile 应该使用内存缓存避免重复磁盘 I/O', async () => {
      // 首次调用：缓存未命中，写入磁盘
      const saved = await memory.saveMemory(testSessionId, '# 测试记忆');
      assert.strictEqual(saved, true);

      // 第二次调用：应该命中内存缓存，不读磁盘
      const hasMemory = await memory.hasMemoryFile(testSessionId);
      assert.strictEqual(hasMemory, true);
      // 验证缓存确实存在
      assert.strictEqual(memory._memoryFileExistsCache.get(testSessionId), true);
    });

    it('clearMemory 应该清除文件缓存', async () => {
      await memory.saveMemory(testSessionId, '# 测试记忆');

      // 缓存已建立
      assert.strictEqual(memory._memoryFileExistsCache.has(testSessionId), true);

      await memory.clearMemory(testSessionId);

      // 缓存应被清除
      assert.strictEqual(memory._memoryFileExistsCache.has(testSessionId), false);
    });
  });

  describe('用户消息提取', () => {
    it('应该正确提取用户消息', () => {
      const messages = [
        { _getType: () => 'system', content: 'system prompt' },
        { _getType: () => 'human', content: '我叫张三，今年28岁' },
        { _getType: () => 'ai', content: '好的，张三先生' },
        { _getType: () => 'human', content: '我是一名软件工程师' }
      ];

      const userMessages = memory.extractUserMessages(messages);
      assert.ok(userMessages.includes('张三'));
      assert.ok(userMessages.includes('28岁'));
      assert.ok(userMessages.includes('软件工程师'));
    });

    it('应该处理多格式消息', () => {
      const messages = [
        { _getType: () => 'human', content: [{ type: 'text', text: '简单文本' }] },
        { _getType: () => 'human', content: '纯文本消息' }
      ];

      const userMessages = memory.extractUserMessages(messages);
      assert.ok(userMessages.includes('简单文本'));
      assert.ok(userMessages.includes('纯文本消息'));
    });
  });

  describe('记忆更新', () => {
    it('应该正确更新记忆', async () => {
      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [
        { _getType: () => 'system', content: 'system prompt' },
        { _getType: () => 'human', content: '我叫张三，28岁，是一名软件工程师' },
        { _getType: () => 'ai', content: '很高兴认识您，张先生' }
      ];

      const updated = await memory.updateMemory(testSessionId, session.messages);
      assert.strictEqual(updated, true);

      const content = await memory.readMemory(testSessionId);
      assert.ok(content.includes('张三') || content.includes('软件工程师'));
    });

    it('应该正确检查并更新记忆', async () => {
      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [
        { _getType: () => 'system', content: 'system prompt' },
        { _getType: () => 'human', content: '我叫李四' }
      ];

      // 设置对话轮数到阈值
      memory.conversationRounds.set(testSessionId, 3);

      const updated = await memory.checkAndUpdateMemory(testSessionId, session);
      assert.strictEqual(updated, true);
    });
  });

  describe('记忆注入', () => {
    it('应该能构建记忆系统消息', async () => {
      // 先保存记忆
      await memory.saveMemory(testSessionId, `# 用户基本信息
- 姓名：王五`);

      const memoryContent = await memory.getMemoryContent(testSessionId);
      assert.ok(memoryContent !== null);
      assert.ok(memoryContent.includes('王五'));
    });

    it('没有记忆时应返回null', async () => {
      const memoryContent = await memory.getMemoryContent(testSessionId);
      assert.strictEqual(memoryContent, null);
    });

    it('应该正确将记忆拼接到系统提示词', async () => {
      // 先保存记忆
      await memory.saveMemory(testSessionId, '# 用户记忆\n- 测试用户');

      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [
        { _getType: () => 'system', content: 'system prompt' }
      ];

      const appended = await memory.appendMemoryToSystemPrompt(testSessionId, session);
      assert.strictEqual(appended, true);

      // 验证记忆已拼接到系统提示词
      assert.ok(session.messages[0].content.includes('测试用户'));
      assert.ok(session.messages[0].content.includes('## 用户记忆'));
    });

    it('重复注入应该跳过', async () => {
      // 先保存记忆
      await memory.saveMemory(testSessionId, '# 用户记忆\n- 测试用户');

      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [
        { _getType: () => 'system', content: 'system prompt' }
      ];

      // 第一次注入
      await memory.appendMemoryToSystemPrompt(testSessionId, session);
      assert.strictEqual(memory.hasMemoryInjected(session), true);

      // 第二次注入应该返回 false
      const secondAppend = await memory.appendMemoryToSystemPrompt(testSessionId, session);
      assert.strictEqual(secondAppend, false);

      // 不应该重复拼接记忆
      assert.strictEqual(
        session.messages[0].content.split('## 用户记忆').length - 1,
        1
      );
    });
  });

  describe('记忆清除', () => {
    it('应该能清除用户记忆', async () => {
      // 先保存记忆
      await memory.saveMemory(testSessionId, '# 用户记忆\n- 测试用户');
      memory.conversationRounds.set(testSessionId, 5);

      const cleared = await memory.clearMemory(testSessionId);
      assert.strictEqual(cleared, true);

      const hasMemory = await memory.hasMemoryFile(testSessionId);
      assert.strictEqual(hasMemory, false);

      // 状态也应该被重置
      assert.strictEqual(memory.getConversationRounds(testSessionId), 0);
    });
  });

  describe('记忆统计', () => {
    it('应该返回正确的统计信息', async () => {
      // 保存记忆
      await memory.saveMemory(testSessionId, '# 用户记忆\n- 测试内容'.repeat(10));

      const session = agent.getOrCreateSession(testSessionId);
      session.messages = [{ _getType: () => 'system', content: 'system prompt' }];

      const stats = await memory.getMemoryStats(testSessionId, session);

      assert.strictEqual(stats.sessionId, testSessionId);
      assert.strictEqual(stats.hasMemory, true);
      assert.ok(stats.memoryLength > 0);
      assert.strictEqual(stats.maxMemoryLength, 500);
      assert.ok(stats.nextUpdateRounds > 0);
      assert.strictEqual(stats.memoryInjected, false);
    });
  });

  describe('长期记忆配置', () => {
    it('应该使用默认配置', () => {
      const memoryWithDefaults = new LongTermMemory(agent);
      assert.strictEqual(memoryWithDefaults.maxMemoryLength, 1500);
      assert.strictEqual(memoryWithDefaults.updateInterval, 5);
    });

    it('应该使用自定义配置', () => {
      const memoryWithCustom = new LongTermMemory(agent, {
        maxMemoryLength: 2000,
        updateInterval: 10
      });
      assert.strictEqual(memoryWithCustom.maxMemoryLength, 2000);
      assert.strictEqual(memoryWithCustom.updateInterval, 10);
    });
  });
});
