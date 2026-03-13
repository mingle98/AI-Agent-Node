// ========== 工具路由（带元数据） ==========
import { searchKnowledgeBase } from './knowledge.js';
import { webSearch } from './webSearch.js';
import { analyzeCode } from './codeAnalyzer.js';
import { generateDocument } from './document.js';

// 工具定义（包含函数和元数据）
export const TOOL_DEFINITIONS = [
  {
    name: "search_knowledge",
    func: (vectorStore, query) => searchKnowledgeBase(vectorStore, query),
    description: "搜索本地知识库，获取AI Agent相关资料或AISuspendedBallChat组件文档",
    params: [
      { name: "查询内容", type: "string", example: "AI Agent架构设计" }
    ],
    example: 'search_knowledge("AI Agent架构设计")',
    special: true,
  },
  {
    name: "web_search",
    func: (query) => webSearch(query),
    description: "搜索互联网获取最新信息，补充知识库以外的内容",
    params: [
      { name: "搜索关键词", type: "string", example: "最新AI Agent框架2024" }
    ],
    example: 'web_search("最新AI Agent框架2024")',
  },
  {
    name: "analyze_code",
    func: (code, language) => analyzeCode(code, language),
    description: "分析代码片段，解释逻辑、找出潜在问题或优化建议",
    params: [
      { name: "代码内容", type: "string", example: "function add(a, b) { return a + b; }" },
      { name: "编程语言", type: "string", example: "javascript", options: ["javascript", "python", "java", "cpp", "go", "rust", "typescript", "other"] }
    ],
    example: 'analyze_code("function add(a, b) { return a + b; }", "javascript")',
  },
  {
    name: "generate_document",
    func: (topic, docType, outline) => generateDocument(topic, docType, outline),
    description: "生成各类技术文档，如API文档、教程、README等",
    params: [
      { name: "文档主题", type: "string", example: "AI Agent快速入门" },
      { name: "文档类型", type: "string", example: "tutorial", options: ["tutorial", "api", "readme", "architecture", "guide"] },
      { name: "文档大纲", type: "string", example: "1.简介 2.安装 3.快速开始", required: false }
    ],
    example: 'generate_document("AI Agent快速入门", "tutorial", "1.简介 2.安装 3.快速开始")',
  },
];

// 生成工具映射表
export const TOOLS = TOOL_DEFINITIONS.reduce((acc, tool) => {
  acc[tool.name] = tool.func;
  return acc;
}, {});

// 导出函数
export {
  searchKnowledgeBase,
  webSearch,
  analyzeCode,
  generateDocument,
};
