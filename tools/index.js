// ========== 工具路由（带元数据） ==========
import { searchKnowledgeBase } from './knowledge.js';

// 工具定义（包含函数和元数据）
export const TOOL_DEFINITIONS = [
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
  // {
  //   name: "query_order",
  //   func: queryOrder,
  //   description: "查询订单信息",
  //   params: [
  //     { name: "订单号", type: "string", example: "ORD001" }
  //   ],
  //   example: 'query_order("ORD001")',
  // },
];

// 生成工具映射表
export const TOOLS = TOOL_DEFINITIONS.reduce((acc, tool) => {
  acc[tool.name] = tool.func;
  return acc;
}, {});

// 导出函数
export {
  searchKnowledgeBase,
};
