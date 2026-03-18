// ========== 技能路由（带元数据） ==========
import { skillAIAgentTeaching } from './aiAgentTeaching.js';
import { skillComponentConsulting } from './componentConsulting.js';
import { skillCodeExplanation } from './codeExplanation.js';
import { skillIntelligentQA } from './intelligentQA.js';
import { skillAIAgentEchart } from './aiEchart.js';
import { skillMermaidDiagram } from './mermaidDiagram.js';
import { skillDebugAssistant } from './debugAssistant.js';
import { skillCodeReview } from './codeReview.js';
import { skillExcelHelper } from './excelHelper.js';
import { skillDecisionHelper } from './decisionHelper.js';
import { skillEmailWriter } from './emailWriter.js';
import { skillPythonExecutor } from './pythonExecutor.js';

// 技能定义（包含函数和元数据）
export const SKILL_DEFINITIONS = [
  {
    name: "ai_agent_teaching",
    func: skillAIAgentTeaching,
    description: "AI Agent知识教学",
    functionality: "提供AI Agent核心概念、架构设计、最佳实践等教学指导",
    params: [
      { name: "教学主题", type: "string", example: "ReAct架构" },
      { name: "难度级别", type: "string", example: "beginner", options: ["beginner", "intermediate", "advanced"] }
    ],
    example: 'ai_agent_teaching("ReAct架构", "beginner")',
  },
  {
    name: "component_consulting",
    func: skillComponentConsulting,
    description: "AISuspendedBallChat组件咨询",
    functionality: "提供组件使用指导、配置说明、问题排查",
    params: [
      { name: "咨询问题", type: "string", example: "如何配置流式响应" },
      { name: "组件名称", type: "string", example: "SuspendedBallChat", options: ["SuspendedBallChat", "ChatPanel"] }
    ],
    example: 'component_consulting("如何配置流式响应", "SuspendedBallChat")',
  },
  {
    name: "code_explanation",
    func: skillCodeExplanation,
    description: "代码解释与教学",
    functionality: "详细解释代码逻辑、算法原理、设计模式",
    params: [
      { name: "代码内容", type: "string", example: "async function fetchData() { ... }" },
      { name: "详细程度", type: "string", example: "normal", options: ["brief", "normal", "detailed"] }
    ],
    example: 'code_explanation("async function fetchData() {...}", "detailed")',
  },
  // {
  //   name: "intelligent_qa",
  //   func: skillIntelligentQA,
  //   description: "智能问答",
  //   functionality: "基于知识库回答AI Agent和组件相关问题",
  //   params: [
  //     { name: "问题", type: "string", example: "什么是AI Agent的规划能力" },
  //     { name: "知识领域", type: "string", example: "ai_agent", options: ["ai_agent", "component", "general"] }
  //   ],
  //   example: 'intelligent_qa("什么是AI Agent的规划能力", "ai_agent")',
  // },
  {
    name: "ai_agent_echart",
    func: skillAIAgentEchart,
    description: "AI Agent ECharts 数据可视化",
    functionality: "根据用户有关数据查询场景的需求生成可渲染的 ECharts option（JSON）",
    params: [
      { name: "数据查询与可视化", type: "string", example: "2026年房价走势" },
    ],
    example: 'ai_agent_echart("2026年房价走势")',
  },
  {
    name: "mermaid_diagram",
    func: skillMermaidDiagram,
    description: "Mermaid 图生成（从自然语言需求生成可渲染的 Mermaid 代码块）",
    functionality: "用于'梳理逻辑/画流程图/画时序图/画类图'等场景，返回标准 ```mermaid 代码块 以便前端渲染",
    params: [
      { name: "图表需求描述", type: "string", example: "帮我梳理下这段代码的逻辑，并画出流程图" },
      { name: "图表类型", type: "string", example: "auto", options: ["auto", "flowchart", "sequence", "gantt", "pie", "class", "state", "er", "journey", "mindmap", "timeline", "gitgraph"] }
    ],
    example: 'mermaid_diagram("帮我梳理下代码的逻辑", "auto")',
  },
  {
    name: "debug_assistant",
    func: skillDebugAssistant,
    description: "Debug 调试助手",
    functionality: "分析错误日志、诊断问题根因、提供修复建议和调试策略",
    params: [
      { name: "错误信息", type: "string", example: "TypeError: Cannot read property 'name' of undefined" },
      { name: "上下文环境", type: "string", example: "React 18, Node.js 16", options: ["React", "Vue", "Node.js", "Python", "Java", ""] }
    ],
    example: 'debug_assistant("TypeError: Cannot read property...", "React 18")',
  },
  {
    name: "code_review",
    func: skillCodeReview,
    description: "代码审查助手",
    functionality: "检查代码质量、发现潜在问题、提供改进建议（安全/性能/风格/可维护性）",
    params: [
      { name: "代码内容", type: "string", example: "function add(a, b) { return a + b; }" },
      { name: "审查重点", type: "string", example: "all", options: ["all", "security", "performance", "style"] }
    ],
    example: 'code_review("function add(a,b)...", "all")',
  },
  {
    name: "excel_helper",
    func: skillExcelHelper,
    description: "Excel 助手",
    functionality: "自然语言转 Excel 公式、函数推荐、操作指导和数据处理技巧",
    params: [
      { name: "需求描述", type: "string", example: "计算A列的平均值，排除空值" },
      { name: "数据类型", type: "string", example: "mixed", options: ["numbers", "text", "date", "mixed"] }
    ],
    example: 'excel_helper("计算A列平均值", "numbers")',
  },
  {
    name: "decision_helper",
    func: skillDecisionHelper,
    description: "决策助手",
    functionality: "辅助决策分析，提供利弊权衡、风险评估、方案对比和决策框架",
    params: [
      { name: "决策场景", type: "string", example: "是否接受新的工作机会" },
      { name: "可选方案", type: "string", example: "接受, 拒绝, 再谈条件" }
    ],
    example: 'decision_helper("是否换工作", "接受, 拒绝, 再谈条件")',
  },
  {
    name: "email_writer",
    func: skillEmailWriter,
    description: "邮件写作助手",
    functionality: "生成各类商务邮件模板（跟进、道歉、拒绝、邀约、感谢等）",
    params: [
      { name: "邮件目的", type: "string", example: "跟进项目进度", options: ["跟进", "道歉", "拒绝", "邀请", "感谢"] },
      { name: "背景信息", type: "string", example: "上周会议讨论的方案" },
      { name: "语气风格", type: "string", example: "formal", options: ["formal", "friendly", "urgent"] }
    ],
    example: 'email_writer("跟进", "上周会议方案", "formal")',
  },
  {
    name: "python_executor",
    func: skillPythonExecutor,
    description: "Python 脚本执行器（LLM生成脚本+执行+智能分析）",
    functionality: "复杂场景下由LLM自动生成Python脚本并执行，实现数据统计、漏斗转化、加权决策等，然后智能分析结果返回给用户",
    params: [
      { name: "任务描述", type: "string", example: "计算加权评分：产品A(成本80,质量90,交付75)，产品B(成本70,质量85,交付90)，权重成本0.4,质量0.3,交付0.3" },
      { name: "输入数据", type: "string", example: "exposure=120000, click=8400, signup=2100, pay=315", required: false },
      { name: "输出格式", type: "string", example: "auto", options: ["auto", "summary", "json", "csv", "chart_data"], required: false }
    ],
    example: 'python_executor("计算漏斗转化率并找出最大流失环节", "exposure=120000, click=8400, signup=2100, pay=315", "auto")',
  },
];

// 生成技能映射表
export const SKILLS = SKILL_DEFINITIONS.reduce((acc, skill) => {
  acc[skill.name] = skill.func;
  return acc;
}, {});

// 导出函数
export {
  skillAIAgentTeaching,
  skillComponentConsulting,
  skillCodeExplanation,
  skillIntelligentQA,
  skillAIAgentEchart,
  skillMermaidDiagram,
  skillDebugAssistant,
  skillCodeReview,
  skillExcelHelper,
  skillDecisionHelper,
  skillEmailWriter,
  skillPythonExecutor,
};
