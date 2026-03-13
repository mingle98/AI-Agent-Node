// ========== 代码分析工具 ==========

/**
 * 代码分析 - 解释代码逻辑并提供建议
 * @param {string} code - 代码内容
 * @param {string} language - 编程语言
 * @returns {string} - 分析结果
 */
export function analyzeCode(code, language = "javascript") {
  try {
    console.log(`🔍 分析 ${language} 代码`);
    
    const analysis = {
      language,
      codeLength: code.length,
      analysis: `代码分析结果:\n` +
        `1. 编程语言: ${language}\n` +
        `2. 代码长度: ${code.length} 字符\n` +
        `3. 分析说明: 此工具会将代码传递给LLM进行深度分析，包括:\n` +
        `   - 代码逻辑解释\n` +
        `   - 潜在问题识别\n` +
        `   - 性能优化建议\n` +
        `   - 最佳实践推荐\n\n` +
        `实际代码:\n${code}`
    };
    
    return JSON.stringify(analysis, null, 2);
  } catch (error) {
    return `代码分析失败: ${error.message}`;
  }
}
