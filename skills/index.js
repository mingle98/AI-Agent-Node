// ========== 技能路由（带元数据） ==========

import { skillCompleteRefund } from './completeRefund.js';
import { skillVipService } from './vipService.js';
import { skillIntelligentRecommendation } from './recommendation.js';
import { skillComplaintHandling } from './complaint.js';
import { skillDataAnalysis } from './dataAnalysis.js';

// 技能定义（包含函数和元数据）
export const SKILL_DEFINITIONS = [
  {
    name: "complete_refund",
    func: skillCompleteRefund,
    description: "完整退款处理流程",
    functionality: "自动完成 订单验证→用户查询→退款申请→积分返还 全流程",
    params: [
      { name: "订单号", type: "string", example: "ORD001" },
      { name: "退款原因", type: "string", example: "质量问题" },
      { name: "用户名", type: "string", example: "小明" }
    ],
    example: 'complete_refund("ORD001", "质量问题", "小明")',
  },
  {
    name: "vip_service",
    func: skillVipService,
    description: "VIP会员专属服务",
    functionality: "查询会员信息→分析订单历史→生成VIP专属报告",
    params: [
      { name: "用户名", type: "string", example: "小明" }
    ],
    example: 'vip_service("小明")',
  },
  {
    name: "intelligent_recommendation",
    func: skillIntelligentRecommendation,
    description: "智能商品推荐",
    functionality: "分析用户画像→购买历史→生成个性化推荐",
    params: [
      { name: "用户名", type: "string", example: "小明" }
    ],
    example: 'intelligent_recommendation("小明")',
  },
  {
    name: "complaint_handling",
    func: skillComplaintHandling,
    description: "投诉处理流程",
    functionality: "订单查询→投诉评级→解决方案→VIP加速处理",
    params: [
      { name: "订单号", type: "string", example: "ORD001" },
      { name: "投诉类型", type: "string", example: "质量问题", options: ["质量问题", "配送延迟", "服务态度", "商品不符", "其他"] },
      { name: "用户名", type: "string", example: "小明" }
    ],
    example: 'complaint_handling("ORD001", "质量问题", "小明")',
  },
  {
    name: "data_analysis",
    func: skillDataAnalysis,
    description: "数据分析报告",
    functionality: "生成订单统计或用户分析报告",
    params: [
      { name: "分析类型", type: "string", example: "订单统计", options: ["订单统计", "用户分析"] }
    ],
    example: 'data_analysis("订单统计")',
  },
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
