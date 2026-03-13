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
        `本技能将调用知识库中的AI Agent学习资料，为用户提供：\n` +
        `1. 核心概念解释\n` +
        `2. 实际案例分析\n` +
        `3. 最佳实践建议\n` +
        `4. 常见问题解答\n\n` +
        `建议先使用 search_knowledge 工具查询相关资料。`
    };
    
    return JSON.stringify(teachingContent, null, 2);
  } catch (error) {
    return `教学技能执行失败: ${error.message}`;
  }
}
