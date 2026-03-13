// ========== 文档生成工具 ==========

/**
 * 生成技术文档
 * @param {string} topic - 文档主题
 * @param {string} docType - 文档类型 (tutorial, api, readme, architecture, guide)
 * @param {string} outline - 文档大纲（可选）
 * @returns {string} - 生成的文档结构
 */
export function generateDocument(topic, docType = "tutorial", outline = "") {
  try {
    console.log(`📝 生成 ${docType} 文档: ${topic}`);
    
    const docTypes = {
      tutorial: "教程文档",
      api: "API文档",
      readme: "README文档",
      architecture: "架构文档",
      guide: "用户指南"
    };
    
    const document = {
      topic,
      type: docTypes[docType] || docType,
      outline: outline || "将根据主题自动生成大纲",
      sections: [
        { title: "概述", content: `关于 ${topic} 的介绍` },
        { title: "主要内容", content: "详细内容将由LLM根据主题生成" },
        { title: "总结", content: "要点总结" }
      ],
      note: "此为文档生成请求。实际文档内容将由LLM根据主题和类型生成。"
    };
    
    return JSON.stringify(document, null, 2);
  } catch (error) {
    return `文档生成失败: ${error.message}`;
  }
}
