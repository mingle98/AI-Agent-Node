# AI Agent Node 简易脚手架

一个生产级的 AI Agent Node.js 脚手架，提供模块化架构、RAG 知识库检索、工具调用和技能管理等功能。

## 🚀 特性

- 🤖 **智能对话**: 基于 LangChain 的 AI 对话能力
- 📚 **RAG 知识库**: 支持本地知识库检索，可处理 PDF、MD、EPUB 等格式
- 🛠️ **工具系统**: 模块化工具架构，支持代码分析、文档生成、网络搜索等
- 🎯 **技能管理**: 内置多种 AI 技能，支持教学、咨询、问答等场景
- 🌊 **流式响应**: 支持实时流式输出，提升用户体验
- 🔄 **会话管理**: 多会话支持，自动上下文管理
- 🛡️ **容错机制**: 熔断器、重试机制、降级策略
- 🎨 **AISuspendedBallChat 兼容**: 完全符合 AISuspendedBallChat 组件接口规范
 
![ai-agent-node.png](./imgs/ai-agent-node.png)

## 📋 系统要求

- **Node.js**: >= 22.6.0 (推荐使用最新 LTS 版本)
- **内存**: 最少 2GB RAM
- **存储**: 至少 1GB 可用空间（用于向量数据库）

## 🛠️ 安装与配置

### 1. 克隆项目

```bash
git clone git@github.com:mingle98/AI-Agent-Node.git
cd AI-Agent-Node
```

### 2. 安装依赖

```bash
npm install
# 或
yarn install
```

### 3. 配置环境变量

复制并编辑 `.env` 文件：

安全提示：
- 请勿将真实的 API Key（例如 DashScope/OpenAI）提交到 Git 仓库
- 建议仅提交 `.env.example`，本地使用 `.env`

```bash
cp .env.example .env

# 如果使用阿里云的模型请前往"阿里云官网"获取你的API_KEY: https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key

# 选择 Embedding 提供商: openai 或 aliyun
EMBEDDING_PROVIDER=aliyun

# 选择 LLM 提供商: openai 或 aliyun
LLM_PROVIDER=aliyun

# 阿里云 DashScope API配置
DASHSCOPE_API_KEY=your_dashscope_api_key_here

# OpenAI API配置（如果使用 OpenAI 则取消注释并设置）
# OPENAI_API_KEY=your_openai_api_key_here
```

### 4. 启动服务

```bash
npm run dev
```

服务启动后将在 `http://localhost:3000` 提供服务。

## 📡 API 接口

### 对话接口

```http
POST /api/chat
Content-Type: application/json

{
  "query": "你好，请介绍一下 AI Agent",
  "session_id": "user123",
  "isStream": true
}
```

**参数说明：**
- `query`: 用户消息（必填）
- `session_id`: 会话标识（可选，默认 "default"）
- `isStream`: 是否使用流式响应（可选，默认 false）

**流式响应示例：**
```
data: {"code":0,"result":"AI Agent","is_end":false}

data: {"code":0,"result":" 是一种","is_end":false}

data: {"code":0,"result":"能够自主感知环境","is_end":false}

data: {"code":0,"result":"、做出决策并执行行动的智能系统。","is_end":true}

```

## 🎯 与 AISuspendedBallChat 组件集成

### 基础集成

>  AISuspendedBallChat是一个Vue3的前端组件,详细使用文档请查看 [https://www.npmjs.com/package/ai-suspended-ball-chat](https://www.npmjs.com/package/ai-suspended-ball-chat)

```vue
<template>
  <div>
    <SuspendedBallChat 
      app-name="app.test.com" 
      domain-name="juhkff" 
      url="http://localhost:3000/api/chat"
      :custom-request-config="{
        headers: {
          'X-Custom-Header': 'custom-value',
          'Authorization': 'Bearer your-token'
        },
        customParams: {
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          max_tokens: 1000,
          business_type: 'chat'
        },
        timeout: 30000,
        retry: {
          maxRetries: 3,
          retryDelay: 1000
        },
        requestParamProcessor: (baseParams, customParams) => {
          // 生成会话ID-每个用户唯一的,不能变,通过这个id管理每个用户的上下文记忆
          const sessionId = 'session_123456'
          
          // 添加时间戳
          const timestamp = Date.now()
          
          // 合并基础参数和自定义参数
          const processedParams = {
            ...baseParams,
            ...customParams,
            isStream: true,  // 启用流式响应
            session_id: sessionId,
            timestamp: timestamp,
            request_id: 'req_' + timestamp + '_' + Math.random().toString(36).substr(2, 6),
            // 添加用户信息
            user_info: {
              app_name: 'app.test.com',
              domain_name: 'juhkff',
              user_agent: 'web-browser'
            },
            // 添加业务相关参数
            business_context: {
              source: 'suspended_ball_chat',
              version: '1.0.0',
              platform: 'web'
            }
          }
          console.log('处理后的请求参数:', processedParams)
          return processedParams
        }
      }"
    />
  </div>
</template>

<script setup>
import { SuspendedBallChat } from 'ai-suspended-ball-chat'
</script>
```

## 🔧 功能特性详解

### 已支持的工具

| 工具名称　　　　　　| 功能描述　　　 | 参数　　　　　　　　　　 | 示例　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　 |
| ---------------------| ----------------| --------------------------| ----------------------------------------------------------------------|
| `search_knowledge`　| 搜索本地知识库 | 查询内容　　　　　　　　 | `search_knowledge("AI Agent架构设计")`　　　　　　　　　　　　　　　 |
| `analyze_code`　　　| 代码分析　　　 | 代码内容, 编程语言　　　 | `analyze_code("function add(a,b){return a+b}", "javascript")`　　　　|
| `analyze_chart`　　 | 图表分析讲解　 | 图表类型, 图表源码/配置, 分析目标(可选) | `analyze_chart("mermaid", "graph TD\\nA-->B", "解释流程")` |
| `generate_document` | 文档生成　　　 | 文档主题, 文档类型, 大纲 | `generate_document("AI Agent快速入门", "tutorial", "1.简介 2.安装")` |
| `daily_news`　　　　| 今日热点　　　 | 平台(可选), 返回条数(可选) | `daily_news("tenxunwang", 10)` |

### 已支持的技能

| 技能名称　　　　　　　 | 功能描述　　　　　　　　　　 | 参数　　　　　　　 | 示例　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　|
| ------------------------| ------------------------------| --------------------| -----------------------------------------------------------------|
| `ai_agent_teaching`　　| AI Agent 知识教学　　　　　　| 教学主题, 难度级别 | `ai_agent_teaching("ReAct架构", "beginner")`　　　　　　　　　　|
| `component_consulting` | AISuspendedBallChat 组件咨询 | 咨询问题, 组件名称 | `component_consulting("如何配置流式响应", "SuspendedBallChat")` |
| `code_explanation`　　 | 代码解释与教学　　　　　　　 | 代码内容, 详细程度 | `code_explanation("async function fetchData()", "detailed")`　　|
| `mermaid_diagram`　　　| 画流程/时序/类关系/架构图　　 | 图表需求描述, 图表类型 | `mermaid_diagram("帮我把登录逻辑梳理成流程图", "auto")`　　　　|
| `ai_agent_echart`　　　| 数据查询与可视化　　　　　　 | 相关数据需求　　　 | `ai_agent_echart("今年的金价走势怎么样?")`　　　　　　　　　　　|


### 配置选项

在 `config.js` 中可以调整以下配置：

```javascript
export const CONFIG = {
  maxHistoryMessages: 20,     // 最大历史消息数
  maxContextLength: 8000,     // 最大上下文 token 数
  ragTopK: 3,                 // RAG 检索返回数量
  streamEnabled: true,        // 是否启用流式输出
};
```

## 🎨 自定义扩展

### 添加新工具

1. 在 `tools/` 目录下创建新工具文件：

```javascript
// tools/myTool.js
export function myCustomTool(param1, param2) {
  // 工具逻辑实现
  return `工具执行结果: ${param1} - ${param2}`;
}
```

2. 在 `tools/index.js` 中注册：

```javascript
import { myCustomTool } from './myTool.js';

export const TOOL_DEFINITIONS = [
  // ... 现有工具
  {
    name: "my_custom_tool",
    func: myCustomTool,
    description: "我的自定义工具",
    params: [
      { name: "参数1", type: "string", example: "示例值1" },
      { name: "参数2", type: "string", example: "示例值2" }
    ],
    example: 'my_custom_tool("值1", "值2")',
  },
];
```

### 添加新技能

1. 在 `skills/` 目录下创建新技能文件：

```javascript
// skills/mySkill.js
export function skillMyCustomSkill(topic, level) {
  // 技能逻辑实现
  return `针对 ${topic} 的 ${level} 级别教学内容...`;
}
```

2. 在 `skills/index.js` 中注册：

```javascript
import { skillMyCustomSkill } from './mySkill.js';

export const SKILL_DEFINITIONS = [
  // ... 现有技能
  {
    name: "my_custom_skill",
    func: skillMyCustomSkill,
    description: "我的自定义技能",
    functionality: "技能功能描述",
    params: [
      { name: "主题", type: "string", example: "AI Agent" },
      { name: "级别", type: "string", example: "beginner", options: ["beginner", "advanced"] }
    ],
    example: 'my_custom_skill("AI Agent", "beginner")',
  },
];
```

### 扩展知识库

1. 将文档文件放入 `knowledge_base/` 目录
2. 支持的格式：
   - `.txt` - 纯文本文件
   - `.md` - Markdown 文件
   - `.pdf` - PDF 文件
   - `.epub` - EPUB 电子书

### 自定义提示词

编辑 `agent/promptBuilder.js` 文件来自定义系统提示词：

```javascript
export function buildSystemPrompt(toolDefinitions, skillDefinitions, options) {
  const { roleName, roleDescription } = options;
  
  return `你是一个${roleName}，${roleDescription}。

你可以使用以下工具：
${toolDefinitions.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

你可以使用以下技能：
${skillDefinitions.map(skill => `- ${skill.name}: ${skill.description}`).join('\n')}

请根据用户需求选择合适的工具或技能来回答问题。`;
}
```

## 🔧 高级配置

### Agent 配置选项

在 `server.js` 的 `initAgent` 函数中可以配置：

```javascript
const agent = new ProductionAgent(llm, vectorStore, embeddings, {
  contextStrategy: "trim",           // 上下文策略: trim, summarize, vector, hybrid
  fallbackLlm: fallbackLlm,           // 降级模型
  llmTimeoutMs: 5 * 60 * 1000,               // LLM 超时时间
  toolTimeoutMs: 5 * 60 * 1000,                 // 工具执行超时时间
  llmRetries: 2,                     // LLM 重试次数
  toolRetries: 2,                    // 工具重试次数
  debug: true,                       // 调试模式
  roleName: "自定义助手",             // 角色名称
  roleDescription: "功能描述",        // 角色描述
  maxIterations: 5,                  // 最大迭代次数
  sessionTtlMs: 30 * 60 * 1000,     // 会话过期时间
  maxSessions: 300,                  // 最大会话数
});
```

### 上下文策略

- `trim`: 直接裁剪历史消息
- `summarize`: 总结历史对话
- `vector`: 基于向量相似度选择相关上下文
- `hybrid`: 混合策略

## 📄 许可证

本项目采用 ISC 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [LangChain](https://langchain.com/) - AI 应用开发框架
- [AISuspendedBallChat](https://github.com/your-repo/ai-suspended-ball-chat) - 前端聊天组件
- [阿里云 DashScope](https://dashscope.aliyun.com/) - AI 模型服务