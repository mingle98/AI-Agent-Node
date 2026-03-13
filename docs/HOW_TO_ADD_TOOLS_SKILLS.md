# 🔧 如何添加新工具和技能

本文档介绍如何在模块化 Agent 中添加新的工具（Tool）和技能（Skill）。

## 📋 目录

- [添加新工具（Tool）](#添加新工具tool)
- [添加新技能（Skill）](#添加新技能skill)
- [元数据说明](#元数据说明)
- [完整示例](#完整示例)

---

## 添加新工具（Tool）

工具是**单一职责**的原子操作，例如查询、计算等。

### 步骤 1：创建工具文件

在 `tools/` 目录下创建新文件，例如 `shipping.js`：

```javascript
// tools/shipping.js
import { mockDatabase } from '../data/mockDatabase.js';

export async function queryShipping(orderId) {
  console.log(`\n  🔧 [工具调用] 查询物流: ${orderId}`);
  
  // 模拟物流查询
  const logistics = {
    "ORD001": {
      status: "运输中",
      location: "北京分拨中心",
      estimatedArrival: "2024-03-15",
      courierPhone: "400-123-4567"
    }
  };
  
  const info = logistics[orderId];
  if (!info) {
    return `未找到订单 ${orderId} 的物流信息`;
  }
  
  return JSON.stringify({
    订单号: orderId,
    物流状态: info.status,
    当前位置: info.location,
    预计送达: info.estimatedArrival,
    快递电话: info.courierPhone,
  }, null, 2);
}
```

### 步骤 2：在 `tools/index.js` 中注册

```javascript
// tools/index.js
import { queryShipping } from './shipping.js';

export const TOOL_DEFINITIONS = [
  // ... 其他工具 ...
  
  // ✅ 添加新工具
  {
    name: "query_shipping",
    func: queryShipping,
    description: "查询物流信息",
    params: [
      { name: "订单号", type: "string", example: "ORD001" }
    ],
    example: 'query_shipping("ORD001")',
  },
];
```

### ✅ 完成！

无需修改 `ProductionAgent.js`，系统会**自动**：
- 在系统提示中添加工具说明
- 注册工具调用函数
- 生成使用示例

---

## 添加新技能（Skill）

技能是**组合能力**，自动执行多步骤业务流程。

### 步骤 1：创建技能文件

在 `skills/` 目录下创建新文件，例如 `orderTracking.js`：

```javascript
// skills/orderTracking.js
import { queryOrder } from '../tools/order.js';
import { queryShipping } from '../tools/shipping.js';

export async function skillOrderTracking(orderId, userName) {
  console.log(`\n  🎯 [Skill调用] 订单追踪`);
  console.log(`  参数: 订单=${orderId}, 用户=${userName}\n`);
  
  const steps = [];
  
  // Step 1: 查询订单信息
  console.log(`  📋 步骤1/2: 查询订单...`);
  const orderInfo = await queryOrder(orderId);
  steps.push(`订单信息:\n${orderInfo}`);
  
  // Step 2: 查询物流信息
  console.log(`  📋 步骤2/2: 查询物流...`);
  const shippingInfo = await queryShipping(orderId);
  steps.push(`物流信息:\n${shippingInfo}`);
  
  return `【订单追踪完成】\n\n${steps.join('\n\n')}`;
}
```

### 步骤 2：在 `skills/index.js` 中注册

```javascript
// skills/index.js
import { skillOrderTracking } from './orderTracking.js';

export const SKILL_DEFINITIONS = [
  // ... 其他技能 ...
  
  // ✅ 添加新技能
  {
    name: "order_tracking",
    func: skillOrderTracking,
    description: "订单追踪（订单+物流）",
    functionality: "自动完成 订单查询→物流查询 全流程",
    params: [
      { name: "订单号", type: "string", example: "ORD001" },
      { name: "用户名", type: "string", example: "小明" }
    ],
    example: 'order_tracking("ORD001", "小明")',
  },
];
```

### ✅ 完成！

系统会**自动**：
- 在系统提示中添加技能说明
- 生成功能描述和示例
- 注册技能调用函数

---

## 元数据说明

### Tool 元数据字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 工具名称（唯一标识） |
| `func` | function | ✅ | 工具函数 |
| `description` | string | ✅ | 工具描述 |
| `params` | array | ✅ | 参数列表 |
| `example` | string | ✅ | 调用示例 |
| `special` | boolean | ❌ | 是否为特殊工具（如需要 vectorStore） |

### Skill 元数据字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 技能名称（唯一标识） |
| `func` | function | ✅ | 技能函数 |
| `description` | string | ✅ | 技能描述 |
| `functionality` | string | ✅ | 功能说明（流程描述） |
| `params` | array | ✅ | 参数列表 |
| `example` | string | ✅ | 调用示例 |

### Param 参数字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | 参数名称 |
| `type` | string | ✅ | 参数类型（string/number/boolean） |
| `example` | string | ✅ | 示例值 |
| `options` | array | ❌ | 可选值列表（枚举） |

---

## 完整示例

### 示例 1：添加"发送邮件"工具

**1. 创建工具文件** `tools/email.js`：

```javascript
export async function sendEmail(to, subject, content) {
  console.log(`\n  🔧 [工具调用] 发送邮件: ${to}`);
  // 模拟发送邮件
  return `邮件已发送至 ${to}\n主题: ${subject}\n内容: ${content}`;
}
```

**2. 注册工具** `tools/index.js`：

```javascript
import { sendEmail } from './email.js';

export const TOOL_DEFINITIONS = [
  // ... 其他工具 ...
  {
    name: "send_email",
    func: sendEmail,
    description: "发送电子邮件",
    params: [
      { name: "收件人", type: "string", example: "user@example.com" },
      { name: "主题", type: "string", example: "订单确认" },
      { name: "内容", type: "string", example: "您的订单已确认..." }
    ],
    example: 'send_email("user@example.com", "订单确认", "您的订单已确认...")',
  },
];
```

### 示例 2：添加"批量处理订单"技能

**1. 创建技能文件** `skills/batchOrder.js`：

```javascript
import { queryOrder } from '../tools/order.js';

export async function skillBatchOrderProcessing(orderIds) {
  console.log(`\n  🎯 [Skill调用] 批量处理订单`);
  
  const results = [];
  for (const orderId of orderIds) {
    const info = await queryOrder(orderId);
    results.push(info);
  }
  
  return `【批量处理完成】\n共处理 ${orderIds.length} 个订单\n\n${results.join('\n\n')}`;
}
```

**2. 注册技能** `skills/index.js`：

```javascript
import { skillBatchOrderProcessing } from './batchOrder.js';

export const SKILL_DEFINITIONS = [
  // ... 其他技能 ...
  {
    name: "batch_order_processing",
    func: skillBatchOrderProcessing,
    description: "批量处理订单",
    functionality: "批量查询多个订单并汇总结果",
    params: [
      { name: "订单号列表", type: "array", example: '["ORD001", "ORD002"]' }
    ],
    example: 'batch_order_processing(["ORD001", "ORD002"])',
  },
];
```

---

## 🎯 最佳实践

### 1. 命名规范

- **工具名**：使用动词，如 `query_order`、`send_email`
- **技能名**：使用名词短语，如 `complete_refund`、`order_tracking`
- **函数名**：工具用动词，技能加 `skill` 前缀

### 2. 单一职责

- **Tool**：只做一件事，可复用
- **Skill**：组合多个 Tools，实现业务流程

### 3. 错误处理

```javascript
export async function queryOrder(orderId) {
  try {
    // 业务逻辑
    const order = await database.getOrder(orderId);
    if (!order) {
      return `未找到订单 ${orderId}`;
    }
    return JSON.stringify(order);
  } catch (error) {
    return `查询订单失败: ${error.message}`;
  }
}
```

### 4. 日志输出

```javascript
export async function skillCompleteRefund(orderId, reason, userName) {
  console.log(`\n  🎯 [Skill调用] 完整退款流程`);
  console.log(`  参数: 订单=${orderId}, 原因=${reason}, 用户=${userName}\n`);
  
  console.log(`  📋 步骤1/4: 验证订单...`);
  // ...
  
  console.log(`  📋 步骤2/4: 查询用户...`);
  // ...
}
```

### 5. 返回格式

建议返回 **JSON 字符串**或**结构化文本**：

```javascript
// ✅ 推荐：JSON 格式
return JSON.stringify({
  订单号: "ORD001",
  状态: "已发货",
}, null, 2);

// ✅ 推荐：结构化文本
return `【退款完成】
订单号: ORD001
退款金额: ¥5999
预计到账: 3-5个工作日`;

// ❌ 不推荐：纯文本
return "退款成功";
```

---

## 🚀 测试新功能

添加完成后，运行测试：

```bash
npm run dev
```

在对话中测试新工具/技能：

```
👤 用户: 帮我查询订单 ORD001 的物流
🤖 助手: TOOL_CALL: query_shipping("ORD001")
```

---

## 📚 相关文档

- [README.md](../README.md) - 项目总览
- [promptBuilder.js](../agent/promptBuilder.js) - 系统提示构建器
- [tools/index.js](../tools/index.js) - 工具注册表
- [skills/index.js](../skills/index.js) - 技能注册表

---

## 💡 小提示

- 添加新功能无需修改 `ProductionAgent.js`
- 系统提示会自动更新
- 建议先添加 Tool，再组合成 Skill
- 使用 `debug: true` 选项查看生成的系统提示

```javascript
const agent = new ProductionAgent(llm, vectorStore, { debug: true });
```
