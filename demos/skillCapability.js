// ========== Skill 专项演示 ==========

import { ProductionAgent } from '../agent/ProductionAgent.js';

export async function skillCapabilityDemo(llm, vectorStore, embeddings, runtimeOptions = {}) {
  console.log("\n" + "=".repeat(70));
  console.log("🎯 Skill 能力专项演示");
  console.log("=".repeat(70));
  console.log("\n演示目标：展示 Skill（高级技能）如何组合多个 Tool 完成复杂业务流程\n");

  const agent = new ProductionAgent(llm, vectorStore, embeddings, {
    ...runtimeOptions,
  });

  // 专注于展示 Skill 的能力
  const skillTests = [
    {
      category: "🔄 完整退款流程 Skill",
      description: "一次调用完成：订单验证 + 用户查询 + 退款申请 + 积分返还",
      query: "帮我办理订单 ORD001 的退款，质量有问题，我是小明",
    },
    {
      category: "💎 VIP 会员服务 Skill",
      description: "自动分析：会员信息 + 订单历史 + 专属权益报告",
      query: "我是小明，帮我查看 VIP 会员专属服务",
    },
    {
      category: "🤖 智能推荐 Skill",
      description: "基于用户画像和历史，生成个性化推荐",
      query: "根据我的购买记录，推荐适合我的商品，我是小明",
    },
    {
      category: "📢 投诉处理 Skill",
      description: "智能流程：问题评级 + 解决方案 + VIP 加速",
      query: "我要投诉订单 ORD002 配送延迟，我是小红",
    },
    {
      category: "📊 数据分析 Skill",
      description: "生成业务洞察报告",
      query: "生成用户分析报告",
    },
  ];

  for (const test of skillTests) {
    console.log("\n" + "═".repeat(70));
    console.log(test.category);
    console.log("═".repeat(70));
    console.log(`📝 能力说明: ${test.description}\n`);
    
    try {
      await agent.chat(test.query);
    } catch (error) {
      console.error(`❌ 错误: ${error.message}`);
    }
    
    agent.reset(); // 每个测试重置，避免上下文干扰
    
    // 间隔
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(70));
  console.log("✅ Skill 演示完成");
  console.log("=".repeat(70));
  
  console.log("\n🎯 Skill 设计原则总结:");
  console.log("\n1. 📦 封装复杂度");
  console.log("   - 将多步骤操作封装为单一 Skill");
  console.log("   - 用户只需一句话即可触发完整流程");
  
  console.log("\n2. 🔄 自动化流程");
  console.log("   - Skill 内部自动调用多个 Tools");
  console.log("   - 无需用户多轮交互");
  
  console.log("\n3. 🧠 业务逻辑集中");
  console.log("   - 复杂的业务规则在 Skill 中统一实现");
  console.log("   - 例如：VIP 判断、投诉评级、智能推荐算法");
  
  console.log("\n4. 🎨 提升用户体验");
  console.log("   - 减少对话轮次");
  console.log("   - 提供更智能、更人性化的服务");
  
  console.log("\n5. 🔧 可维护性");
  console.log("   - 业务逻辑变更只需修改 Skill");
  console.log("   - Tools 保持简单、独立");
  
  console.log("\n💡 实际应用场景:");
  console.log("  - 电商：退换货流程、会员服务、智能导购");
  console.log("  - 客服：投诉处理、问题诊断、工单流转");
  console.log("  - 金融：账户分析、风险评估、理财建议");
  console.log("  - 医疗：症状分析、就诊流程、健康建议");
}
