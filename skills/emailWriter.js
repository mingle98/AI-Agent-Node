// ========== Email Writer 邮件写作助手技能 ==========

/**
 * 邮件写作助手技能 - 生成各类商务邮件
 * @param {string} purpose - 邮件目的（跟进、道歉、拒绝、邀约、感谢等）
 * @param {string} context - 邮件背景信息
 * @param {string} tone - 语气风格（formal, friendly, urgent）
 * @returns {Promise<string>} - 邮件模板和建议
 */
export async function skillEmailWriter(purpose, context = "", tone = "formal") {
  try {
    console.log(`📧 邮件写作: ${purpose}`);

    const emailTemplates = {
      followUp: {
        subject: "关于 [事项] 的跟进",
        structure: [
          "开头：提及上次沟通的时间和内容",
          "正文：说明跟进原因，提供更新信息",
          "结尾：明确提出下一步行动或期望回复时间"
        ],
        example: "您好，\n\n关于我们上周讨论的 [事项]，想跟进一下最新进展...\n\n期待您的回复。"
      },
      apology: {
        subject: "关于 [事项] 的致歉",
        structure: [
          "开头：直接表达歉意，承认问题",
          "正文：简要说明原因（不找借口），提出补救措施",
          "结尾：再次致歉，承诺改进"
        ],
        example: "您好，\n\n对于 [事项] 给您带来的不便，深表歉意...\n\n我们已采取 [措施] 确保不再发生。"
      },
      decline: {
        subject: "关于 [邀请/请求] 的回复",
        structure: [
          "开头：感谢对方的邀请/机会",
          "正文：委婉说明无法接受的原因",
          "结尾：表达遗憾，保持未来合作可能性"
        ],
        example: "您好，\n\n感谢您邀请我 [事项]。经过慎重考虑...\n\n希望以后有机会合作。"
      },
      invitation: {
        subject: "[活动/会议] 邀请",
        structure: [
          "开头：说明邀请目的",
          "正文：提供时间、地点、议程等详情",
          "结尾：请求确认出席，提供联系方式"
        ],
        example: "您好，\n\n诚挚邀请您参加 [活动]，将于 [时间] 在 [地点] 举行...\n\n敬请确认是否出席。"
      },
      thanks: {
        subject: "感谢 [帮助/支持/合作]",
        structure: [
          "开头：直接表达感谢",
          "正文：具体说明对方的帮助带来的影响",
          "结尾：表达继续合作的意愿"
        ],
        example: "您好，\n\n衷心感谢您在 [事项] 上的帮助...\n\n期待未来继续合作。"
      }
    };

    const toneGuide = {
      formal: "使用标准商务用语，避免缩写和口语化表达",
      friendly: "语气亲和，可适当使用表情符号（对熟悉对象）",
      urgent: "清晰标注紧急程度，简洁直接，突出行动项"
    };

    const purposes = purpose.toLowerCase();
    let templateType = "followUp";
    if (purposes.includes("跟进") || purposes.includes("follow")) templateType = "followUp";
    else if (purposes.includes("道歉") || purposes.includes("sorry")) templateType = "apology";
    else if (purposes.includes("拒绝") || purposes.includes("decline")) templateType = "decline";
    else if (purposes.includes("邀请") || purposes.includes("invite")) templateType = "invitation";
    else if (purposes.includes("感谢") || purposes.includes("thank")) templateType = "thanks";

    const selected = emailTemplates[templateType];

    return `【邮件写作助手】

📌 邮件类型: ${purpose}
🎨 语气风格: ${tone} - ${toneGuide[tone]}
📋 背景信息: ${context || "未提供"}

✉️ 建议主题行:
${selected.subject}

📝 邮件结构:
${selected.structure.map((s, i) => `${i + 1}. ${s}`).join("\n")}

💬 示例模板:
---
${selected.example}
---

✅ 写作建议:
  • 主题行简洁明确，控制在 50 字以内
  • 首段开门见山，3 句话内说明来意
  • 段落不超过 3 行，方便手机阅读
  • 重要信息加粗或使用项目符号
  • 结尾包含明确的行动号召（CTA）

🔧 通用模板:
主题：[具体事项]

尊敬的 [姓名]：

[开头 - 说明来意]

[正文 - 详细内容]

[结尾 - 行动项/期待]

此致
敬礼

[您的姓名]
[日期]`;

  } catch (error) {
    return `邮件写作助手执行失败: ${error.message}`;
  }
}
