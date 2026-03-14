// ========== 技能路由（带元数据） ==========
import { skillAIAgentTeaching } from './aiAgentTeaching.js';
import { skillComponentConsulting } from './componentConsulting.js';
import { skillCodeExplanation } from './codeExplanation.js';
import { skillIntelligentQA } from './intelligentQA.js';
import { skillAIAgentEchart } from './aiEchart.js';
import { skillMermaidDiagram } from './mermaidDiagram.js';

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
};
