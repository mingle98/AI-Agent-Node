// ========== 配置 ==========

// 服务器配置
const PORT = Number(process.env.PORT || 3600);
const HOST = process.env.HOST || 'localhost';

function parsePositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export const CONFIG = {
  maxHistoryMessages: 20,  // 最大历史消息数（包括system）
  maxContextLength: 8000,  // 最大上下文token数（粗略估算）
  ragTopK: 4,              // RAG检索返回数量
  streamEnabled: true,     // 是否启用流式输出

  // 服务器基础URL（用于文件访问链接）
  baseUrl: process.env.BASE_URL || `http://${HOST}:${PORT}`,

  // ========== 长期记忆配置 ==========
  maxMemoryLength: 1000,           // 记忆文件最大字数
  memoryUpdateInterval: 5,         // 记忆更新间隔（对话轮数）

  // ========== 能力路由配置 ==========
  // 重要提示: 如果配置开始,请保证capabilityRouter.js中的DOMAIN_PATTERNS关键词匹配尽量覆盖全面,因为他会直接影响召回准确性
  // 但工具或技能非常多，所以建议先通过能力路由配置文件capabilityRouter.js进行配置，再开启此功能
  capabilityRoutingEnabled: true,

  // ========== 知识库决策提醒配置 ==========
  knowledgeDecisionReminderEnabled: true,

  // ========== MCP 配置 ==========
  mcpEnabled: process.env.MCP_ENABLED === 'true', // 默认关闭，开启后在 Agent 创建前发现并注册 MCP 工具
  mcpToolNamePrefix: process.env.MCP_TOOL_NAME_PREFIX || 'mcp',
  mcpInitTimeoutMs: parsePositiveNumber(process.env.MCP_INIT_TIMEOUT_MS, 15000),
  mcpCallTimeoutMs: parsePositiveNumber(process.env.MCP_CALL_TIMEOUT_MS, 60000),
};
