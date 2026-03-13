// Skill: 投诉处理流程

import { queryOrder } from '../tools/order.js';
import { mockDatabase } from '../data/mockDatabase.js';

export async function skillComplaintHandling(orderId, complaintType, userName) {
  console.log(`\n  🎯 [Skill调用] 投诉处理流程`);
  console.log(`  参数: 订单=${orderId}, 类型=${complaintType}, 用户=${userName}\n`);
  
  const steps = [];
  
  // Step 1: 查询订单详情
  console.log(`  📋 步骤1/4: 查询订单详情...`);
  const orderInfo = await queryOrder(orderId);
  steps.push(`订单信息: ${orderInfo}`);
  
  // Step 2: 评估投诉级别
  console.log(`  📋 步骤2/4: 评估投诉级别...`);
  const severityMap = {
    "质量问题": "高",
    "配送延迟": "中",
    "服务态度": "中",
    "商品不符": "高",
    "其他": "低"
  };
  const severity = severityMap[complaintType] || "中";
  steps.push(`投诉级别: ${severity}级`);
  
  // Step 3: 生成解决方案
  console.log(`  📋 步骤3/4: 生成解决方案...`);
  const solutions = {
    "高": "立即处理 + 全额退款 + 补偿券 ¥200",
    "中": "优先处理 + 协商退款 + 补偿券 ¥100",
    "低": "标准流程 + 补偿券 ¥50"
  };
  const solution = solutions[severity];
  steps.push(`解决方案: ${solution}`);
  
  // Step 4: 查询用户等级（VIP用户优先处理）
  console.log(`  📋 步骤4/4: 检查用户权益...`);
  const user = mockDatabase.users[userName];
  if (user && user.vip) {
    steps.push(`VIP加速: 专属客服已介入，预计1小时内联系您`);
  } else {
    steps.push(`处理时效: 预计24小时内处理完成`);
  }
  
  return `【投诉处理流程完成】\n\n${steps.join('\n\n')}\n\n工单号: TICKET-${Date.now()}`;
}
