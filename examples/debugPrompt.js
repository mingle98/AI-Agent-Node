// ========== 调试：查看生成的系统提示 ==========

import { createLLM, createEmbeddings } from '../llm.js';
import { ProductionAgent } from '../agent/ProductionAgent.js';

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("🔍 调试模式：查看自动生成的系统提示");
  console.log("=".repeat(70) + "\n");

  const llm = createLLM();
  
  // 启用 debug 模式
  const agent = new ProductionAgent(llm, null, {
    debug: true,  // ✅ 启用调试模式
    roleName: "智能客服助手",
    roleDescription: "可以帮助用户解决问题",
  });

  console.log("✅ 系统提示已自动生成并显示在上方\n");
  console.log("💡 提示：每次添加新工具或技能后，系统提示都会自动更新\n");
}

main().catch(console.error);
