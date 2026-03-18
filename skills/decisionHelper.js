// ========== Decision Helper 决策助手技能 ==========

/**
 * 决策助手技能 - 辅助决策分析（利弊权衡、风险评估、方案对比）
 * @param {string} decision - 决策场景描述
 * @param {string} options - 可选方案（逗号分隔）
 * @returns {Promise<string>} - 决策分析报告
 */
export async function skillDecisionHelper(decision, options = "") {
  try {
    console.log(`🤔 决策分析: ${decision}`);

    const optionList = options ? options.split(/[,，]/).map(s => s.trim()).filter(Boolean) : ["方案A", "方案B"];

    const analysis = {
      decisionTopic: decision,
      options: optionList,
      framework: {
        prosCons: {
          title: "⚖️ 利弊分析法",
          steps: [
            "列出每个方案的优点（Pros）",
            "列出每个方案的缺点（Cons）",
            "为每条赋权重（1-5分）",
            "计算加权得分进行比较"
          ]
        },
        swot: {
          title: "📊 SWOT 分析",
          dimensions: ["优势 (Strengths)", "劣势 (Weaknesses)", "机会 (Opportunities)", "威胁 (Threats)"]
        },
        decisionMatrix: {
          title: "📋 决策矩阵",
          criteria: ["成本", "时间", "风险", "收益", "可行性"],
          method: "为每个方案在各维度打分（1-10），加权汇总"
        }
      },
      riskAssessment: {
        high: "可能带来重大负面影响，需准备预案",
        medium: "有一定不确定性，建议小步验证",
        low: "风险可控，可大胆推进"
      },
      decisionTips: [
        "设定明确的决策截止期限，避免无限纠结",
        "区分'重要'和'紧急'，优先处理高价值事项",
        "考虑可逆性：可逆决策应快速，不可逆决策需审慎",
        "收集足够信息即可，不必追求100%确定性",
        "相信自己的直觉，它往往整合了潜意识的信息"
      ]
    };

    let output = `【决策分析报告】\n\n`;
    output += `🎯 决策主题: ${analysis.decisionTopic}\n\n`;
    output += `📌 待选方案:\n`;
    analysis.options.forEach((opt, idx) => {
      output += `  ${idx + 1}. ${opt}\n`;
    });
    output += `\n`;

    output += `${analysis.framework.prosCons.title}\n`;
    analysis.framework.prosCons.steps.forEach(step => {
      output += `  - ${step}\n`;
    });
    output += `\n`;

    output += `${analysis.framework.decisionMatrix.title}\n`;
    output += `  评估维度: ${analysis.framework.decisionMatrix.criteria.join("、")}\n`;
    output += `  方法: ${analysis.framework.decisionMatrix.method}\n\n`;

    output += `⚠️ 风险评估等级:\n`;
    output += `  高风险: ${analysis.riskAssessment.high}\n`;
    output += `  中风险: ${analysis.riskAssessment.medium}\n`;
    output += `  低风险: ${analysis.riskAssessment.low}\n\n`;

    output += `💡 决策建议:\n`;
    analysis.decisionTips.forEach(tip => {
      output += `  • ${tip}\n`;
    });

    return output;

  } catch (error) {
    return `决策助手执行失败: ${error.message}`;
  }
}
