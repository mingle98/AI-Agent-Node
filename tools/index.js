// ========== 工具路由（带元数据） ==========
import { searchKnowledgeBase } from './knowledge.js';
import { analyzeCode } from './codeAnalyzer.js';
import { generateDocument } from './document.js';
import { renderMermaid } from './mermaid.js';
import { analyzeChart } from './chartAnalyzer.js';
import { getDailyNews } from './dailyNews.js';
import { execCode } from './execCode.js';
import { generatePythonScript, analyzeScriptResult, setScriptGeneratorLLM, checkScriptSafety } from './scriptGenerator.js';

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
    name: "analyze_chart",
    func: (chartType, source, userGoal) => analyzeChart(chartType, source, userGoal),
    description: "分析图表源码/配置（Mermaid/ECharts），输出结构讲解、要点与总结，帮助用户理解图表表达的含义",
    params: [
      { name: "图表类型", type: "string", example: "mermaid", options: ["mermaid", "echarts"] },
      { name: "图表源码/配置", type: "string", example: "graph TD\nA-->B" },
      { name: "分析目标(可选)", type: "string", example: "解释业务流程与关键分支", required: false }
    ],
    example: 'analyze_chart("mermaid", "graph TD\\nA-->B", "解释流程")',
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
  {
    name: "daily_news",
    func: (platform, limit) => getDailyNews(platform, limit),
    description: "查询今日热点新闻列表（默认：腾讯网）",
    params: [
      { name: "平台(可选)", type: "string", example: "tenxunwang", options: ["tenxunwang", "weibo"], required: false },
      { name: "返回条数(可选)", type: "number", example: 10, required: false }
    ],
    example: 'daily_news("tenxunwang", 10)',
  },
  {
    name: "exec_code",
    func: (code, language) => execCode(code, language),
    description: "在服务端沙箱环境中执行代码（支持 JavaScript/TypeScript/Python），用于数据转换、算法验证、脚本执行",
    params: [
      { name: "代码内容", type: "string", example: "console.log('Hello World')" },
      { name: "编程语言", type: "string", example: "javascript", options: ["javascript", "typescript", "python"], required: false }
    ],
    example: 'exec_code("console.log(2+3)", "javascript")',
  },
  {
    name: "script_generator",
    func: (task, dataInput, outputFormat) => generatePythonScript(task, dataInput, outputFormat),
    description: "使用 LLM 根据需求生成 Python 脚本，支持数据统计、转换、算法验证等场景",
    params: [
      { name: "任务描述", type: "string", example: "计算这组数据的平均值和标准差" },
      { name: "输入数据", type: "string", example: "10, 20, 30, 40, 50", required: false },
      { name: "输出格式", type: "string", example: "auto", options: ["auto", "summary", "json", "csv", "chart_data"], required: false }
    ],
    example: 'script_generator("计算平均值", "10, 20, 30", "auto")',
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
  analyzeChart,
  generateDocument,
  renderMermaid,
  getDailyNews,
  execCode,
  generatePythonScript,
  analyzeScriptResult,
  setScriptGeneratorLLM,
  checkScriptSafety,
};
