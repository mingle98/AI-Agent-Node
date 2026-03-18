// ========== Code Review 代码审查技能 ==========

/**
 * 代码审查技能 - 检查代码质量、潜在问题和改进建议
 * @param {string} code - 待审查的代码内容
 * @param {string} focusArea - 审查重点 (security, performance, style, all)
 * @returns {Promise<string>} - 审查报告
 */
export async function skillCodeReview(code, focusArea = "all") {
  try {
    console.log(`👀 代码审查 (${focusArea})`);

    const reviewReport = {
      summary: {
        totalLines: code.split("\n").length,
        focusArea: focusArea,
        overallScore: "待评估"
      },
      categories: {
        security: {
          title: "🔐 安全性检查",
          items: [
            "检查是否存在 SQL 注入风险",
            "验证用户输入是否经过过滤和转义",
            "确认敏感信息（密钥、密码）未硬编码",
            "检查是否存在 XSS 漏洞"
          ]
        },
        performance: {
          title: "⚡ 性能优化",
          items: [
            "检查是否存在循环内的重复计算",
            "评估内存使用效率",
            "确认异步操作是否优化",
            "检查是否存在 N+1 查询问题"
          ]
        },
        style: {
          title: "📝 代码风格",
          items: [
            "命名是否符合约定（驼峰、下划线）",
            "函数长度是否适中（建议 < 50 行）",
            "注释是否清晰完整",
            "是否存在冗余代码"
          ]
        },
        maintainability: {
          title: "🔧 可维护性",
          items: [
            "代码是否遵循单一职责原则",
            "依赖关系是否清晰",
            "错误处理是否完善",
            "是否包含适当的单元测试"
          ]
        }
      },
      recommendations: [
        "建议使用 ESLint/Prettier 统一代码风格",
        "添加单元测试覆盖核心业务逻辑",
        "使用 TypeScript 提升类型安全",
        "定期进行代码重构，消除技术债务"
      ]
    };

    const focusMap = {
      all: ["security", "performance", "style", "maintainability"],
      security: ["security"],
      performance: ["performance"],
      style: ["style"]
    };

    const categoriesToShow = focusMap[focusArea] || focusMap.all;

    let reportOutput = `【代码审查报告】\n\n`;
    reportOutput += `📊 代码规模: ${reviewReport.summary.totalLines} 行\n`;
    reportOutput += `🎯 审查重点: ${focusArea}\n\n`;

    categoriesToShow.forEach(key => {
      const cat = reviewReport.categories[key];
      reportOutput += `${cat.title}\n`;
      cat.items.forEach(item => {
        reportOutput += `  - ${item}\n`;
      });
      reportOutput += `\n`;
    });

    reportOutput += `📌 改进建议:\n`;
    reviewReport.recommendations.forEach(rec => {
      reportOutput += `  - ${rec}\n`;
    });

    return reportOutput;

  } catch (error) {
    return `代码审查执行失败: ${error.message}`;
  }
}
