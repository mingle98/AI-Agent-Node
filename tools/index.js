// ========== 工具路由（带元数据） ==========

import { queryOrder } from './order.js';
import { queryUser } from './user.js';
import { applyRefund } from './refund.js';
import { calculatePoints } from './points.js';
import { searchKnowledgeBase } from './knowledge.js';

// 工具定义（包含函数和元数据）
export const TOOL_DEFINITIONS = [
  {
    name: "query_order",
    func: queryOrder,
    description: "查询订单信息",
    params: [
      { name: "订单号", type: "string", example: "ORD001" }
    ],
    example: 'query_order("ORD001")',
  },
  {
    name: "query_user",
    func: queryUser,
    description: "查询用户信息",
    params: [
      { name: "用户名", type: "string", example: "小明" }
    ],
    example: 'query_user("小明")',
  },
  {
    name: "apply_refund",
    func: applyRefund,
    description: "申请退款",
    params: [
      { name: "订单号", type: "string", example: "ORD001" },
      { name: "退款原因", type: "string", example: "商品质量问题" }
    ],
    example: 'apply_refund("ORD001", "商品质量问题")',
  },
  {
    name: "calculate_points",
    func: calculatePoints,
    description: "计算消费积分",
    params: [
      { name: "金额", type: "number", example: "5999" }
    ],
    example: 'calculate_points(5999)',
  },
  {
    name: "search_knowledge",
    func: (vectorStore, query) => searchKnowledgeBase(vectorStore, query),
    description: "搜索知识库",
    params: [
      { name: "查询内容", type: "string", example: "退货政策" }
    ],
    example: 'search_knowledge("退货政策")',
    special: true, // 标记为特殊工具（需要 vectorStore）
  },
];

// 生成工具映射表
export const TOOLS = TOOL_DEFINITIONS.reduce((acc, tool) => {
  acc[tool.name] = tool.func;
  return acc;
}, {});

// 导出函数
export {
  queryOrder,
  queryUser,
  applyRefund,
  calculatePoints,
  searchKnowledgeBase,
};
