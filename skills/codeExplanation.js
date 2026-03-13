// ========== 代码解释技能 ==========

/**
 * 代码解释技能 - 详细解释代码逻辑和原理
 * @param {string} code - 代码内容
 * @param {string} detailLevel - 详细程度 (brief, normal, detailed)
 * @returns {Promise<string>} - 代码解释
 */
export async function skillCodeExplanation(code, detailLevel = "normal") {
  try {
    console.log(`💡 代码解释 (${detailLevel})`);
    
    const explanation = {
      detailLevel,
      codeLength: code.length,
      explanation: `代码解释 (${detailLevel}):\n\n` +
        `本技能将为您提供：\n` +
        `1. 代码整体功能概述\n` +
        `2. 逐行/逐段逻辑解释\n` +
        `3. 关键算法或设计模式说明\n` +
        `4. 与其他部分的关联\n\n` +
        `详细程度: ${detailLevel}\n` +
        `- brief: 简要概述\n` +
        `- normal: 标准解释\n` +
        `- detailed: 深入分析\n\n` +
        `待解释代码:\n${code}`
    };
    
    return JSON.stringify(explanation, null, 2);
  } catch (error) {
    return `代码解释执行失败: ${error.message}`;
  }
}
