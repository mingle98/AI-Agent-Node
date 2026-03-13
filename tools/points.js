// 工具: 计算积分

export async function calculatePoints(amount) {
  console.log(`\n  🔧 [工具调用] 计算积分: 金额=${amount}`);
  const points = Math.floor(amount * 0.1); // 消费100元得10积分
  return `消费 ¥${amount} 可获得 ${points} 积分`;
}
