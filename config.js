// ========== 配置 ==========

// 服务器配置
const PORT = Number(process.env.PORT || 3600);
const HOST = process.env.HOST || 'localhost';

export const CONFIG = {
  maxHistoryMessages: 20,  // 最大历史消息数（包括system）
  maxContextLength: 8000,  // 最大上下文token数（粗略估算）
  ragTopK: 3,              // RAG检索返回数量
  streamEnabled: true,     // 是否启用流式输出

  // 服务器基础URL（用于文件访问链接）
  baseUrl: process.env.BASE_URL || `http://${HOST}:${PORT}`,

  // ========== 长期记忆配置 ==========
  maxMemoryLength: 1000,           // 记忆文件最大字数
  memoryUpdateInterval: 5,         // 记忆更新间隔（对话轮数）

  // ========== 能力路由配置 ==========
  // 重要提示: 如果配置开始,请保证capabilityRouter.js中的DOMAIN_PATTERNS关键词匹配尽量覆盖全面,因为他会直接影响召回准确性
  // 但工具或技能非常多，所以建议先通过能力路由配置文件capabilityRouter.js进行配置，再开启此功能
  capabilityRoutingEnabled: true, // 默认关闭动态能力路由，保持全量能力注入

  // ========== 知识库决策提醒配置 ==========
  knowledgeDecisionReminderEnabled: false, // 默认关闭：高风险场景追加“先查知识库”提醒
};
