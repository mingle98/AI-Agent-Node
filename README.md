# 🏭 生产级 AI Agent - 模块化架构

这是 `productionAgent.js` 的模块化重构版本，功能完全一致，但组织结构更清晰易懂。

## 📁 目录结构

```
productionAgent/
├── index.js                     # 主入口文件
├── package.json                 # 项目配置和依赖
├── config.js                    # 全局配置
├── llm.js                       # LLM 和 Embeddings 创建函数
├── .env                         # 环境变量配置
│
├── data/
│   └── mockDatabase.js          # 模拟数据库（订单、用户）
│
├── tools/                       # 基础工具层（单一职责）
│   ├── index.js                 # 工具路由和导出
│   ├── order.js                 # 订单查询工具
│   ├── user.js                  # 用户查询工具
│   ├── refund.js                # 退款工具
│   ├── points.js                # 积分计算工具
│   └── knowledge.js             # 知识库检索工具
│
├── skills/                      # 高级技能层（组合能力）
│   ├── index.js                 # 技能路由和导出
│   ├── completeRefund.js        # 完整退款流程
│   ├── vipService.js            # VIP 会员服务
│   ├── recommendation.js        # 智能推荐
│   ├── complaint.js             # 投诉处理
│   └── dataAnalysis.js          # 数据分析
│
├── agent/
│   ├── ProductionAgent.js       # Agent 核心类
│   ├── promptBuilder.js         # 系统提示构建器（元数据驱动）
│   └── contextManager.js        # 上下文管理器（4种策略）
│
├── demos/                       # 演示场景
│   ├── customerService.js       # 客服对话演示
│   ├── skillCapability.js       # Skill 能力演示
│   ├── intelligentRouting.js    # 智能路由演示
│   └── tokenOptimization.js     # Token 优化演示
│
├── utils/                       # 工具函数
│   └── ragBuilder.js            # RAG 知识库构建工具
│
├── scripts/                     # 脚本工具
│   └── buildRAG.js              # 构建向量数据库脚本
│
├── docs/                        # 文档
│   ├── HOW_TO_ADD_TOOLS_SKILLS.md  # 添加工具/技能教程
│   ├── ARCHITECTURE.md          # 架构设计文档
│   └── CONTEXT_STRATEGIES.md    # 上下文策略详解
│
├── examples/                    # 示例代码
│   ├── debugPrompt.js           # 调试系统提示
│   └── contextStrategies.js     # 上下文策略对比
│
├── knowledge_base/              # 知识库文档目录（.txt/.md/.pdf/.epub）
│   ├── README.md                # 知识库说明
│   └── *.md                     # 示例文档
│
└── vector_db/                   # 向量数据库（自动生成）
    ├── faiss.index              # FAISS 索引
    └── docstore.json            # 文档存储
```

## 🎯 架构设计

### 三层架构

```
🧠 Agent 层（智能决策）
   ↓
🎯 Skill 层（业务流程）
   ↓
🔧 Tool 层（原子操作）
```

### Tool（工具层）
- **定位**：原子操作，单一职责
- **特点**：简单、快速、可复用
- **示例**：`query_order()`, `query_user()`
- **使用**：独立的查询和操作

### Skill（技能层）
- **定位**：业务流程，组合能力
- **特点**：智能、自动化、面向业务
- **示例**：`complete_refund()`, `vip_service()`
- **使用**：复杂的多步骤业务流程

### Agent（智能层）
- **定位**：意图识别，能力调度
- **特点**：自主决策，上下文管理
- **功能**：理解用户需求，选择最佳能力

## 🚀 快速开始

### 1. 安装依赖

```bash
cd productionAgent
npm install --legacy-peer-deps
```

### 2. 配置环境变量

在 `productionAgent` 目录下创建 `.env` 文件：

```env
DASHSCOPE_API_KEY=your_api_key_here
```

### 3. 准备知识库（可选）

知识库用于 RAG（检索增强生成）功能。如果不需要知识库检索，可跳过此步骤。

#### 添加文档

将你的文档放入 `knowledge_base/` 目录：
- 支持格式：`.txt`、`.md`、`.pdf`、`.epub`
- 建议至少 3-5 个文档

#### 构建向量库

```bash
# 首次构建
npm run build:rag

# 强制重建（删除旧的）
npm run rebuild:rag
```

**注意**：
- 向量库会保存在 `vector_db/` 目录
- 系统会自动检测：如果向量库不存在，首次运行时会自动构建
- 如果知识库目录为空，程序会提示但不影响其他功能

### 4. 运行演示

```bash
# 方式1: 使用 npm scripts（推荐）
npm start              # 完整演示（Skill + 客服场景）
npm run dev            # 客服场景演示（默认，推荐新手）
npm run demo:full      # 完整演示
npm run demo:customer  # 仅客服场景
npm run demo:skill     # 仅 Skill 能力演示

# 方式2: 直接运行
node index.js          # 完整演示
node index.js customer # 仅客服场景
node index.js skill    # 仅 Skill 演示
```

## 📚 学习路径

### 1. 从基础开始
- `config.js` - 理解配置项
- `llm.js` - 理解 LLM 初始化
- `data/mockDatabase.js` - 查看模拟数据

### 2. 理解工具层
- `tools/order.js` - 订单查询工具
- `tools/user.js` - 用户查询工具
- `tools/refund.js` - 退款工具
- `tools/points.js` - 积分计算工具
- `tools/knowledge.js` - 知识库检索

### 3. 理解技能层
- `skills/completeRefund.js` - 看它如何组合多个工具
- `skills/vipService.js` - 看它如何实现复杂业务逻辑
- 其他 skills - 学习不同的业务场景

### 4. 理解核心逻辑
- `agent/ProductionAgent.js` - Agent 如何解析和调度工具/技能

### 5. 运行演示
- `demos/` - 查看各种使用场景

## ✨ 优势

与原 `productionAgent.js` 相比：

| 特性 | 单文件版本 | 模块化版本 |
|------|-----------|-----------|
| 代码行数 | 1055 行 | 每个文件 < 100 行 |
| 可读性 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 可维护性 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 学习曲线 | 陡峭 | 平缓 |
| 可扩展性 | 困难 | 简单 |
| 代码复用 | 困难 | 容易 |
| 测试友好 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## 🔧 如何添加新功能

### ✨ 元数据驱动架构

本项目采用**元数据驱动**的设计，添加新功能时无需修改 Agent 核心代码，系统提示会**自动生成**。

### 添加新工具（Tool）

1. 在 `tools/` 创建新文件，如 `shipping.js`
2. 导出异步函数
3. 在 `tools/index.js` 的 `TOOL_DEFINITIONS` 中注册元数据：

```javascript
{
  name: "query_shipping",
  func: queryShipping,
  description: "查询物流信息",
  params: [
    { name: "订单号", type: "string", example: "ORD001" }
  ],
  example: 'query_shipping("ORD001")',
}
```

**完成！** 系统提示会自动更新，无需修改 `ProductionAgent.js`

### 添加新技能（Skill）

1. 在 `skills/` 创建新文件，如 `orderTracking.js`
2. 导入需要的工具，实现业务流程
3. 在 `skills/index.js` 的 `SKILL_DEFINITIONS` 中注册元数据：

```javascript
{
  name: "order_tracking",
  func: skillOrderTracking,
  description: "订单追踪",
  functionality: "自动完成 订单查询→物流查询 全流程",
  params: [
    { name: "订单号", type: "string", example: "ORD001" },
    { name: "用户名", type: "string", example: "小明" }
  ],
  example: 'order_tracking("ORD001", "小明")',
}
```

**完成！** 技能说明会自动添加到系统提示

### 详细教程

查看 [如何添加工具和技能](./docs/HOW_TO_ADD_TOOLS_SKILLS.md) 完整文档，包含：
- 完整示例代码
- 元数据字段说明
- 最佳实践
- 测试方法

### 其他功能

**添加新演示**：
1. 在 `demos/` 创建新文件
2. 实现演示逻辑
3. 在 `index.js` 中引入和调用

**更新知识库**：
1. 添加文档到 `knowledge_base/` 目录
2. 运行 `npm run rebuild:rag` 重建向量库
3. 或删除 `vector_db/` 目录，下次运行时自动构建

## 💡 核心能力

- ✅ 原生消息数组（节省 30-40% token）
- ✅ **智能 RAG 系统**（自动检测和构建向量数据库）
- ✅ RAG 知识检索（基于 FAISS 向量数据库）
- ✅ 基础工具调用（订单、用户、退款、积分、知识库）
- ✅ 高级技能系统（完整退款、VIP服务、智能推荐、投诉处理、数据分析）
- ✅ **多策略上下文管理**（trim / summarize / vector / hybrid）
- ✅ 流式输出（实时响应）
- ✅ 对话记忆（支持上下文理解）
- ✅ 智能能力路由（自动选择 Tool 或 Skill）
- ✅ **元数据驱动架构**（自动生成系统提示）
- ✅ 完整错误处理
- ✅ 多文档格式支持（.txt / .md / .pdf / .epub）
