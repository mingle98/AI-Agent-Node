// ========== 长期记忆模块 ==========
// 以 sessionId 维度维护用户的关键信息、关键事件和代办记录

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { SystemMessage } from "@langchain/core/messages";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 配置 ==========
const MEMORY_DIR = 'memory';
const MEMORY_FILE = 'memory.md';
const DEFAULT_MAX_MEMORY_LENGTH = 1500;  // 默认最大记忆字数
const DEFAULT_UPDATE_INTERVAL = 5;       // 默认更新间隔（对话轮数）

/** 注入到系统提示词中的记忆块边界，便于更新时整块替换，避免「已注入」锁死旧内容 */
export const LTM_INJECT_START = '<!--LONG_TERM_MEMORY_INJECT_START-->';
export const LTM_INJECT_END = '<!--LONG_TERM_MEMORY_INJECT_END-->';

/** 记忆内容占位符（使用唯一标识避免被记忆内容误替换） */
const LTM_MEMORY_PLACEHOLDER = '__LTM_MEMORY_CONTENT__';

// 记忆提取的系统提示模板（结构灵活，鼓励收录不可枚举的有用事实）
const MEMORY_EXTRACTION_PROMPT = `你是用户记忆提取助手。任务是从对话中提取值得长期记住的客观事实，并以 Markdown 格式输出。

## 核心原则
1. **强制提取**：即使对话很短，也必须从用户消息中提取可识别的客观信息（如职业、公司、技能、年龄、姓名、目标、偏好等）。不要输出"暂无记忆记录"。
2. **只记事实**：只记录用户明确说过的内容，不要推测未提及的信息。
3. **与旧记忆合并**：若提供了旧记忆，在其基础上增删改，保留仍有效的信息、删除已过时的信息、补充新信息。不要照搬旧内容，要整合。
4. **每条简短**：列表项保持一行，便于后续快速更新。
5. **禁止工具**：不要调用任何工具或函数；只输出纯 Markdown 正文。

## 必须提取的信息类别（按优先级）
- **身份**：姓名、年龄、性别、所在城市/国家
- **职业**：职位、公司/学校、技术栈、使用工具
- **目标**：当前正在做的事、近期想完成的事、长期目标
- **偏好**：语言偏好、沟通风格、学习方式、其他习惯
- **联系方式**：邮箱、电话、社交账号（若用户主动提供）

## 输出结构（可灵活增加小节）
\`\`\`markdown
# 用户要点
- [提取到的关键事实列表，保持一行一条]

# 最近关键事件
- [1～4 条近期的、重要的事实]

# 可能感兴趣的话题
- [根据用户最近的对话内容，猜测他可能感兴趣或想了解的方向]

# 一句话画像
[用一句话概括：用户是谁、在做什么、可能需要什么帮助]
\`\`\`

## 输出要求
- 不要前言、不要后记、不要解释提取过程。
- 如果对话中确实没有任何可提取信息（全是客套话），才输出一行：暂无记忆记录
- 不要超出 ${DEFAULT_MAX_MEMORY_LENGTH} 字。`;

export class LongTermMemory {
  constructor(agent, options = {}) {
    this.agent = agent;
    this.maxMemoryLength = options.maxMemoryLength || DEFAULT_MAX_MEMORY_LENGTH;
    this.updateInterval = options.updateInterval || DEFAULT_UPDATE_INTERVAL;
    this.memoryDir = options.memoryDir || MEMORY_DIR;
    this.memoryFile = options.memoryFile || MEMORY_FILE;
    // 允许注入独立的 LLM 调用函数（用于测试绕开 withTimeout 避免 Node.js ESM IPC 问题）
    this._llmCallFn = options.llmCallFn || null;

    // 每个 session 的对话轮数计数
    this.conversationRounds = new Map();

    // 记忆文件存在性内存缓存（避免每次请求都磁盘 I/O）
    this._memoryFileExistsCache = new Map();
  }

  /**
   * 获取用户的记忆目录路径
   */
  getMemoryDir(sessionId) {
    const workspaceRoot = this._getWorkspaceRoot();
    return path.join(workspaceRoot, sessionId, this.memoryDir);
  }

  /**
   * 获取用户的记忆文件路径
   */
  getMemoryFilePath(sessionId) {
    return path.join(this.getMemoryDir(sessionId), this.memoryFile);
  }

  /**
   * 获取 workspace 根目录
   */
  _getWorkspaceRoot() {
    return path.join(__dirname, '..', 'public', 'workspace');
  }

  /**
   * 检查记忆文件是否存在（带内存缓存，避免频繁磁盘 I/O）
   */
  async hasMemoryFile(sessionId) {
    // 命命中缓存直接返回
    if (this._memoryFileExistsCache.has(sessionId)) {
      return this._memoryFileExistsCache.get(sessionId);
    }

    try {
      const filePath = this.getMemoryFilePath(sessionId);
      await fs.access(filePath);
      this._memoryFileExistsCache.set(sessionId, true);
      return true;
    } catch {
      this._memoryFileExistsCache.set(sessionId, false);
      return false;
    }
  }

  /**
   * 读取现有记忆内容
   */
  async readMemory(sessionId) {
    try {
      const filePath = this.getMemoryFilePath(sessionId);
      const content = await fs.readFile(filePath, 'utf-8');
      return content.trim();
    } catch {
      return null;
    }
  }

  /**
   * 保存记忆内容
   */
  async saveMemory(sessionId, content) {
    try {
      const dirPath = this.getMemoryDir(sessionId);
      const filePath = this.getMemoryFilePath(sessionId);
      
      // 确保目录存在
      await fs.mkdir(dirPath, { recursive: true });

      // 截断超长内容，精确控制在 maxMemoryLength 以内
      let finalContent = content;
      if (content.length > this.maxMemoryLength) {
        const truncateMsg = '\n\n[记忆内容已截断至最大长度]';
        const maxContentLen = this.maxMemoryLength - truncateMsg.length;
        finalContent = content.substring(0, maxContentLen) + truncateMsg;
      }
      
      await fs.writeFile(filePath, finalContent, 'utf-8');
      // 保存成功后更新缓存，避免下次 hasMemoryFile 仍读磁盘
      this._memoryFileExistsCache.set(sessionId, true);
      console.log(`💾 [记忆] 已保存 ${sessionId} 的记忆，共 ${finalContent.length} 字符`);
      return true;
    } catch (error) {
      console.error(`❌ [记忆] 保存失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取当前对话轮数
   */
  getConversationRounds(sessionId) {
    return this.conversationRounds.get(sessionId) || 0;
  }

  /**
   * 增加对话轮数
   */
  incrementConversationRounds(sessionId) {
    const current = this.getConversationRounds(sessionId);
    this.conversationRounds.set(sessionId, current + 1);
    return this.getConversationRounds(sessionId);
  }

  /**
   * 检查是否需要更新记忆
   */
  shouldUpdateMemory(sessionId) {
    const rounds = this.getConversationRounds(sessionId);
    // 首次对话时也需要检查（rounds = 1）
    return rounds > 0 && rounds % this.updateInterval === 0;
  }

  /**
   * 检查系统提示词中是否已包含可被替换的用户记忆标记
   * 改用 HTML 注释标记块判断，避免被旧内容锁死
   */
  hasMemoryInjected(session) {
    const firstSystemMessage = session.messages.find(m => m._getType?.() === 'system');
    if (!firstSystemMessage) {
      console.log(`🔍 [记忆] ${session.id} 检查注入状态: 无系统消息`);
      return false;
    }
    const content = typeof firstSystemMessage.content === 'string'
      ? firstSystemMessage.content
      : JSON.stringify(firstSystemMessage.content);
    // 用标记块判断是否已注入（优于字符串包含，后者会被旧内容锁死）
    const hasBlock = content.includes(LTM_INJECT_START) && content.includes(LTM_INJECT_END);
    console.log(`🔍 [记忆] ${session.id} 检查注入状态: ${hasBlock ? '已注入' : '未注入'}`);
    return hasBlock;
  }

  /**
   * 提取对话历史中的用户消息
   */
  extractUserMessages(messages) {
    const userMessages = [];
    for (const msg of messages) {
      const type = msg._getType ? msg._getType() : msg.type;
      if (type === 'human') {
        const content = this._extractTextContent(msg.content);
        if (content) {
          userMessages.push(content);
        }
      }
    }
    return userMessages.join('\n\n');
  }

  /**
   * 提取文本内容（兼容多种格式）
   */
  _extractTextContent(content) {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map(part => (typeof part === 'string' ? part : (part?.text || '')))
        .join('');
    }
    return String(content || '');
  }

  /**
   * 使用 LLM 提取并更新记忆
   */
  async updateMemory(sessionId, messages) {
    console.log(`\n🔍 [记忆] >>> 开始提取 ${sessionId} 的记忆...`);
    
    // 获取用户消息
    const userMessages = this.extractUserMessages(messages);
    const msgCount = messages.filter(m => (m._getType?.() || m.type) === 'human').length;
    
    console.log(`📝 [记忆] ${sessionId} 共 ${msgCount} 条用户消息，待提取 ${userMessages.length} 字符`);
    
    if (!userMessages) {
      console.log(`⚠️  [记忆] ${sessionId} 没有用户消息可提取`);
      return false;
    }

    // 读取现有记忆（如果有）
    const existingMemory = await this.readMemory(sessionId);
    const memoryContext = existingMemory 
      ? `\n\n## 现有记忆（请在此基础上更新，保留仍有用的信息）：\n${existingMemory}`
      : '';

    if (existingMemory) {
      console.log(`📋 [记忆] ${sessionId} 已有记忆 ${existingMemory.length} 字符，将合并更新`);
    }

    // 构建提示
    const prompt = `${MEMORY_EXTRACTION_PROMPT}${memoryContext}

## 最近对话记录：
${userMessages}`;

    console.log(`🤖 [记忆] ${sessionId} 正在调用 LLM 提取记忆...`, prompt);

    // 优先使用注入的 LLM 调用函数（用于测试绕开 withTimeout），否则使用 agent 的独立提取方法
    const llmMessages = [
      new SystemMessage(prompt),
    ];

    let extractedMemory;
    try {
      if (this._llmCallFn) {
        extractedMemory = await this._llmCallFn(llmMessages);
      } else {
        extractedMemory = await this.agent.extractMemoryWithLLM(llmMessages);
      }
      console.log(`📨 [记忆] ${sessionId} LLM 返回 ${extractedMemory.length} 字符`);

      // 检查是否有效记忆
      if (!extractedMemory || extractedMemory.trim() === '暂无记忆记录') {
        // 有用户消息但 LLM 认为无信息：仍然保存空占位符作为记录，避免重复触发
        if (userMessages.length > 10) {
          await this.saveMemory(sessionId, `# 用户记忆\n\n暂无明确信息，请继续对话以建立记忆。`);
        }
        console.log(`⚠️  [记忆] ${sessionId} LLM 未提取到有效信息`);
        console.log(`🔍 [记忆] <<< ${sessionId} 提取结束（无有效信息）\n`);
        return false;
      }

      // 对比新旧记忆是否有实质变化
      const existingTrimmed = (existingMemory || '').trim();
      const newTrimmed = extractedMemory.trim();
      if (existingTrimmed && existingTrimmed === newTrimmed) {
        console.log(`⚡ [记忆] ${sessionId} 新旧记忆无变化，跳过保存`);
        console.log(`🔍 [记忆] <<< ${sessionId} 提取结束（无变化）\n`);
        return false;
      }

      if (existingTrimmed) {
        console.log(`📋 [记忆] ${sessionId} 旧记忆预览: ${existingTrimmed.substring(0, 150).replace(/\n/g, ' ')}...`);
      }

      // 打印提取的记忆预览
      const preview = newTrimmed.substring(0, 200).replace(/\n/g, ' ');
      console.log(`📄 [记忆] ${sessionId} 提取预览: ${preview}...`);

      // 保存新记忆
      const saved = await this.saveMemory(sessionId, extractedMemory);

      if (saved) {
        console.log(`✅ [记忆] <<< ${sessionId} 记忆更新成功`);
      } else {
        console.log(`❌ [记忆] <<< ${sessionId} 记忆保存失败`);
      }

      console.log(`\n${'='.repeat(50)}\n`);
      return saved;
    } catch (error) {
      console.error(`❌ [记忆] ${sessionId} LLM 调用失败: ${error.message}`);
      console.log(`🔍 [记忆] <<< ${sessionId} 提取结束（异常）\n`);
      return false;
    }
  }

  /**
   * 获取记忆注入的提示词片段（用 HTML 注释包裹，便于后续整块替换）
   */
  getMemoryInjectionPrompt(sessionId) {
    return `\n${LTM_INJECT_START}\n## 用户记忆\n以下是关于此用户的已知信息，请结合这些信息提供更个性化、更连贯的服务：\n\n${LTM_MEMORY_PLACEHOLDER}\n\n——记忆内容如有冲突，以用户最新表述为准。\n${LTM_INJECT_END}\n`;
  }

  /**
   * 获取记忆内容
   */
  async getMemoryContent(sessionId) {
    return await this.readMemory(sessionId);
  }

  /**
   * 将记忆注入到会话系统提示词（支持首次注入与刷新替换）
   * @param {string} sessionId - 会话ID
   * @param {Object} session - 会话对象
   * @param {boolean} forceRefresh - 强制刷新，即使已有标记块也替换
   * @returns {boolean} - 是否成功注入
   */
  async appendMemoryToSystemPrompt(sessionId, session, forceRefresh = false) {
    console.log(`🚀 [记忆] >>> 尝试注入记忆到 ${sessionId}${forceRefresh ? '（强制刷新）' : ''}`);

    const firstSystemMessage = session.messages.find(m => m._getType?.() === 'system');
    if (!firstSystemMessage) {
      console.log(`❌ [记忆] ${sessionId} 未找到系统消息`);
      return false;
    }

    // 读取记忆内容
    const memory = await this.getMemoryContent(sessionId);
    if (!memory) {
      console.log(`⚠️  [记忆] ${sessionId} 无记忆内容可注入`);
      return false;
    }

    const originalLength = typeof firstSystemMessage.content === 'string'
      ? firstSystemMessage.content.length
      : JSON.stringify(firstSystemMessage.content).length;

    const hasBlock = this.hasMemoryInjected(session);

    if (hasBlock && !forceRefresh) {
      console.log(`⏭️  [记忆] ${sessionId} 已注入且非强制刷新，跳过`);
      return false;
    }

    // 构建新注入块
    const rawBlock = this.getMemoryInjectionPrompt(sessionId).replace(LTM_MEMORY_PLACEHOLDER, memory);

    let newContent;
    if (hasBlock) {
      // 替换已有标记块
      const startIdx = firstSystemMessage.content.indexOf(LTM_INJECT_START);
      const endIdx = firstSystemMessage.content.indexOf(LTM_INJECT_END) + LTM_INJECT_END.length;
      newContent =
        firstSystemMessage.content.substring(0, startIdx) +
        rawBlock.trim() +
        firstSystemMessage.content.substring(endIdx);
      console.log(`🔄 [记忆] ${sessionId} 刷新已有记忆块`);
    } else {
      // 首次注入，追加到末尾
      newContent = firstSystemMessage.content + rawBlock;
      console.log(`📥 [记忆] ${sessionId} 首次注入记忆`);
    }

    if (typeof firstSystemMessage.content === 'string') {
      firstSystemMessage.content = newContent;
    } else {
      firstSystemMessage.content = newContent;
    }

    const newLength = firstSystemMessage.content.length;
    console.log(`✅ [记忆] <<< ${sessionId} 记忆注入成功 (${originalLength} → ${newLength} 字符)`);
    return true;
  }

  /**
   * 注入记忆到会话（别名方法，保持向后兼容）
   * @param {string} sessionId - 会话ID
   * @param {Object} session - 会话对象
   * @returns {boolean} - 是否成功注入
   */
  async injectMemory(sessionId, session) {
    console.log(`📦 [记忆] injectMemory 调用 → appendMemoryToSystemPrompt`);
    return this.appendMemoryToSystemPrompt(sessionId, session);
  }

  /**
   * 在对话结束后检查是否需要更新记忆
   */
  async checkAndUpdateMemory(sessionId, session) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📋 [记忆] 开始检查 ${sessionId} 的记忆状态`);
    console.log(`${'='.repeat(50)}`);

    // 增加对话轮数
    const rounds = this.incrementConversationRounds(sessionId);
    const hasMemory = await this.hasMemoryFile(sessionId);
    const alreadyInjected = this.hasMemoryInjected(session);

    console.log(`📊 [记忆] ${sessionId} 对话轮数: ${rounds}/${this.updateInterval} (阈值)`);
    console.log(`📁 [记忆] ${sessionId} 记忆文件: ${hasMemory ? '存在' : '不存在'}`);
    console.log(`📌 [记忆] ${sessionId} 已注入: ${alreadyInjected ? '是' : '否'}`);

    // 检查是否需要更新
    if (this.shouldUpdateMemory(sessionId)) {
      console.log(`\n🔄 [记忆] >>> ${sessionId} 达到更新阈值，开始提取记忆...`);
      try {
        const updated = await this.updateMemory(sessionId, session.messages);
        if (updated) {
          // 用新记忆刷新系统提示词中的标记块
          await this.appendMemoryToSystemPrompt(sessionId, session, true);
        }
      } catch (err) {
        console.error(`❌ [记忆] ${sessionId} 更新异常: ${err.message}`);
      }
      console.log(`🔄 [记忆] <<< ${sessionId} 更新流程结束`);
      console.log(`${'='.repeat(50)}\n`);
      return true;
    }

    // 如果没有记忆文件但有足够对话轮数，也尝试提取
    if (!hasMemory && rounds >= this.updateInterval) {
      console.log(`\n🆕 [记忆] >>> ${sessionId} 首次建立记忆...`);
      try {
        await this.updateMemory(sessionId, session.messages);
      } catch (err) {
        console.error(`❌ [记忆] ${sessionId} 首次建立异常: ${err.message}`);
      }
      console.log(`🆕 [记忆] <<< ${sessionId} 首次建立完成`);
      console.log(`${'='.repeat(50)}\n`);
      return true;
    }

    // 如果有记忆文件但未注入，也注入
    if (hasMemory && !alreadyInjected) {
      console.log(`\n📥 [记忆] >>> ${sessionId} 补充注入已有记忆...`);
      try {
        await this.appendMemoryToSystemPrompt(sessionId, session, false);
      } catch (err) {
        console.error(`❌ [记忆] ${sessionId} 补充注入异常: ${err.message}`);
      }
      console.log(`📥 [记忆] <<< ${sessionId} 补充注入完成`);
      console.log(`${'='.repeat(50)}\n`);
      return true;
    }

    console.log(`⏭️  [记忆] ${sessionId} 无需操作`);
    console.log(`${'='.repeat(50)}\n`);
    return false;
  }

  /**
   * 重置会话的记忆状态（不清除记忆文件）
   * 用于会话重置时调用
   */
  resetSessionMemoryState(sessionId) {
    this.conversationRounds.delete(sessionId);
    console.log(`🔄 [记忆] ${sessionId} 的记忆状态已重置`);
  }

  /**
   * 清除用户的所有记忆
   */
  async clearMemory(sessionId) {
    try {
      const dirPath = this.getMemoryDir(sessionId);
      await fs.rm(dirPath, { recursive: true, force: true });
      this.resetSessionMemoryState(sessionId);
      // 清除文件存在性缓存
      this._memoryFileExistsCache.delete(sessionId);
      console.log(`🗑️ [记忆] 已清除 ${sessionId} 的所有记忆`);
      return true;
    } catch (error) {
      console.error(`❌ [记忆] 清除失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取记忆统计信息
   */
  async getMemoryStats(sessionId, session) {
    const hasMemory = await this.hasMemoryFile(sessionId);
    const memory = hasMemory ? await this.readMemory(sessionId) : null;
    
    return {
      sessionId,
      hasMemory,
      memoryLength: memory?.length || 0,
      conversationRounds: this.getConversationRounds(sessionId),
      memoryInjected: session ? this.hasMemoryInjected(session) : false,
      nextUpdateRounds: this.updateInterval - (this.getConversationRounds(sessionId) % this.updateInterval),
      maxMemoryLength: this.maxMemoryLength,
      memoryFilePath: this.getMemoryFilePath(sessionId),
    };
  }
}

/**
 * 创建长期记忆实例的工厂函数
 */
export function createLongTermMemory(agent, options = {}) {
  return new LongTermMemory(agent, options);
}
