// Skill: 数据分析报告

import { mockDatabase } from '../data/mockDatabase.js';

export async function skillDataAnalysis(analysisType) {
  console.log(`\n  🎯 [Skill调用] 数据分析报告`);
  console.log(`  参数: 分析类型=${analysisType}\n`);
  
  console.log(`  📋 正在分析数据...`);
  
  const allOrders = Object.values(mockDatabase.orders);
  const allUsers = Object.values(mockDatabase.users);
  
  if (analysisType === "订单统计") {
    const totalRevenue = allOrders.reduce((sum, o) => sum + o.price, 0);
    const avgOrderValue = totalRevenue / allOrders.length;
    const statusCount = allOrders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});
    
    return `
【订单统计分析】

📊 总体概况:
- 订单总数: ${allOrders.length}
- 总营收: ¥${totalRevenue}
- 平均客单价: ¥${Math.round(avgOrderValue)}

📈 订单状态分布:
${Object.entries(statusCount).map(([status, count]) => 
  `- ${status}: ${count} 单 (${Math.round(count/allOrders.length*100)}%)`
).join('\n')}

💡 洞察建议:
- 已完成订单占比${Math.round((statusCount['已完成']||0)/allOrders.length*100)}%，需优化配送效率
- 建议针对高价值客户推送专属优惠`;
  }
  
  if (analysisType === "用户分析") {
    const vipCount = allUsers.filter(u => u.vip).length;
    const totalPoints = allUsers.reduce((sum, u) => sum + u.points, 0);
    
    return `
【用户分析报告】

👥 用户概况:
- 用户总数: ${allUsers.length}
- VIP用户: ${vipCount} (${Math.round(vipCount/allUsers.length*100)}%)
- 普通用户: ${allUsers.length - vipCount}

🎯 积分情况:
- 积分总量: ${totalPoints}
- 人均积分: ${Math.round(totalPoints/allUsers.length)}
- 最高积分: ${Math.max(...allUsers.map(u => u.points))}

💡 运营建议:
- VIP转化率较低，建议加强会员营销
- 积分活跃度可通过兑换活动提升`;
  }
  
  return `分析类型 "${analysisType}" 暂不支持，可用类型：订单统计、用户分析`;
}
