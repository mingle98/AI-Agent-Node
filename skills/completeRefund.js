// Skill: 完整退款处理流程

import { queryOrder } from '../tools/order.js';
import { queryUser } from '../tools/user.js';
import { applyRefund } from '../tools/refund.js';
import { mockDatabase } from '../data/mockDatabase.js';

export async function skillCompleteRefund(orderId, reason, userName) {
  console.log(`\n  🎯 [Skill调用] 完整退款流程`);
  console.log(`  参数: 订单=${orderId}, 原因=${reason}, 用户=${userName}\n`);
  
  const steps = [];
  
  // Step 1: 查询订单验证
  console.log(`  📋 步骤1/4: 验证订单信息...`);
  const orderInfo = await queryOrder(orderId);
  steps.push(`订单验证: ${orderInfo}`);
  
  // Step 2: 查询用户信息（用于权限和积分处理）
  console.log(`  📋 步骤2/4: 查询用户信息...`);
  const userInfo = await queryUser(userName);
  steps.push(`用户信息: ${userInfo}`);
  
  // Step 3: 申请退款
  console.log(`  📋 步骤3/4: 提交退款申请...`);
  const refundResult = await applyRefund(orderId, reason);
  steps.push(`退款结果: ${refundResult}`);
  
  // Step 4: 积分返还提示（模拟）
  console.log(`  📋 步骤4/4: 计算积分返还...`);
  const order = mockDatabase.orders[orderId];
  if (order) {
    const pointsToReturn = Math.floor(order.price * 0.1);
    steps.push(`积分返还: ${pointsToReturn} 积分将在退款成功后返还至账户`);
  }
  
  return `【完整退款流程执行完成】\n\n${steps.join('\n\n')}`;
}
