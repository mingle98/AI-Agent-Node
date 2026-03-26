// ========== Email Sender 邮件发送技能 ==========
// 完整的邮件发送流程：信息提取 → 配置验证 → 模板选择 → 发送 → 反馈

import { sendEmail, sendTemplateEmail, verifySmtpConfig } from '../tools/email.js';

/**
 * 邮件发送技能 - 完整的发送流程管理
 * @param {string} 收件人 - 收件人邮箱（多个用逗号分隔）
 * @param {string} 主题 - 邮件主题（可选，不提供则自动生成）
 * @param {string} 内容 - 邮件内容/正文
 * @param {string} 场景类型 - 场景类型（notification/alert/report/marketing/custom，可选）
 * @returns {Promise<Object>} - 发送结果
 */
export async function skillEmailSender(收件人, 主题, 内容, 场景类型 = 'custom') {
  const steps = [];
  
  try {
    console.log('📧 启动邮件发送流程...');
    
    // 构建参数对象
    const options = {
      to: 收件人,
      subject: 主题,
      content: 内容,
      type: 场景类型,
      template: 场景类型
    };
    
    // ========== 步骤1: 提取并标准化邮件信息 ==========
    steps.push({ step: 'extract', status: 'processing', message: '提取邮件发送信息...' });
    
    const emailInfo = await extractEmailInfo(options);
    if (!emailInfo.valid) {
      throw new Error(emailInfo.error || '邮件信息提取失败');
    }
    
    steps.push({ 
      step: 'extract', 
      status: 'completed', 
      message: `✓ 提取完成: 收件人=${emailInfo.to}, 主题="${emailInfo.subject}"` 
    });
    
    // ========== 步骤2: 验证SMTP配置 ==========
    steps.push({ step: 'verify', status: 'processing', message: '验证SMTP配置...' });
    
    const smtpCheck = await verifySmtpConfig(emailInfo.smtp);
    if (!smtpCheck.success) {
      throw new Error(`SMTP配置无效: ${smtpCheck.error}`);
    }
    
    steps.push({ step: 'verify', status: 'completed', message: '✓ SMTP配置验证通过' });
    
    // ========== 步骤3: 根据场景选择模板 ==========
    steps.push({ step: 'template', status: 'processing', message: '选择邮件模板...' });
    
    const templateInfo = selectEmailTemplate(emailInfo);
    
    steps.push({ 
      step: 'template', 
      status: 'completed', 
      message: `✓ 已选择模板: ${templateInfo.templateType}` 
    });
    
    // ========== 步骤4: 执行发送 ==========
    steps.push({ step: 'send', status: 'processing', message: '正在发送邮件...' });
    
    const sendResult = await executeSend(templateInfo, emailInfo);
    
    if (!sendResult.success) {
      throw new Error(`发送失败: ${sendResult.error}`);
    }
    
    steps.push({ 
      step: 'send', 
      status: 'completed', 
      message: `✓ 邮件发送成功 (MessageID: ${sendResult.messageId})` 
    });
    
    // ========== 步骤5: 生成反馈报告 ==========
    const feedbackReport = generateFeedbackReport(steps, sendResult, emailInfo);
    
    return {
      success: true,
      messageId: sendResult.messageId,
      to: emailInfo.to,
      subject: emailInfo.subject,
      templateType: templateInfo.templateType,
      steps: steps,
      report: feedbackReport
    };
    
  } catch (error) {
    steps.push({ step: 'error', status: 'failed', message: error.message });
    
    return {
      success: false,
      error: error.message,
      steps: steps,
      report: generateErrorReport(steps, error)
    };
  }
}

/**
 * 提取并标准化邮件信息
 */
async function extractEmailInfo(options) {
  const { to, subject, content, template, type, attachments, smtp } = options;
  
  // 验证必填项
  if (!to) {
    return { valid: false, error: '缺少收件人邮箱 (to)' };
  }
  
  // 验证邮箱格式
  const emailList = to.split(',').map(e => e.trim()).filter(e => e);
  const invalidEmails = emailList.filter(email => !isValidEmail(email));
  if (invalidEmails.length > 0) {
    return { valid: false, error: `邮箱格式无效: ${invalidEmails.join(', ')}` };
  }
  
  // 如果没有提供主题，根据类型生成默认主题
  let finalSubject = subject;
  if (!finalSubject) {
    finalSubject = generateDefaultSubject(type || template || 'notification');
  }
  
  // 如果没有提供内容，给出提示
  if (!content) {
    return { valid: false, error: '缺少邮件内容 (content)' };
  }
  
  return {
    valid: true,
    to: emailList.join(', '),
    subject: finalSubject,
    content: content,
    template: template || 'custom',
    type: type || 'notification',
    attachments: attachments || [],
    smtp: smtp
  };
}

/**
 * 验证邮箱格式
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 生成默认主题
 */
function generateDefaultSubject(type) {
  const subjectMap = {
    'notification': '系统通知',
    'alert': '⚠️ 告警通知',
    'report': '📊 数据报告',
    'marketing': '营销资讯',
    'welcome': '欢迎加入',
    'followup': '跟进事项',
    'custom': '新消息'
  };
  
  const date = new Date().toLocaleDateString('zh-CN');
  return `${subjectMap[type] || subjectMap.custom} - ${date}`;
}

/**
 * 选择邮件模板
 */
function selectEmailTemplate(emailInfo) {
  const { content, template, type, subject } = emailInfo;
  
  // 模板变量映射
  const now = new Date().toLocaleString('zh-CN');
  const templateVariables = {
    notification: {
      title: subject,
      message: content,
      time: now
    },
    alert: {
      title: subject,
      message: content,
      time: now
    },
    report: {
      title: subject,
      content: content,
      time: now
    },
    thanks: {
      title: subject,
      message: content,
      time: now
    },
    verification: {
      title: subject,
      message: '您的验证码如下，请在有效期内使用：',
      code: content.replace(/[^0-9]/g, '').substring(0, 6) || '123456',
      expireTime: '10分钟',
      time: now
    },
    marketing: {
      title: subject,
      subtitle: '限时优惠活动进行中',
      message: content,
      ctaText: '立即查看',
      ctaLink: '#',
      time: now
    },
    invitation: {
      title: subject,
      message: content,
      eventTime: '待定',
      eventLocation: '待定',
      contact: '请联系主办方',
      rsvpLink: '#',
      time: now
    }
  };
  
  // 确定模板类型
  let templateType = 'custom';
  
  // 如果用户指定了模板类型
  if (template && template !== 'custom' && templateVariables[template]) {
    templateType = template;
  } else if (type && templateVariables[type]) {
    templateType = type;
  } else {
    // 根据内容关键词智能判断
    const lowerContent = content.toLowerCase();
    const lowerSubject = subject.toLowerCase();
    
    if (lowerContent.includes('验证码') || lowerContent.includes('code') || lowerSubject.includes('验证码')) {
      templateType = 'verification';
    } else if (lowerContent.includes('告警') || lowerContent.includes('alert') || lowerContent.includes('错误') || lowerContent.includes('异常')) {
      templateType = 'alert';
    } else if (lowerContent.includes('报告') || lowerContent.includes('report') || lowerContent.includes('统计') || lowerContent.includes('数据')) {
      templateType = 'report';
    } else if (lowerContent.includes('感谢') || lowerContent.includes('thank') || lowerContent.includes('致谢') || lowerSubject.includes('感谢')) {
      templateType = 'thanks';
    } else if (lowerContent.includes('邀请') || lowerContent.includes('invite') || lowerSubject.includes('邀请')) {
      templateType = 'invitation';
    } else if (lowerContent.includes('优惠') || lowerContent.includes('促销') || lowerContent.includes('discount') || lowerSubject.includes('优惠')) {
      templateType = 'marketing';
    } else {
      templateType = 'notification';
    }
  }
  
  return {
    templateType,
    variables: templateVariables[templateType] || { title: subject, message: content, time: now }
  };
}

/**
 * 执行邮件发送
 */
async function executeSend(templateInfo, emailInfo) {
  const { templateType, variables } = templateInfo;
  const { to, subject, attachments } = emailInfo;
  
  // 如果使用模板发送
  if (templateType !== 'custom') {
    return sendTemplateEmail({
      to,
      subject,
      template: templateType,
      variables,
      attachments
    });
  }
  
  // 自定义内容发送
  return sendEmail({
    to,
    subject,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-top:3px solid #3b82f6;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <tr>
            <td style="padding:32px 40px 28px;border-bottom:1px solid #f0f0f0;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;">新消息</p>
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;line-height:1.4;">${subject}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 32px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.9;white-space:pre-wrap;">${emailInfo.content}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#d1d5db;">此邮件由系统自动发送，请勿直接回复。</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    attachments
  });
}

/**
 * 生成成功反馈报告
 */
function generateFeedbackReport(steps, result, emailInfo) {
  return `【邮件发送成功】

📧 发送详情:
  • 收件人: ${emailInfo.to}
  • 主题: ${emailInfo.subject}
  • 模板类型: ${emailInfo.template}
  • 消息ID: ${result.messageId}

📋 执行流程:
${steps.map(s => `  ${s.status === 'completed' ? '✓' : '○'} ${s.message}`).join('\n')}

⏰ 发送时间: ${new Date().toLocaleString('zh-CN')}

✅ 邮件已成功送达！`;
}

/**
 * 生成错误反馈报告
 */
function generateErrorReport(steps, error) {
  const completedSteps = steps.filter(s => s.status === 'completed');
  const failedStep = steps.find(s => s.status === 'failed');
  
  return `【邮件发送失败】

❌ 错误信息: ${error.message}

📋 执行进度:
${completedSteps.map(s => `  ✓ ${s.message}`).join('\n')}
${failedStep ? `  ✗ ${failedStep.message}` : ''}

💡 建议操作:
  • 检查收件人邮箱格式是否正确
  • 确认 SMTP 配置（SMTP_HOST, SMTP_USER, SMTP_PASS）
  • 验证网络连接和邮件服务器状态
  • 查看附件大小是否超过限制`;
}
