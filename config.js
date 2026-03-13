// ========== 配置 ==========

export const CONFIG = {
  maxHistoryMessages: 20,  // 最大历史消息数（包括system）
  maxContextLength: 8000,  // 最大上下文token数（粗略估算）
  ragTopK: 3,              // RAG检索返回数量
  streamEnabled: true,     // 是否启用流式输出
};
