// ========== AI Agent 教学技能 ==========

/**
 * AI Agent 教学技能 - 提供AI Agent相关知识教学
 * @param {string} topic - 教学主题
 * @param {string} level - 难度级别 (beginner, intermediate, advanced)
 * @returns {Promise<string>} - 教学内容
 */
export async function skillAIAgentTeaching(topic, level = "beginner") {
  try {
    console.log(`📚 AI Agent教学: ${topic} (${level})`);
    
    const teachingContent = {
      topic,
      level,
      content: `AI Agent 教学内容:\n\n` +
        `主题: ${topic}\n` +
        `难度: ${level}\n\n` +
        `请结合本轮已检索到的知识库内容，为用户整理：\n` +
        `1. 核心概念解释\n` +
        `2. 实际案例分析\n` +
        `3. 最佳实践建议\n` +
        `4. 常见问题解答`
    };
    
    return JSON.stringify(teachingContent, null, 2);
  } catch (error) {
    return `教学技能执行失败: ${error.message}`;
  }
}
