// ========== 前端组件咨询技能 ==========

function normalizeKnowledgeContext(knowledgeContext = "") {
  return String(knowledgeContext || "").trim();
}

/**
 * 严格版组件咨询技能：仅基于已检索到的组件文档结果进行总结
 * @param {string} question - 咨询问题
 * @param {string} component - 组件名称或功能
 * @param {string} knowledgeContext - search_knowledge 返回的组件文档摘要/片段
 * @returns {Promise<string>} - 组件使用指导
 */
export async function skillComponentConsulting(question, component = "SuspendedBallChat", knowledgeContext = "") {
  try {
    console.log(`🔧 组件咨询: ${component} - ${question}`);

    const normalizedComponent = String(component || "SuspendedBallChat").trim() || "SuspendedBallChat";
    const normalizedQuestion = String(question || "").trim();
    const normalizedKnowledgeContext = normalizeKnowledgeContext(knowledgeContext);

    if (!normalizedKnowledgeContext) {
      return JSON.stringify({
        component: normalizedComponent,
        question: normalizedQuestion,
        requiresKnowledgeLookup: true,
        guidance: `缺少 ${normalizedComponent} 组件文档上下文。请先调用 search_knowledge 检索 ${normalizedComponent} 相关文档或示例，再把检索结果作为第 3 个参数传给 component_consulting 进行总结。`
      }, null, 2);
    }

    return JSON.stringify({
      component: normalizedComponent,
      question: normalizedQuestion,
      basedOnKnowledge: true,
      guidance:
        `${normalizedComponent} 组件咨询（基于已检索文档）:\n\n` +
        `组件: ${normalizedComponent}\n` +
        `问题: ${normalizedQuestion || "未提供具体问题"}\n\n` +
        `已检索到的组件文档摘要：\n${normalizedKnowledgeContext}\n\n` +
        `请严格基于以上文档摘要回答用户：\n` +
        `1. 优先提炼与当前问题直接相关的配置、参数、示例或注意事项\n` +
        `2. 不要脱离文档摘要自行补充未被检索到的组件事实\n` +
        `3. 如果当前文档不足以支持结论，请明确说明还缺少哪部分文档或示例`
    }, null, 2);
  } catch (error) {
    return `组件咨询执行失败: ${error.message}`;
  }
}

