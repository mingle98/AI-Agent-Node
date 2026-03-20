// ========== 邮件发送工具 ==========
// 用于邮件通知场景，支持 SMTP 发送
//
// 【主流邮箱 SMTP 配置获取方法】
//
// 1. QQ邮箱 (smtp.qq.com)
//    - SMTP_HOST=smtp.qq.com
//    - SMTP_PORT=587 (或 465 开启SSL)
//    - SMTP_SECURE=false (端口587) / true (端口465)
//    - SMTP_USER=你的QQ号@qq.com
//    - SMTP_PASS=QQ邮箱授权码（非登录密码！）
//    - 获取授权码: 登录QQ邮箱 → 设置 → 账户 → POP3/SMTP服务 → 开启后生成授权码
//
// 2. 163邮箱 (smtp.163.com)
//    - SMTP_HOST=smtp.163.com
//    - SMTP_PORT=465
//    - SMTP_SECURE=true
//    - SMTP_USER=你的邮箱@163.com
//    - SMTP_PASS=163邮箱授权码（非登录密码！）
//    - 获取授权码: 登录163邮箱 → 设置 → POP3/SMTP/IMAP → 开启服务后生成授权码
//
// 3. 126邮箱 (smtp.126.com)
//    - SMTP_HOST=smtp.126.com
//    - SMTP_PORT=465
//    - SMTP_SECURE=true
//    - SMTP_USER=你的邮箱@126.com
//    - SMTP_PASS=126邮箱授权码（非登录密码！）
//    - 获取授权码: 登录126邮箱 → 设置 → POP3/SMTP/IMAP → 开启服务后生成授权码
//
// 4. Gmail (smtp.gmail.com)
//    - SMTP_HOST=smtp.gmail.com
//    - SMTP_PORT=587
//    - SMTP_SECURE=false
//    - SMTP_USER=你的邮箱@gmail.com
//    - SMTP_PASS=Google应用专用密码
//    - 获取方式: Google账户 → 安全性 → 两步验证 → 应用专用密码
//
// 5. Outlook/Hotmail (smtp.office365.com / smtp-mail.outlook.com)
//    - SMTP_HOST=smtp.office365.com
//    - SMTP_PORT=587
//    - SMTP_SECURE=false
//    - SMTP_USER=你的邮箱@outlook.com
//    - SMTP_PASS=微软账户密码或应用密码
//
// 【重要提示】
// - 国内邮箱（QQ/163/126）使用授权码而非登录密码
// - 企业邮箱请向管理员获取SMTP服务器地址
// - 可在 .env 文件中设置，或通过 smtp 参数传入

import nodemailer from 'nodemailer';

/**
 * 发送邮件
 * @param {Object} options - 邮件配置
 * @param {string} options.to - 收件人邮箱（多个用逗号分隔）
 * @param {string} options.subject - 邮件主题
 * @param {string} options.text - 纯文本内容
 * @param {string} options.html - HTML内容（可选，优先于text）
 * @param {string} options.from - 发件人名称（可选）
 * @param {Array} options.attachments - 附件列表（可选）[{filename, path/content}]
 * @param {Object} options.smtp - SMTP配置（可选，默认使用环境变量）
 * @returns {Promise<Object>} - 发送结果
 */
export async function sendEmail(options) {
  try {
    const {
      to,
      subject,
      text = '',
      html,
      from,
      attachments = [],
      smtp
    } = options;

    // 参数验证
    if (!to) {
      throw new Error('收件人邮箱 (to) 不能为空');
    }
    if (!subject) {
      throw new Error('邮件主题 (subject) 不能为空');
    }
    if (!text && !html) {
      throw new Error('邮件内容 (text 或 html) 不能为空');
    }

    // SMTP 配置（优先使用传入的配置，否则使用环境变量）
    const smtpConfig = smtp || {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    if (!smtpConfig.host || !smtpConfig.auth.user) {
      throw new Error('SMTP 配置不完整，请设置环境变量 (SMTP_HOST, SMTP_USER, SMTP_PASS) 或传入 smtp 配置');
    }

    // 创建传输器
    const transporter = nodemailer.createTransport(smtpConfig);

    // 验证连接
    await transporter.verify();

    // 构建邮件内容
    const mailOptions = {
      from: from 
        ? `"${from}" <${smtpConfig.auth.user}>` 
        : smtpConfig.auth.user,
      to,
      subject,
      text: html ? undefined : text,
      html: html || undefined,
      attachments: attachments.map(att => ({
        filename: att.filename,
        path: att.path,
        content: att.content,
        contentType: att.contentType
      }))
    };

    // 发送邮件
    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      to: info.envelope.to,
      from: info.envelope.from
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code || 'EMAIL_SEND_ERROR'
    };
  }
}

/**
 * 发送模板邮件（支持简单的变量替换）
 * @param {Object} options - 邮件配置
 * @param {string} options.to - 收件人邮箱
 * @param {string} options.template - 模板名称或内容
 * @param {Object} options.variables - 模板变量
 * @param {string} options.subject - 邮件主题
 * @returns {Promise<Object>} - 发送结果
 */
export async function sendTemplateEmail(options) {
  const { to, template, variables = {}, subject, from, smtp } = options;

  // 内置模板 - 专业美观的邮件模板集合
  const templates = {
    // 通用通知模板
    notification: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f7fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: inline-block; line-height: 50px; color: white; font-size: 24px;">📢</div>
              </div>
              <h1 style="color: #1a1a2e; font-size: 24px; font-weight: 600; margin: 0 0 20px 0; text-align: center;">{{title}}</h1>
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #4a5568; font-size: 16px; line-height: 1.8; margin: 0; white-space: pre-wrap;">{{message}}</p>
              </div>
              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="color: #a0aec0; font-size: 12px; margin: 0;">此邮件由系统自动发送，请勿回复</p>
                <p style="color: #cbd5e0; font-size: 11px; margin: 8px 0 0 0;">{{time}}</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    // 告警通知模板
    alert: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #fef2f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fef2f2;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(239,68,68,0.15); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 0;">{{title}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <p style="color: #991b1b; font-size: 16px; line-height: 1.8; margin: 0; white-space: pre-wrap;">{{message}}</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 15px 20px;">
                    <p style="color: #6b7280; font-size: 13px; margin: 0;"><strong>告警时间：</strong>{{time}}</p>
                    <p style="color: #6b7280; font-size: 13px; margin: 8px 0 0 0;"><strong>告警级别：</strong><span style="color: #ef4444;">紧急</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    // 数据报告模板
    report: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f0f9ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0f9ff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(59,130,246,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">📊</div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 0;">{{title}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <div style="color: #1e40af; font-size: 15px; line-height: 1.8; white-space: pre-wrap;">{{content}}</div>
              </div>
              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0f2fe;">
                <p style="color: #93c5fd; font-size: 12px; margin: 0;">报告生成时间：{{time}}</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    // 感谢信模板
    thanks: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #fffbeb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffbeb;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(245,158,11,0.1);">
          <tr>
            <td style="padding: 50px 40px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 50%; display: inline-block; line-height: 60px; color: white; font-size: 28px;">🙏</div>
              </div>
              <h1 style="color: #92400e; font-size: 26px; font-weight: 600; margin: 0 0 30px 0; text-align: center;">{{title}}</h1>
              <div style="color: #78350f; font-size: 16px; line-height: 2; white-space: pre-wrap; margin: 20px 0;">{{message}}</div>
              <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 1px solid #fde68a;">
                <p style="color: #b45309; font-size: 14px; margin: 0; font-style: italic;">此致 敬礼</p>
                <p style="color: #d97706; font-size: 13px; margin: 10px 0 0 0;">{{time}}</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    // 验证码模板
    verification: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fafafa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 40px; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 10px;">🔐</div>
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 600; margin: 0;">{{title}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px; text-align: center;">
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">{{message}}</p>
              <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 25px 40px; margin: 30px 0; display: inline-block;">
                <span style="color: #059669; font-size: 36px; font-weight: 700; letter-spacing: 8px;">{{code}}</span>
              </div>
              <p style="color: #9ca3af; font-size: 13px; margin: 20px 0 0 0;">验证码有效期：{{expireTime}}</p>
              <p style="color: #d1d5db; font-size: 11px; margin: 8px 0 0 0;">{{time}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    // 营销邮件模板
    marketing: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #fdf4ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fdf4ff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(168,85,247,0.15); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); padding: 40px; text-align: center;">
              <div style="font-size: 56px; margin-bottom: 15px;">🎉</div>
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 10px 0;">{{title}}</h1>
              <p style="color: #e9d5ff; font-size: 14px; margin: 0;">{{subtitle}}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <div style="color: #581c87; font-size: 16px; line-height: 1.8; white-space: pre-wrap; margin: 20px 0;">{{message}}</div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{ctaLink}}" style="display: inline-block; background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 30px; font-weight: 600;">{{ctaText}}</a>
              </div>
              <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #f3e8ff;">
                <p style="color: #a855f7; font-size: 12px; margin: 0;">如不想收到此类邮件，请<a href="#" style="color: #7c3aed;">点击退订</a></p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    // 邀请函模板
    invitation: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f0fdf4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(34,197,94,0.15); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 40px; text-align: center;">
              <div style="font-size: 56px; margin-bottom: 15px;">💌</div>
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">{{title}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #166534; font-size: 18px; line-height: 1.8; text-align: center; margin: 0 0 30px 0;">{{message}}</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; border-radius: 12px; margin: 30px 0;">
                <tr>
                  <td style="padding: 25px;">
                    <p style="color: #15803d; font-size: 14px; margin: 8px 0;"><strong>时间：</strong>{{eventTime}}</p>
                    <p style="color: #15803d; font-size: 14px; margin: 8px 0;"><strong>地点：</strong>{{eventLocation}}</p>
                    <p style="color: #15803d; font-size: 14px; margin: 8px 0;"><strong>联系人：</strong>{{contact}}</p>
                  </td>
                </tr>
              </table>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{rsvpLink}}" style="display: inline-block; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 30px; font-weight: 600;">确认出席</a>
              </div>
              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #86efac; font-size: 12px; margin: 0;">{{time}}</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };

  // 获取模板内容
  let html = templates[template] || template;

  // 变量替换
  Object.keys(variables).forEach(key => {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
  });

  return sendEmail({
    to,
    subject,
    html,
    from,
    smtp
  });
}

/**
 * 验证 SMTP 配置是否有效
 * @param {Object} smtpConfig - SMTP配置
 * @returns {Promise<Object>} - 验证结果
 */
export async function verifySmtpConfig(smtpConfig) {
  try {
    const config = smtpConfig || {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    const transporter = nodemailer.createTransport(config);
    await transporter.verify();

    return {
      success: true,
      message: 'SMTP 配置验证通过'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}
