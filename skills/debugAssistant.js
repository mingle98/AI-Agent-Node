// ========== Debug 调试助手技能 ==========

/**
 * 调试助手技能 - 分析错误日志并提供修复建议
 * @param {string} errorInfo - 错误信息或日志内容
 * @param {string} context - 上下文环境（如编程语言、框架）
 * @returns {Promise<string>} - 诊断结果和修复建议
 */
export async function skillDebugAssistant(errorInfo, context = "") {
  try {
    console.log(`🔧 Debug 调试分析`);

    const analysis = {
      errorSummary: errorInfo.substring(0, 200) + (errorInfo.length > 200 ? "..." : ""),
      context: context || "未指定",
      diagnosis: {
        possibleCauses: [
          "1. 变量未定义或命名错误",
          "2. 依赖包版本不兼容",
          "3. 异步操作未正确处理",
          "4. 类型不匹配或空值引用",
          "5. 环境配置问题"
        ],
        suggestedChecks: [
          "✓ 检查变量定义和拼写",
          "✓ 确认所有依赖已正确安装",
          "✓ 添加错误边界和 try-catch",
          "✓ 验证输入数据的合法性",
          "✓ 检查环境变量配置"
        ]
      },
      fixStrategy: {
        immediate: [
          "查看完整的错误堆栈信息",
          "在关键位置添加 console.log 或断点",
          "回滚最近修改确认变更点"
        ],
        longTerm: [
          "添加单元测试覆盖错误场景",
          "引入类型检查（如 TypeScript）",
          "建立错误监控和告警机制"
        ]
      }
    };

    return `【Debug 调试助手分析报告】

📋 错误摘要:
${analysis.errorSummary}

🖥️ 运行环境: ${analysis.context}

🔍 可能原因:
${analysis.diagnosis.possibleCauses.join("\n")}

✅ 建议检查项:
${analysis.diagnosis.suggestedChecks.join("\n")}

🛠️ 修复策略:

【立即行动】
${analysis.fixStrategy.immediate.map(s => "- " + s).join("\n")}

【长期优化】
${analysis.fixStrategy.longTerm.map(s => "- " + s).join("\n")}

💡 提示: 如需更深入分析，请提供完整的代码片段和运行环境信息。`;

  } catch (error) {
    return `调试助手执行失败: ${error.message}`;
  }
}
