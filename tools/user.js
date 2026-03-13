// 工具: 用户信息查询

import { mockDatabase } from '../data/mockDatabase.js';

export async function queryUser(userName) {
  console.log(`\n  🔧 [工具调用] 查询用户: ${userName}`);
  const user = mockDatabase.users[userName];
  if (!user) {
    return `未找到用户 ${userName}`;
  }
  return JSON.stringify({
    姓名: user.name,
    会员等级: user.vip ? "VIP会员" : "普通用户",
    积分: user.points,
    注册时间: user.joinDate,
  }, null, 2);
}
