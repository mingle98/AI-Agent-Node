// ========== 技能路由（带元数据） ==========
import { skillComplaintHandling } from './complaint.js';

// 技能定义（包含函数和元数据）
export const SKILL_DEFINITIONS = [
  // {
  //   name: "complaint_handling",
  //   func: skillComplaintHandling,
  //   description: "投诉处理流程",
  //   functionality: "订单查询→投诉评级→解决方案→VIP加速处理",
  //   params: [
  //     { name: "订单号", type: "string", example: "ORD001" },
  //     { name: "投诉类型", type: "string", example: "质量问题", options: ["质量问题", "配送延迟", "服务态度", "商品不符", "其他"] },
  //     { name: "用户名", type: "string", example: "小明" }
  //   ],
  //   example: 'complaint_handling("ORD001", "质量问题", "小明")',
  // },
];

// 生成技能映射表
export const SKILLS = SKILL_DEFINITIONS.reduce((acc, skill) => {
  acc[skill.name] = skill.func;
  return acc;
}, {});

// 导出函数
export {
  skillCompleteRefund,
  skillVipService,
  skillIntelligentRecommendation,
  skillComplaintHandling,
  skillDataAnalysis,
};
