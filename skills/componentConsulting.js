// ========== 前端组件咨询技能 ==========

/**
 * AISuspendedBallChat 组件咨询技能
 * @param {string} question - 咨询问题
 * @param {string} component - 组件名称或功能
 * @returns {Promise<string>} - 组件使用指导
 */
export async function skillComponentConsulting(question, component = "SuspendedBallChat") {
  try {
    console.log(`🔧 组件咨询: ${component} - ${question}`);
    
    const consultingContent = {
      component,
      question,
      guidance: `AISuspendedBallChat 组件咨询:\n\n` +
        `组件: ${component}\n` +
        `问题: ${question}\n\n` +
        `本技能将调用知识库中的组件文档，为您提供：\n` +
        `1. 组件使用方法\n` +
        `2. 属性配置说明\n` +
        `3. 回调函数示例\n` +
        `4. 常见问题排查\n` +
        `5. 最佳实践建议\n\n` +
        `建议先使用 search_knowledge 工具查询组件文档。`
    };
    
    return JSON.stringify(consultingContent, null, 2);
  } catch (error) {
    return `组件咨询执行失败: ${error.message}`;
  }
}
