// ========== 配置 ==========

// 服务器配置
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || 'localhost';

export const CONFIG = {
  maxHistoryMessages: 20,  // 最大历史消息数（包括system）
  maxContextLength: 8000,  // 最大上下文token数（粗略估算）
  ragTopK: 3,              // RAG检索返回数量
  streamEnabled: true,     // 是否启用流式输出

  // 服务器基础URL（用于文件访问链接）
  baseUrl: process.env.BASE_URL || `http://${HOST}:${PORT}`,

  // ========== 长期记忆配置 ==========
  maxMemoryLength: 1200,           // 记忆文件最大字数
  memoryUpdateInterval: 5,         // 记忆更新间隔（对话轮数）
};
