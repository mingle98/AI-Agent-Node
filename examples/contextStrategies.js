// ========== 上下文管理策略对比演示 ==========

import { createLLM, createEmbeddings } from '../llm.js';
import { ProductionAgent } from '../agent/ProductionAgent.js';

async function testStrategy(strategyName, llm, embeddings) {
  console.log("\n" + "=".repeat(70));
  console.log(`🧪 测试策略: ${strategyName}`);
  console.log("=".repeat(70) + "\n");

  // 创建 Agent
  const agent = new ProductionAgent(llm, null, embeddings, {
    contextStrategy: strategyName,
    maxHistoryMessages: 6,     // 设置较小的值以触发上下文管理
    keepRecentMessages: 3,      // 保留最近3条对话
  });

  // 模拟长对话（超过 maxHistoryMessages）
  const conversations = [
    "你好，我想查询订单 ORD001 的状态",
    "我想知道我的会员信息，我叫小明",
    "如果我买一台5999元的手机，能获得多少积分？",
    "我要退掉订单 ORD003，商品有质量问题",
    "我是VIP会员，想了解我的会员权益",
    "根据我的购买历史，给我推荐一些商品",
    "我刚才查询的第一个订单号是多少？", // 测试能否记住早期信息
  ];

  for (let i = 0; i < conversations.length; i++) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`💬 第 ${i + 1} 轮对话`);
    console.log("─".repeat(70) + "\n");
    
    try {
      await agent.chat(conversations[i]);
      
      // 显示当前消息数
      console.log(`  📊 当前消息数: ${agent.messages.length}`);
      
    } catch (error) {
      console.error(`❌ 错误: ${error.message}`);
    }

    // 每轮对话后暂停
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(70));
  console.log(`✅ ${strategyName} 策略测试完成`);
  console.log("=".repeat(70) + "\n");
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔬 上下文管理策略对比演示");
  console.log("=".repeat(70));
  console.log("\n本演示将测试 4 种不同的上下文管理策略：");
  console.log("1. trim - 简单剪裁（快速，但会丢失信息）");
  console.log("2. summarize - 摘要压缩（保留语义，消耗 token）");
  console.log("3. vector - 向量检索（智能检索，计算开销大）");
  console.log("4. hybrid - 混合策略（摘要+检索，效果最好）\n");

  const llm = createLLM();
  const embeddings = createEmbeddings();

  // 测试各种策略
  const strategies = ['trim', 'summarize', 'vector', 'hybrid'];
  
  for (const strategy of strategies) {
    await testStrategy(strategy, llm, embeddings);
    
    // 策略之间暂停
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("\n" + "=".repeat(70));
  console.log("📊 策略对比总结");
  console.log("=".repeat(70));
  
  console.log("\n🎯 各策略特点：");
  console.log("\n1️⃣  trim（剪裁）");
  console.log("   优点：速度快，不消耗额外 token");
  console.log("   缺点：丢失早期信息");
  console.log("   适用：短对话、不需要长期记忆");
  
  console.log("\n2️⃣  summarize（摘要）");
  console.log("   优点：保留关键信息，不丢失语义");
  console.log("   缺点：消耗额外 token，速度较慢");
  console.log("   适用：需要保留历史上下文的场景");
  
  console.log("\n3️⃣  vector（向量检索）");
  console.log("   优点：智能检索最相关的历史");
  console.log("   缺点：需要向量库，计算开销大");
  console.log("   适用：多轮对话，需要动态上下文");
  
  console.log("\n4️⃣  hybrid（混合）");
  console.log("   优点：结合摘要和检索，效果最好");
  console.log("   缺点：计算开销最大");
  console.log("   适用：复杂场景，对质量要求高");
  
  console.log("\n💡 使用建议：");
  console.log("  - 默认使用 trim（快速、节省成本）");
  console.log("  - 重要对话使用 summarize（保留信息）");
  console.log("  - 多主题对话使用 vector（智能检索）");
  console.log("  - 关键业务使用 hybrid（最佳效果）\n");
}

main().catch(console.error);
