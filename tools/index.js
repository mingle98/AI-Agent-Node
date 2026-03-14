// ========== 工具路由（带元数据） ==========
import { searchKnowledgeBase } from './knowledge.js';
import { analyzeCode } from './codeAnalyzer.js';
import { generateDocument } from './document.js';
import { renderMermaid } from './mermaid.js';

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
  {
    name: "render_mermaid",
    func: (diagramOrType, body) => renderMermaid(diagramOrType, body),
    description: "将 Mermaid 源码渲染为标准 ```mermaid 代码块（支持直接传源码，或传 图表类型+内容 自动拼装）",
    params: [
      { name: "Mermaid源码或图表类型", type: "string", example: "sequence" },
      { name: "图表内容(可选)", type: "string", example: "participant U as 用户\nU->>F: 发送消息", required: false }
    ],
    example: 'render_mermaid("sequence", "participant U as 用户\\nU->>F: 发送消息")',
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
  analyzeCode,
  generateDocument,
  renderMermaid,
};
