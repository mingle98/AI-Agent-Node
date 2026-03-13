// ========== 高级示例：智能路由 ==========

import { ProductionAgent } from '../agent/ProductionAgent.js';

export async function intelligentRoutingDemo(llm, vectorStore, embeddings, runtimeOptions = {}) {
  console.log("\n" + "=".repeat(70));
  console.log("🧠 高级场景：智能意图识别和工具路由");
  console.log("=".repeat(70) + "\n");

  const agent = new ProductionAgent(llm, vectorStore, embeddings, {
    ...runtimeOptions,
  });

  // 不同意图的问题
  const testCases = [
    {
      input: "我的订单到哪里了？我是小明，订单号好像是 ORD001",
      expectedTool: "query_order",
      description: "复杂查询（需要提取订单号）",
    },
    {
      input: "帮我算一下买 5000 块的东西能得多少积分",
      expectedTool: "calculate_points",
      description: "数值计算",
    },
    {
      input: "LangChain 是什么框架？",
      expectedTool: "search_knowledge",
      description: "技术咨询（需要知识库）",
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`🧪 测试: ${testCase.description}`);
    console.log(`预期工具: ${testCase.expectedTool}`);
    console.log("─".repeat(70) + "\n");
    
    await agent.chat(testCase.input);
    agent.reset(); // 每个测试重置对话
  }
}
