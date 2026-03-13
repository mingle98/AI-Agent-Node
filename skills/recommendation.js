// Skill: 智能推荐（基于用户历史）

import { mockDatabase } from '../data/mockDatabase.js';

export async function skillIntelligentRecommendation(userName) {
  console.log(`\n  🎯 [Skill调用] 智能商品推荐`);
  console.log(`  参数: 用户=${userName}\n`);
  
  const steps = [];
  
  // Step 1: 分析用户信息
  console.log(`  📋 步骤1/3: 分析用户画像...`);
  const user = mockDatabase.users[userName];
  if (!user) {
    return `未找到用户 ${userName}`;
  }
  
  // Step 2: 分析购买历史
  console.log(`  📋 步骤2/3: 分析购买历史...`);
  const userOrders = Object.values(mockDatabase.orders)
    .filter(order => order.user === userName);
  
  const products = userOrders.map(o => o.product);
  steps.push(`购买历史: ${products.join(', ')}`);
  
  // Step 3: 生成推荐
  console.log(`  📋 步骤3/3: 生成个性化推荐...`);
  const recommendations = `
【个性化推荐】
基于您的购买记录（${products.join('、')}），为您推荐：

1. 🎧 AirPods Max - ¥4399
   推荐理由: 您购买了 Apple 生态产品，这款耳机完美搭配
   
2. 📱 iPhone 15 Pro Max - ¥9999
   推荐理由: 旗舰升级，性能提升30%
   
3. ⌚ Apple Watch Series 9 - ¥3199
   推荐理由: 健康监测，与您的设备无缝联动

💰 使用您的 ${user.points} 积分可抵扣 ¥${Math.floor(user.points / 10)}`;
  
  steps.push(recommendations);
  
  return steps.join('\n\n');
}
