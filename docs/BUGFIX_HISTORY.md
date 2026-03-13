# 🐛 Bug 修复历史

记录项目中发现和修复的重要 bug。

---

## v1.3.1 - SystemMessage 累积问题

### 问题描述

在使用上下文管理策略（summarize/vector/hybrid）时，每次压缩都会添加新的 SystemMessage，但旧的 SystemMessage 没有被清理，导致：

```javascript
// 第1次压缩后
[
  SystemMessage("原始系统提示"),
  SystemMessage("摘要1"),
  ...最近对话
]

// 第2次压缩后
[
  SystemMessage("原始系统提示"),
  SystemMessage("摘要1"),  // ❌ 旧摘要应该被移除
  SystemMessage("摘要2"),
  ...最近对话
]

// 第3次压缩后
[
  SystemMessage("原始系统提示"),
  SystemMessage("摘要1"),  // ❌ 旧摘要应该被移除
  SystemMessage("摘要2"),  // ❌ 旧摘要应该被移除
  SystemMessage("摘要3"),
  ...最近对话
]
```

### 影响

1. **Token 浪费**：累积的 SystemMessage 占用大量 token
2. **信息冲突**：多个摘要可能包含过时或冲突的信息
3. **性能下降**：消息数量增加，处理速度变慢
4. **成本增加**：更多 token 意味着更高的 API 费用

### 根本原因

在 `contextManager.js` 的所有策略方法中，使用了：

```javascript
const systemMessages = messages.filter(m => m._getType() === 'system');
const result = [...systemMessages, ...recentMessages];
```

这会保留**所有** SystemMessage，而不是只保留原始的那个。

### 修复方案

修改所有策略方法，只保留第一个 SystemMessage（原始系统提示）：

```javascript
// 修复前
const systemMessages = messages.filter(m => m._getType() === 'system');
const result = [...systemMessages, contextMessage, ...recentMessages];

// 修复后
const firstSystemMessage = messages.find(m => m._getType() === 'system');
const result = [firstSystemMessage, contextMessage, ...recentMessages];
```

### 修改文件

- `agent/contextManager.js`
  - `trimStrategy()` - 第 70-79 行
  - `summarizeStrategy()` - 第 87-113 行
  - `vectorStrategy()` - 第 121-170 行
  - `hybridStrategy()` - 第 179-228 行

### 修复后效果

```javascript
// 第1次压缩后
[
  SystemMessage("原始系统提示"),
  SystemMessage("摘要1"),
  ...最近对话
]

// 第2次压缩后
[
  SystemMessage("原始系统提示"),  // ✅ 保留原始提示
  SystemMessage("最新摘要"),       // ✅ 只有最新摘要
  ...最近对话
]

// 第3次压缩后
[
  SystemMessage("原始系统提示"),  // ✅ 保留原始提示
  SystemMessage("最新摘要"),       // ✅ 只有最新摘要
  ...最近对话
]
```

### 测试验证

运行以下命令验证修复：

```bash
# 测试基本功能
npm run dev

# 测试所有上下文策略
node examples/contextStrategies.js
```

检查输出日志中的"历史上下文"部分，确保只有两个 SystemMessage：
1. 原始的 Agent 系统提示
2. 当前压缩生成的上下文 SystemMessage

### 学习要点

1. **状态管理**：需要明确区分"初始状态"和"临时状态"
2. **消息类型**：SystemMessage 有多种用途，需要正确识别和处理
3. **测试用例**：应该添加多轮对话的测试，检查消息累积
4. **日志输出**：详细的日志帮助快速定位问题

### 预防措施

为避免类似问题：

1. **单元测试**：添加测试用例验证消息列表的长度和内容
2. **代码审查**：在修改上下文管理逻辑时，仔细检查消息过滤逻辑
3. **文档说明**：在代码中添加注释，说明为什么要用 `find()` 而不是 `filter()`
4. **监控告警**：生产环境中监控消息数量，异常增长时告警

---

## 如何报告 Bug

如果你发现了新的 bug，请：

1. 在 GitHub Issues 中提交问题
2. 提供详细的复现步骤
3. 附上错误日志和截图
4. 说明你的环境（Node 版本、依赖版本等）

感谢你帮助改进 Production Agent！
