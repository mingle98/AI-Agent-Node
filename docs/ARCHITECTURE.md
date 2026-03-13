# 🏗️ 架构设计文档

## 📋 目录

- [总体架构](#总体架构)
- [元数据驱动设计](#元数据驱动设计)
- [三层架构](#三层架构)
- [系统提示生成](#系统提示生成)
- [扩展性设计](#扩展性设计)

---

## 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户输入                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   ProductionAgent                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │  系统提示（自动生成）                              │    │
│  │  - 工具列表（从 TOOL_DEFINITIONS 提取）           │    │
│  │  - 技能列表（从 SKILL_DEFINITIONS 提取）          │    │
│  │  - 使用规则                                        │    │
│  │  - 决策示例                                        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │  对话管理                                          │    │
│  │  - 消息历史（自动剪裁）                           │    │
│  │  - 上下文管理                                      │    │
│  │  - 流式输出                                        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │  能力调度                                          │    │
│  │  - 解析工具/技能调用                              │    │
│  │  - 执行函数                                        │    │
│  │  - 返回结果                                        │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────┬───────────────────┬──────────────────────────┘
              │                   │
              ▼                   ▼
    ┌─────────────────┐  ┌─────────────────┐
    │   Tool 层       │  │   Skill 层      │
    │  (原子操作)     │  │  (组合流程)    │
    └─────────────────┘  └─────────────────┘
              │                   │
              └───────┬───────────┘
                      ▼
            ┌──────────────────┐
            │   Data 层        │
            │  (模拟数据库)    │
            └──────────────────┘
```

---

## 元数据驱动设计

### 核心理念

**单一数据源（Single Source of Truth）**
- 工具/技能的描述定义在**一个地方**
- 系统提示**自动生成**，无需手动维护
- 添加功能时只需修改元数据，无需改 Agent 代码

### 元数据结构

#### Tool 元数据

```javascript
{
  name: "query_order",           // 唯一标识
  func: queryOrder,              // 函数引用
  description: "查询订单信息",   // 功能描述
  params: [                      // 参数定义
    {
      name: "订单号",
      type: "string",
      example: "ORD001"
    }
  ],
  example: 'query_order("ORD001")',  // 调用示例
}
```

#### Skill 元数据

```javascript
{
  name: "complete_refund",
  func: skillCompleteRefund,
  description: "完整退款处理流程",
  functionality: "自动完成 订单验证→用户查询→退款申请→积分返还 全流程",
  params: [
    { name: "订单号", type: "string", example: "ORD001" },
    { name: "退款原因", type: "string", example: "质量问题" },
    { name: "用户名", type: "string", example: "小明" }
  ],
  example: 'complete_refund("ORD001", "质量问题", "小明")',
}
```

### 优势对比

| 特性 | 传统方式 | 元数据驱动 |
|------|----------|------------|
| 添加工具步骤 | 5 步 | 3 步 |
| 添加技能步骤 | 6 步 | 3 步 |
| 修改 Agent 代码 | ✅ 需要 | ❌ 不需要 |
| 系统提示维护 | 🔧 手动 | ✅ 自动 |
| 代码一致性 | ⚠️ 易出错 | ✅ 保证 |
| 可扩展性 | ⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 三层架构

### 1️⃣ Tool 层（工具层）

**定位**：原子操作，单一职责

**特点**：
- 每个工具只做一件事
- 可独立使用
- 可复用

**示例**：
```javascript
// 查询订单（单一功能）
async function queryOrder(orderId) {
  const order = database.orders[orderId];
  return JSON.stringify(order);
}
```

### 2️⃣ Skill 层（技能层）

**定位**：业务流程，组合能力

**特点**：
- 组合多个 Tools
- 实现完整业务流程
- 自动化多步操作

**示例**：
```javascript
// 完整退款流程（组合能力）
async function skillCompleteRefund(orderId, reason, userName) {
  // Step 1: 查询订单
  const orderInfo = await queryOrder(orderId);
  
  // Step 2: 查询用户
  const userInfo = await queryUser(userName);
  
  // Step 3: 申请退款
  const refundResult = await applyRefund(orderId, reason);
  
  // Step 4: 计算积分返还
  // ...
  
  return result;
}
```

### 3️⃣ Agent 层（智能层）

**定位**：意图识别，能力调度

**特点**：
- 理解用户需求
- 选择合适的工具/技能
- 管理对话上下文
- 自主决策

**流程**：
```
用户输入 → 理解意图 → 选择能力 → 执行 → 返回结果
```

---

## 系统提示生成

### 生成流程

```javascript
buildSystemPrompt(toolDefinitions, skillDefinitions, options)
  │
  ├─→ buildToolsSection()      // 生成工具列表
  │
  ├─→ buildSkillsSection()     // 生成技能列表
  │
  ├─→ buildRulesSection()      // 生成使用规则
  │
  └─→ buildExamplesSection()   // 生成决策示例
```

### 生成示例

**输入（元数据）**：
```javascript
{
  name: "query_order",
  func: queryOrder,
  description: "查询订单信息",
  params: [{ name: "订单号", type: "string", example: "ORD001" }],
  example: 'query_order("ORD001")',
}
```

**输出（系统提示）**：
```
1. query_order(订单号) - 查询订单信息
   示例：query_order("ORD001")
```

### 动态更新

```javascript
// 添加新工具
TOOL_DEFINITIONS.push({
  name: "query_shipping",
  func: queryShipping,
  description: "查询物流信息",
  params: [{ name: "订单号", type: "string", example: "ORD001" }],
  example: 'query_shipping("ORD001")',
});

// ✅ 系统提示自动包含新工具
```

---

## 扩展性设计

### 1. 水平扩展（添加功能）

**添加新工具**：
```javascript
// 1. 创建工具文件
export async function queryShipping(orderId) { ... }

// 2. 注册元数据
TOOL_DEFINITIONS.push({
  name: "query_shipping",
  func: queryShipping,
  ...
});

// ✅ 完成！系统提示自动更新
```

**添加新技能**：
```javascript
// 1. 创建技能文件
export async function skillOrderTracking(...) { ... }

// 2. 注册元数据
SKILL_DEFINITIONS.push({
  name: "order_tracking",
  func: skillOrderTracking,
  ...
});

// ✅ 完成！系统提示自动更新
```

### 2. 垂直扩展（定制化）

**自定义角色**：
```javascript
const agent = new ProductionAgent(llm, vectorStore, {
  roleName: "医疗助手",
  roleDescription: "可以帮助患者预约挂号、查询病历",
});
```

**自定义提示构建**：
```javascript
// 可以扩展 promptBuilder.js
function buildCustomPrompt(toolDefs, skillDefs, options) {
  // 自定义逻辑
  return customPrompt;
}
```

### 3. 模块化扩展

**工具分组**：
```javascript
// tools/order/index.js - 订单相关工具
// tools/user/index.js - 用户相关工具
// tools/payment/index.js - 支付相关工具
```

**技能分类**：
```javascript
// skills/customer/index.js - 客服技能
// skills/sales/index.js - 销售技能
// skills/analytics/index.js - 分析技能
```

---

## 设计模式

### 1. 策略模式（Strategy Pattern）

工具和技能都是可替换的策略：

```javascript
// 工具策略
const TOOLS = {
  query_order: queryOrder,
  query_user: queryUser,
  // 可以动态替换实现
};

// 根据名称调用
const tool = TOOLS[toolName];
const result = await tool(...args);
```

### 2. 建造者模式（Builder Pattern）

系统提示的构建：

```javascript
buildSystemPrompt()
  .withTools(toolDefinitions)
  .withSkills(skillDefinitions)
  .withRules()
  .withExamples()
  .build();
```

### 3. 注册表模式（Registry Pattern）

工具和技能的注册：

```javascript
// 注册表
const TOOL_DEFINITIONS = [];
const SKILL_DEFINITIONS = [];

// 注册
TOOL_DEFINITIONS.push(toolMetadata);

// 查找
const tool = TOOL_DEFINITIONS.find(t => t.name === 'query_order');
```

---

## 最佳实践

### 1. 命名规范

- **工具**：`query_order`, `send_email` (动词 + 名词)
- **技能**：`complete_refund`, `order_tracking` (名词短语)
- **函数**：`queryOrder`, `skillCompleteRefund`

### 2. 单一职责

```javascript
// ✅ 好：单一职责
async function queryOrder(orderId) {
  return database.getOrder(orderId);
}

// ❌ 不好：混合职责
async function queryOrderAndSendEmail(orderId, email) {
  const order = database.getOrder(orderId);
  await sendEmail(email, order);
  return order;
}
```

### 3. 错误处理

```javascript
// ✅ 统一的错误格式
try {
  const result = await tool(...args);
  return result;
} catch (error) {
  return `工具执行错误: ${error.message}`;
}
```

### 4. 日志规范

```javascript
console.log(`\n  🔧 [工具调用] ${toolName}: ${args.join(', ')}`);
console.log(`\n  🎯 [Skill调用] ${skillName}`);
console.log(`  📋 步骤1/3: ${stepDescription}...`);
console.log(`  ✅ 执行完成\n`);
```

---

## 性能优化

### 1. 懒加载

```javascript
// 只在需要时加载大型依赖
const largeDependency = await import('./largeDependency.js');
```

### 2. 缓存

```javascript
// 缓存频繁访问的数据
const cache = new Map();
if (cache.has(key)) {
  return cache.get(key);
}
```

### 3. 上下文剪裁

```javascript
// 自动剪裁历史消息
if (this.messages.length > CONFIG.maxHistoryMessages) {
  this.trimHistory();
}
```

---

## 安全考虑

### 1. 输入验证

```javascript
async function queryOrder(orderId) {
  // 验证订单号格式
  if (!/^ORD\d+$/.test(orderId)) {
    return "订单号格式错误";
  }
  // ...
}
```

### 2. 权限控制

```javascript
async function skillVipService(userName) {
  const user = await queryUser(userName);
  if (!user.vip) {
    return "该服务仅对 VIP 用户开放";
  }
  // ...
}
```

### 3. 速率限制

```javascript
// 防止滥用
const rateLimiter = new Map();
if (rateLimiter.get(userId) > 100) {
  return "请求过于频繁，请稍后再试";
}
```

---

## 测试策略

### 1. 单元测试

```javascript
// 测试单个工具
test('queryOrder should return order info', async () => {
  const result = await queryOrder('ORD001');
  expect(result).toContain('iPhone 15');
});
```

### 2. 集成测试

```javascript
// 测试技能流程
test('complete_refund should execute full flow', async () => {
  const result = await skillCompleteRefund('ORD001', '质量问题', '小明');
  expect(result).toContain('退款申请成功');
});
```

### 3. 系统测试

```javascript
// 测试完整对话
test('agent should handle refund request', async () => {
  const response = await agent.chat('我要退款');
  expect(response).toContain('退款');
});
```

---

## 相关文档

- [README.md](../README.md) - 项目总览
- [HOW_TO_ADD_TOOLS_SKILLS.md](./HOW_TO_ADD_TOOLS_SKILLS.md) - 添加教程
- [CHANGELOG.md](../CHANGELOG.md) - 更新日志
