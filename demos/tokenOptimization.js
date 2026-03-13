// ========== 示例：Token 优化对比 ==========

import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

export async function tokenOptimizationDemo() {
  console.log("\n" + "=".repeat(70));
  console.log("💰 Token 优化演示");
  console.log("=".repeat(70) + "\n");

  console.log("场景：10 轮对话");
  console.log("\n方案1：不剪裁（所有历史都保留）");
  
  const messagesNoTrim = [new SystemMessage("你是助手")];
  for (let i = 1; i <= 10; i++) {
    messagesNoTrim.push(new HumanMessage(`消息 ${i}`));
    messagesNoTrim.push(new AIMessage(`回复 ${i}`));
  }
  
  console.log(`- 消息数: ${messagesNoTrim.length}`);
  console.log(`- 估算 token: ~${messagesNoTrim.length * 20} tokens`);

  console.log("\n方案2：保留最近 6 轮（剪裁后）");
  
  function trimToRecent(messages, maxPairs = 6) {
    const system = messages.filter(m => m._getType() === 'system');
    const conversation = messages.filter(m => m._getType() !== 'system');
    const recent = conversation.slice(-maxPairs * 2);
    return [...system, ...recent];
  }
  
  const messagesTrimmed = trimToRecent(messagesNoTrim, 3);
  
  console.log(`- 消息数: ${messagesTrimmed.length}`);
  console.log(`- 估算 token: ~${messagesTrimmed.length * 20} tokens`);
  console.log(`- 节省: ${messagesNoTrim.length - messagesTrimmed.length} 条消息`);
  console.log(`- 节省比例: ${Math.round((1 - messagesTrimmed.length / messagesNoTrim.length) * 100)}%`);

  console.log("\n💡 结论：");
  console.log("- 短对话：不需要剪裁");
  console.log("- 中等对话（10-20轮）：保留最近 5-10 轮");
  console.log("- 长对话（>20轮）：使用摘要或向量检索");
}
