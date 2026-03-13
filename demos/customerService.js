// ========== 示例场景：客服对话 ==========

import { ProductionAgent } from '../agent/ProductionAgent.js';

export async function customerServiceDemo(llm, vectorStore, embeddings, runtimeOptions = {}) {
  console.log("\n" + "=".repeat(70));
  console.log("🏪 生产级场景：智能电商客服助手（增强版 - 支持 Skill）");
  console.log("=".repeat(70));
  console.log("\n功能演示：");
  console.log("✅ RAG 知识库检索（退货政策、常见问题）");
  console.log("✅ 基础工具：订单查询、用户查询、退款申请、积分计算");
  console.log("✅ 高级技能：完整退款流程、VIP服务、智能推荐、投诉处理、数据分析");
  console.log("✅ 上下文自动剪裁");
  console.log("✅ 流式输出\n");

  // 创建 Agent（使用默认的 trim 策略）
  const agent = new ProductionAgent(llm, vectorStore, embeddings, {
    contextStrategy: 'trim',  // 可选：trim, summarize, vector, hybrid
    ...runtimeOptions,
  });

  // 模拟真实客服对话场景（包含 Tool 和 Skill）
  const conversations = [
    // ========== 基础工具测试 ==========
    // 场景1: 简单查询订单（Tool）
    "你好，我想查询订单 ORD001 的状态",
    
    // 场景2: 查询用户信息（Tool）
    "我想知道我的会员信息，我叫小明",
    
    // 场景3: 计算积分（Tool）
    "如果我买一台5999元的手机，能获得多少积分？",
    
    // ========== 高级技能测试 ==========
    // 场景4: 完整退款流程（Skill - 组合多个步骤）
    "我要退掉订单 ORD003，商品有质量问题，我是小明",
    
    // 场景5: VIP会员服务（Skill）
    "我是VIP会员小明，想了解我的会员权益",
    
    // 场景6: 智能推荐（Skill）
    "根据我的购买历史，给我推荐一些商品吧",
    
    // 场景7: 投诉处理（Skill）
    "我要投诉订单 ORD002，配送太慢了，我是小红",
    
    // 场景8: 数据分析（Skill）
    "帮我生成一份订单统计分析报告",
    
    // 场景9: 知识库查询（Tool + RAG）
    "你们的退货政策是什么？",
    
    // 场景10: 上下文记忆测试
    "我刚才查询的第一个订单号是多少？",
  ];

  console.log("=".repeat(70));
  console.log("开始对话...\n");

  for (let i = 0; i < conversations.length; i++) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`💬 第 ${i + 1} 轮对话`);
    console.log("─".repeat(70) + "\n");
    
    try {
      await agent.chat(conversations[i], (chunk) => {
        process.stdout.write(chunk.content);
      }, (fullResponse) => {
        console.log('=================🧧完整响应===============:', fullResponse);
      });
    } catch (error) {
      console.error(`❌ 错误: ${error.message}`);
    }

    // 每3轮对话显示统计信息
    if ((i + 1) % 3 === 0) {
      const stats = agent.getStats();
      console.log(`\n📊 当前统计: ${stats.conversationRounds} 轮对话, ${stats.totalMessages} 条消息`);
    }
  }

  // 最终统计
  console.log("\n" + "=".repeat(70));
  console.log("📊 最终统计");
  console.log("=".repeat(70));
  const finalStats = agent.getStats();
  console.log(`总对话轮次: ${finalStats.conversationRounds}`);
  console.log(`总消息数: ${finalStats.totalMessages}`);
  console.log(`用户消息: ${finalStats.userMessages}`);
  console.log(`助手消息: ${finalStats.aiMessages}`);
  
  console.log("\n" + "=".repeat(70));
  console.log("🎯 Tool vs Skill 对比总结");
  console.log("=".repeat(70));
  console.log("\n📎 基础工具 (Tool):");
  console.log("  - 单一功能，执行一个操作");
  console.log("  - 例如：query_order() 只查询订单");
  console.log("  - 适合：简单、独立的查询和操作");
  
  console.log("\n🎯 高级技能 (Skill):");
  console.log("  - 组合能力，自动执行多步骤流程");
  console.log("  - 例如：complete_refund() = 查询订单 + 查询用户 + 退款 + 积分");
  console.log("  - 适合：复杂业务流程、需要多步协作的场景");
  
  console.log("\n💡 实际应用价值:");
  console.log("  ✅ 提升用户体验：一次调用完成复杂流程");
  console.log("  ✅ 减少对话轮次：避免多轮交互");
  console.log("  ✅ 业务逻辑封装：复杂流程统一管理");
  console.log("  ✅ 智能决策：Agent 自动选择最合适的能力");
}
