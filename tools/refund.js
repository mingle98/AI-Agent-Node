// 工具: 申请退款

import { mockDatabase } from '../data/mockDatabase.js';

export async function applyRefund(orderId, reason) {
  console.log(`\n  🔧 [工具调用] 申请退款: 订单=${orderId}, 原因=${reason}`);
  const order = mockDatabase.orders[orderId];
  if (!order) {
    return `订单 ${orderId} 不存在`;
  }
  if (order.status === "已完成") {
    return `退款申请成功！订单 ${orderId} 将在3-5个工作日内处理。退款金额 ¥${order.price}`;
  }
  return `订单 ${orderId} 状态为"${order.status}"，无法退款`;
}
