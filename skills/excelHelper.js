// ========== Excel 助手技能 ==========

/**
 * Excel 助手技能 - 自然语言转 Excel 公式、函数和操作指导
 * @param {string} requirement - 需求描述（如"计算A列平均值"）
 * @param {string} dataType - 数据类型（numbers, text, date, mixed）
 * @returns {Promise<string>} - Excel 解决方案
 */
export async function skillExcelHelper(requirement, dataType = "mixed") {
  try {
    console.log(`📊 Excel 助手: ${requirement}`);

    const excelGuide = {
      requirement: requirement,
      dataType: dataType,
      commonFormulas: {
        sum: { formula: "=SUM(A1:A10)", desc: "求和" },
        average: { formula: "=AVERAGE(A1:A10)", desc: "平均值" },
        count: { formula: "=COUNT(A1:A10)", desc: "计数" },
        max: { formula: "=MAX(A1:A10)", desc: "最大值" },
        min: { formula: "=MIN(A1:A10)", desc: "最小值" },
        vlookup: { formula: "=VLOOKUP(查找值, 区域, 列号, FALSE)", desc: "垂直查找" },
        if: { formula: "=IF(条件, 真值, 假值)", desc: "条件判断" },
        concat: { formula: "=CONCAT(A1, B1)", desc: "文本拼接" },
        date: { formula: "=TODAY()", desc: "当前日期" },
        pivot: { formula: "插入 → 数据透视表", desc: "数据透视表" }
      },
      solutions: {
        stats: ["SUM", "AVERAGE", "COUNT", "MAX", "MIN"],
        lookup: ["VLOOKUP", "INDEX+MATCH", "XLOOKUP"],
        conditional: ["IF", "IFS", "SUMIF", "COUNTIF"],
        text: ["CONCAT", "LEFT", "RIGHT", "MID", "TEXT"],
        date: ["TODAY", "DATE", "DATEDIF", "EOMONTH"]
      },
      tips: [
        "使用 F4 键快速切换单元格引用方式（相对/绝对）",
        "Ctrl + Shift + ↓ 可快速选择连续数据区域",
        "数据验证功能可限制输入类型，避免错误数据",
        "条件格式让关键数据一目了然",
        "保护工作表可防止误删公式"
      ]
    };

    return `【Excel 助手解决方案】

📝 您的需求: ${requirement}
📦 数据类型: ${dataType}

📌 推荐公式:

常用统计:
  - 求和: ${excelGuide.commonFormulas.sum.formula}
  - 平均值: ${excelGuide.commonFormulas.average.formula}
  - 计数: ${excelGuide.commonFormulas.count.formula}

查找引用:
  - VLOOKUP: ${excelGuide.commonFormulas.vlookup.formula}

逻辑判断:
  - IF: ${excelGuide.commonFormulas.if.formula}

文本处理:
  - 拼接: ${excelGuide.commonFormulas.concat.formula}

🎯 针对您的需求:

请根据具体场景选择:
1. 数据统计 → 使用 SUM/AVERAGE/COUNT 系列
2. 条件筛选 → 使用 SUMIF/COUNTIF/IF
3. 表格查找 → 使用 VLOOKUP/XLOOKUP/INDEX+MATCH
4. 文本处理 → 使用 LEFT/RIGHT/MID/CONCAT
5. 数据透视 → 插入 → 数据透视表

💡 操作技巧:
${excelGuide.tips.map(t => "• " + t).join("\n")}

❓ 需要具体公式的详细解释或示例吗？请告诉我您的具体表格结构。`;

  } catch (error) {
    return `Excel 助手执行失败: ${error.message}`;
  }
}
