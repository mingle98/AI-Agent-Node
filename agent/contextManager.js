// ========== 上下文管理策略 ==========

import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

/**
 * 上下文管理器
 * 支持多种策略：trim（剪裁）、summarize（摘要）、vector（向量检索）、hybrid（混合）
 */
export class ContextManager {
  constructor(llm, embeddings, config = {}) {
    this.llm = llm;
    this.embeddings = embeddings;

    // 参数归一化，避免 keepRecentMessages > maxHistoryMessages 导致无法收敛
    const normalizedMaxHistory = Math.max(2, Number(config.maxHistoryMessages) || 20);
    const normalizedKeepRecent = Math.max(1, Number(config.keepRecentMessages) || 10);
    const safeKeepRecent = Math.min(normalizedKeepRecent, normalizedMaxHistory - 1);

    this.config = {
      strategy: config.strategy || 'trim',  // 策略：trim, summarize, vector, hybrid
      maxHistoryMessages: normalizedMaxHistory,
      maxContextLength: config.maxContextLength || 8000,
      keepRecentMessages: safeKeepRecent,  // 保留最近的对话数
      summaryInterval: config.summaryInterval || 10,  // 每N条消息触发一次摘要
    };
    
    // 向量存储（用于 vector 和 hybrid 策略）
    this.conversationVectorStore = null;
    this.conversationIndex = 0;
    
    // 摘要存储
    this.summaries = [];
    this.lastSummaryIndex = 0;
  }

  /**
   * 管理上下文（根据策略）
   * @param {Array} messages - 当前消息列表
   * @returns {Array} 处理后的消息列表
   */
  async manageContext(messages) {
    const strategy = this.config.strategy;
    
    if (messages.length <= this.config.maxHistoryMessages) {
      return messages;
    }

    console.log(`\n  ⚠️  历史消息过长 (${messages.length}条)，执行${this.getStrategyName()}...`);

    switch (strategy) {
      case 'trim':
        return this.trimStrategy(messages);
      
      case 'summarize':
        return await this.summarizeStrategy(messages);
      
      case 'vector':
        return await this.vectorStrategy(messages);
      
      case 'hybrid':
        return await this.hybridStrategy(messages);
      
      default:
        console.warn(`未知策略 ${strategy}，使用默认剪裁策略`);
        return this.trimStrategy(messages);
    }
  }

  /**
   * 策略1: 简单剪裁（trim）
   * 保留 system message + 最近的 N 条对话
   * 优点：速度快，不消耗 token
   * 缺点：丢失早期信息
   */
  trimStrategy(messages) {
    // 只保留第一个系统消息（原始的 Agent 系统提示）
    const firstSystemMessage = messages.find(m => m._getType() === 'system');
    if (!firstSystemMessage) {
      return messages;
    }

    const conversationMessages = messages.filter(m => m._getType() !== 'system');
    const keepCount = Math.min(this.config.maxHistoryMessages - 1, conversationMessages.length);
    const recentMessages = conversationMessages.slice(-keepCount);
    
    const result = [firstSystemMessage, ...recentMessages];
    console.log(`  ✅ 剪裁完成，保留 ${result.length} 条消息（丢弃 ${messages.length - result.length} 条）\n`);
    
    return result;
  }

  /**
   * 策略2: 摘要压缩（summarize）
   * 将早期对话压缩成摘要，保留关键信息
   * 优点：不丢失信息，保留语义
   * 缺点：消耗额外 token，速度较慢
   */
  async summarizeStrategy(messages) {
    // 只保留第一个系统消息（原始的 Agent 系统提示）
    const firstSystemMessage = messages.find(m => m._getType() === 'system');
    if (!firstSystemMessage) {
      return messages;
    }

    const previousSummary = this.getLatestSummary(messages);
    const conversationMessages = messages.filter(m => m._getType() !== 'system');
    
    // 保留最近的 N 条对话
    const keepRecent = this.config.keepRecentMessages;
    const recentMessages = conversationMessages.slice(-keepRecent);
    const oldMessages = conversationMessages.slice(0, -keepRecent);

    if (oldMessages.length === 0) {
      return messages;
    }

    // 生成摘要
    console.log(`  📝 正在生成 ${oldMessages.length} 条历史对话的摘要...`);
    const summary = await this.generateSummary(oldMessages, previousSummary);
    
    // 构建新的消息列表：原始系统提示 + 摘要 + 最近对话
    const summaryMessage = new SystemMessage(
      `[历史对话摘要]\n${summary}\n\n[以下是最近的对话]`
    );
    
    const result = [firstSystemMessage, summaryMessage, ...recentMessages];
    console.log(`  ✅ 摘要完成，保留 ${result.length} 条消息（压缩 ${oldMessages.length} 条为摘要）\n`);
    
    return result;
  }

  /**
   * 策略3: 向量检索（vector）
   * 将历史对话存入向量库，根据当前问题检索相关对话
   * 优点：智能检索，上下文最相关
   * 缺点：需要向量库，计算开销大
   */
  async vectorStrategy(messages) {
    // 只保留第一个系统消息（原始的 Agent 系统提示）
    const firstSystemMessage = messages.find(m => m._getType() === 'system');
    if (!firstSystemMessage) {
      return messages;
    }

    const conversationMessages = messages.filter(m => m._getType() !== 'system');
    
    // 初始化向量存储
    if (!this.conversationVectorStore) {
      await this.initializeVectorStore();
    }

    // 保留最近的 N 条对话
    const keepRecent = this.config.keepRecentMessages;
    const recentMessages = conversationMessages.slice(-keepRecent);
    const oldMessages = conversationMessages.slice(0, -keepRecent);

    // 将旧对话存入向量库
    if (oldMessages.length > 0) {
      console.log(`  💾 正在将 ${oldMessages.length} 条历史对话存入向量库...`);
      await this.storeConversations(oldMessages);
    }

    // 获取最后一条用户消息作为查询
    const lastUserMessage = this.getLastUserMessage(recentMessages);
    
    if (lastUserMessage) {
      console.log(`  🔍 正在检索与 "${lastUserMessage.content.substring(0, 30)}..." 相关的历史对话...`);
      
      // 检索相关对话
      const relevantConversations = await this.retrieveRelevantConversations(
        lastUserMessage.content,
        3  // 检索最相关的3段对话
      );

      if (relevantConversations.length > 0) {
        const contextMessage = new SystemMessage(
          `[相关历史对话]\n${relevantConversations.join('\n\n')}\n\n[以下是最近的对话]`
        );
        
        const result = [firstSystemMessage, contextMessage, ...recentMessages];
        console.log(`  ✅ 检索完成，保留 ${result.length} 条消息（检索到 ${relevantConversations.length} 段相关历史）\n`);
        return result;
      }
    }

    // 如果没有检索到相关对话，直接返回最近对话
    const result = [firstSystemMessage, ...recentMessages];
    console.log(`  ✅ 保留 ${result.length} 条最近消息\n`);
    return result;
  }

  /**
   * 策略4: 混合策略（hybrid）
   * 结合摘要和向量检索
   * 优点：既有摘要，又有相关检索
   * 缺点：计算开销最大
   */
  async hybridStrategy(messages) {
    // 只保留第一个系统消息（原始的 Agent 系统提示）
    const firstSystemMessage = messages.find(m => m._getType() === 'system');
    if (!firstSystemMessage) {
      return messages;
    }

    const previousSummary = this.getLatestSummary(messages);
    const conversationMessages = messages.filter(m => m._getType() !== 'system');
    
    // 保留最近的 N 条对话
    const keepRecent = this.config.keepRecentMessages;
    const recentMessages = conversationMessages.slice(-keepRecent);
    const oldMessages = conversationMessages.slice(0, -keepRecent);

    if (oldMessages.length === 0) {
      return messages;
    }

    console.log(`  🔄 使用混合策略处理 ${oldMessages.length} 条历史对话...`);

    // 1. 生成摘要
    console.log(`  📝 步骤1/2: 生成摘要...`);
    const summary = await this.generateSummary(oldMessages, previousSummary);

    // 2. 检索相关对话（如果有向量库）
    let relevantContext = "";
    if (this.embeddings) {
      console.log(`  🔍 步骤2/2: 检索相关对话...`);
      if (!this.conversationVectorStore) {
        await this.initializeVectorStore();
      }
      await this.storeConversations(oldMessages);
      
      const lastUserMessage = this.getLastUserMessage(recentMessages);
      if (lastUserMessage) {
        const relevantConversations = await this.retrieveRelevantConversations(
          lastUserMessage.content,
          2
        );
        if (relevantConversations.length > 0) {
          relevantContext = `\n\n[相关历史片段]\n${relevantConversations.join('\n\n')}`;
        }
      }
    }

    // 构建上下文消息
    const contextMessage = new SystemMessage(
      `[历史对话摘要]\n${summary}${relevantContext}\n\n[以下是最近的对话]`
    );

    const result = [firstSystemMessage, contextMessage, ...recentMessages];
    console.log(`  ✅ 混合策略完成，保留 ${result.length} 条消息\n`);
    
    return result;
  }

  /**
   * 生成对话摘要
   */
  async generateSummary(messages, previousSummary = "") {
    if (messages.length === 0) {
      return previousSummary || "暂无历史对话";
    }

    // 构建对话历史文本
    const conversationText = messages
      .map(m => {
        const type = m._getType() === 'human' ? '用户' : '助手';
        return `${type}: ${m.content}`;
      })
      .join('\n');

    // 使用 LLM 生成摘要。若存在旧摘要，则增量更新，避免历史信息丢失。
    const hasPreviousSummary = Boolean(previousSummary && previousSummary.trim());
    const summaryPrompt = hasPreviousSummary
      ? `你将收到“已有历史摘要”和“新增对话片段”。请生成一个新的完整摘要，要求：
1. 保留已有摘要中的关键信息；
2. 融合新增对话中的新事实、新决策、新约束；
3. 去重并消除冲突，输出最新一致版本；
4. 输出 3-7 个要点，简洁清晰。

[已有历史摘要]
${previousSummary}

[新增对话片段]
${conversationText}

新的完整摘要（3-7个要点）：`
      : `请对以下对话历史进行简洁摘要，提取关键信息、重要决策和用户需求，输出 3-7 个要点：

${conversationText}

摘要（3-7个要点）：`;

    try {
      const response = await this.llm.invoke([
        new HumanMessage(summaryPrompt)
      ]);
      
      return response.content.trim();
    } catch (error) {
      console.error(`  ❌ 摘要生成失败: ${error.message}`);
      // 降级：优先保留已有摘要，避免记忆断层
      if (previousSummary && previousSummary.trim()) {
        return previousSummary.trim();
      }
      // 兜底：返回简单对话统计
      return `包含 ${messages.length} 条对话记录`;
    }
  }

  /**
   * 获取最近一次上下文摘要文本（若存在）
   */
  getLatestSummary(messages) {
    const systemMessages = messages.filter(m => m._getType() === 'system');
    for (let i = systemMessages.length - 1; i >= 0; i--) {
      const content = systemMessages[i].content || "";
      if (!content.includes("[历史对话摘要]")) {
        continue;
      }
      const withoutHeader = content.replace("[历史对话摘要]\n", "");
      const endMarker = "\n\n[以下是最近的对话]";
      const endIndex = withoutHeader.indexOf(endMarker);
      const rawSummary = endIndex >= 0
        ? withoutHeader.slice(0, endIndex).trim()
        : withoutHeader.trim();

      // hybrid 的上下文中会拼接 [相关历史片段]，提取 previousSummary 时需剔除
      const relevantMarker = "\n\n[相关历史片段]\n";
      const relevantIndex = rawSummary.indexOf(relevantMarker);
      return relevantIndex >= 0
        ? rawSummary.slice(0, relevantIndex).trim()
        : rawSummary;
    }
    return "";
  }

  /**
   * 初始化向量存储
   */
  async initializeVectorStore() {
    if (!this.embeddings) {
      throw new Error("向量策略需要 embeddings 实例");
    }
    
    this.conversationVectorStore = new MemoryVectorStore(this.embeddings);
  }

  /**
   * 将对话存入向量库
   */
  async storeConversations(messages) {
    if (!this.conversationVectorStore || messages.length === 0) {
      return;
    }

    // 将每对对话（用户+助手）作为一个文档
    const pairs = [];
    for (let i = 0; i < messages.length - 1; i += 2) {
      if (messages[i]._getType() === 'human' && messages[i + 1]._getType() === 'ai') {
        const userMsg = messages[i].content;
        const aiMsg = messages[i + 1].content;
        pairs.push({
          pageContent: `用户: ${userMsg}\n助手: ${aiMsg}`,
          metadata: {
            index: this.conversationIndex++,
            timestamp: Date.now(),
          }
        });
      }
    }

    if (pairs.length > 0) {
      await this.conversationVectorStore.addDocuments(pairs);
    }
  }

  /**
   * 检索相关对话
   */
  async retrieveRelevantConversations(query, topK = 3) {
    if (!this.conversationVectorStore) {
      return [];
    }

    try {
      const results = await this.conversationVectorStore.similaritySearch(query, topK);
      return results.map(doc => doc.pageContent);
    } catch (error) {
      console.error(`  ❌ 检索失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取最后一条用户消息
   */
  getLastUserMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]._getType() === 'human') {
        return messages[i];
      }
    }
    return null;
  }

  /**
   * 获取策略名称
   */
  getStrategyName() {
    const names = {
      trim: '剪裁策略',
      summarize: '摘要策略',
      vector: '向量检索策略',
      hybrid: '混合策略',
    };
    return names[this.config.strategy] || '未知策略';
  }

  /**
   * 重置向量存储
   */
  reset() {
    this.conversationVectorStore = null;
    this.conversationIndex = 0;
    this.summaries = [];
    this.lastSummaryIndex = 0;
  }
}
