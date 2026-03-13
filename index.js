// 🏭 生产级 AI Agent - 智能客服助手示例（增强版）
// 
// 功能架构：
// ├─ RAG 知识检索（向量数据库）
// ├─ 基础工具层（Tools）：单一职责的原子操作
// │  └─ query_order, query_user, apply_refund, calculate_points, search_knowledge
// ├─ 高级技能层（Skills）：组合多个工具的业务流程
// │  ├─ complete_refund: 完整退款流程（订单验证 + 用户查询 + 退款 + 积分）
// │  ├─ vip_service: VIP 会员专属服务
// │  ├─ intelligent_recommendation: 智能商品推荐
// │  ├─ complaint_handling: 投诉处理流程
// │  └─ data_analysis: 数据分析报告
// ├─ 上下文管理：自动剪裁、记忆保持
// └─ 流式输出：实时响应
//
// 🎯 Tool vs Skill 的区别：
// 
// Tool（工具）:
//   - 单一功能，执行一个原子操作
//   - 例如：query_order() 只负责查询订单
//   - 调用格式：TOOL_CALL: tool_name(args)
//   - 适用场景：简单、独立的查询和操作
//
// Skill（技能）:
//   - 组合能力，自动执行多步骤业务流程
//   - 例如：complete_refund() 会自动完成：
//     1. 查询订单（调用 query_order）
//     2. 查询用户（调用 query_user）
//     3. 申请退款（调用 apply_refund）
//     4. 计算积分返还
//   - 调用格式：SKILL_CALL: skill_name(args)
//   - 适用场景：复杂业务流程、需要多步协作的操作
//
// 设计原则：
//   1. Tool 层：保持简单、可复用、单一职责
//   2. Skill 层：封装业务逻辑、自动化流程、提升体验
//   3. Agent 层：智能决策、自动选择最合适的能力

import { FaissStore } from "@langchain/community/vectorstores/faiss";
import path from "path";
import { fileURLToPath } from "url";
import { createLLM, createEmbeddings, createFallbackLLM } from './llm.js';
import { customerServiceDemo } from './demos/customerService.js';
import { skillCapabilityDemo } from './demos/skillCapability.js';
import { intelligentRoutingDemo } from './demos/intelligentRouting.js';
import { tokenOptimizationDemo } from './demos/tokenOptimization.js';
import { loadOrBuildVectorStore } from './utils/ragBuilder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========== 主函数 ==========

async function main(mode = "full") {
  console.log("\n🚀 生产级 AI Agent 完整演示");
  console.log("基于原生消息数组 + RAG + 工具调用 + Skill技能 + 上下文管理\n");
  
  try {
    const llm = createLLM();
    const fallbackLlm = createFallbackLLM();
    const embeddings = createEmbeddings();
    const runtimeOptions = {
      fallbackLlm,
      llmTimeoutMs: 25000,
      toolTimeoutMs: 8000,
      llmRetries: 2,
      toolRetries: 2,
    };
    
    // 智能加载或构建知识库
    const vectorDbPath = path.join(__dirname, "vector_db");
    const knowledgeBasePath = path.join(__dirname, "knowledge_base");
    
    const vectorStore = await loadOrBuildVectorStore({
      vectorDbPath,
      knowledgeBasePath,
      embeddings,
      forceRebuild: false,  // 设为 true 可强制重建
    });

    if (mode === "skill") {
      // 仅运行 Skill 专项演示
      console.log("📌 运行模式: Skill 专项演示\n");
      await skillCapabilityDemo(llm, vectorStore, embeddings, runtimeOptions);
      
    } else if (mode === "customer") {
      // 仅运行客服场景
      console.log("📌 运行模式: 完整客服场景（含 Tool + Skill）\n");
      await customerServiceDemo(llm, vectorStore, embeddings, runtimeOptions);
      
    } else {
      // 完整演示
      console.log("📌 运行模式: 完整演示\n");
      
      // 示例1: Skill 专项演示
      await skillCapabilityDemo(llm, vectorStore, embeddings, runtimeOptions);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 示例2: 完整的客服场景
      await customerServiceDemo(llm, vectorStore, embeddings, runtimeOptions);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log("\n" + "=".repeat(70));
    console.log("✅ 演示完成！");
    console.log("=".repeat(70));
    
    console.log("\n🎯 核心能力总结：");
    console.log("1. ✅ 原生消息数组（节省 30-40% token）");
    console.log("2. ✅ RAG 知识检索（基于向量数据库）");
    console.log("3. ✅ 基础工具调用（订单、用户、退款、积分、知识库）");
    console.log("4. ✅ 高级技能系统（完整退款、VIP服务、智能推荐、投诉处理、数据分析）");
    console.log("5. ✅ 自动上下文剪裁（避免超出 Context Window）");
    console.log("6. ✅ 流式输出（实时响应）");
    console.log("7. ✅ 对话记忆（支持上下文理解）");
    console.log("8. ✅ 智能能力路由（自动选择 Tool 或 Skill）");
    console.log("9. ✅ 完整错误处理");
    
    console.log("\n💡 Tool vs Skill 架构设计:");
    console.log("\n  📎 Tool（工具层）");
    console.log("     - 定位: 原子操作，单一职责");
    console.log("     - 示例: query_order(), query_user()");
    console.log("     - 特点: 简单、快速、可复用");
    
    console.log("\n  🎯 Skill（技能层）");
    console.log("     - 定位: 业务流程，组合能力");
    console.log("     - 示例: complete_refund(), vip_service()");
    console.log("     - 特点: 智能、自动化、面向业务");
    
    console.log("\n  🧠 Agent（智能层）");
    console.log("     - 定位: 意图识别，能力调度");
    console.log("     - 功能: 理解用户需求，选择最佳能力");
    console.log("     - 特点: 自主决策，上下文管理");
    
    console.log("\n📊 使用场景建议:");
    console.log("  • 简单查询 → 直接回答或调用单个 Tool");
    console.log("  • 复杂流程 → 调用 Skill（如退款、投诉）");
    console.log("  • 分析需求 → 调用专业 Skill（如数据分析）");
    console.log("  • 多步操作 → Skill 自动编排多个 Tools");
    
    console.log("\n💡 生产环境建议：");
    console.log("  - 添加日志系统（记录所有对话、工具和技能调用）");
    console.log("  - 实现真实的数据库连接");
    console.log("  - 添加用户身份验证和权限控制");
    console.log("  - Skill 支持异步执行和进度反馈");
    console.log("  - 实现 Skill 的可配置和热更新");
    console.log("  - 添加 Skill 执行监控和性能分析");
    console.log("  - 实现请求限流和防滥用");
    console.log("  - 监控 token 使用量");
    console.log("  - 实现对话持久化（Redis/MongoDB）");
    
    console.log("\n🎯 运行方式:");
    console.log("  node productionAgent/index.js          # 完整演示");
    console.log("  node productionAgent/index.js skill    # 仅 Skill 演示");
    console.log("  node productionAgent/index.js customer # 仅客服场景");
    
  } catch (error) {
    console.error("\n❌ 错误:", error.message);
  }
}

// 运行主函数
const mode = process.argv[2] || 'customer';
main(mode).catch(console.error);
