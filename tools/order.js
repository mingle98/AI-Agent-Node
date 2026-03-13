// 工具: 订单查询

import { mockDatabase } from '../data/mockDatabase.js';

export async function queryOrder(orderId) {
  console.log(`\n  🔧 [工具调用] 查询订单: ${orderId}`);
  const order = mockDatabase.orders[orderId];
  if (!order) {
    return `未找到订单号 ${orderId}`;
  }
  return JSON.stringify({
    订单号: order.id,
    用户: order.user,
    商品: order.product,
    价格: `¥${order.price}`,
    状态: order.status,
  }, null, 2);
}
