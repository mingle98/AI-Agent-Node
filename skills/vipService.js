// Skill: VIP 会员专属服务

import { queryUser } from '../tools/user.js';
import { mockDatabase } from '../data/mockDatabase.js';

export async function skillVipService(userName) {
  console.log(`\n  🎯 [Skill调用] VIP会员专属服务`);
  console.log(`  参数: 用户=${userName}\n`);
  
  const steps = [];
  
  // Step 1: 查询用户信息
  console.log(`  📋 步骤1/3: 查询会员信息...`);
  const userInfo = await queryUser(userName);
  const user = mockDatabase.users[userName];
  steps.push(`会员信息: ${userInfo}`);
  
  if (!user || !user.vip) {
    return `抱歉，${userName} 不是 VIP 会员，无法使用该服务。\n升级 VIP 可享受：\n- 专属客服\n- 双倍积分\n- 优先退款\n- 专属优惠券`;
  }
  
  // Step 2: 查询该用户的所有订单
  console.log(`  📋 步骤2/3: 查询订单历史...`);
  const userOrders = Object.values(mockDatabase.orders)
    .filter(order => order.user === userName);
  steps.push(`历史订单数: ${userOrders.length} 个订单`);
  
  // Step 3: 生成 VIP 专属报告
  console.log(`  📋 步骤3/3: 生成VIP专属报告...`);
  const totalSpending = userOrders.reduce((sum, order) => sum + order.price, 0);
  const report = `
【VIP 专属报告】
- 当前积分: ${user.points}
- 累计消费: ¥${totalSpending}
- 可获得积分: ${Math.floor(totalSpending * 0.2)} (VIP双倍)
- 专属权益: 优先配送、专属客服、生日礼券
- 升级建议: 再消费 ¥${Math.max(0, 20000 - totalSpending)} 可升级至钻石会员`;
  
  steps.push(report);
  
  return steps.join('\n\n');
}
