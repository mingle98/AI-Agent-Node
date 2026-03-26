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

  // 内置模板 — 统一设计语言：内容优先、视觉克制、专业排版
  const templates = {
    // ── 通用通知 ──────────────────────────────────────────────
    notification: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <!-- 主卡片 -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-top:3px solid #3b82f6;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <!-- 标题区 -->
          <tr>
            <td style="padding:32px 40px 28px;border-bottom:1px solid #f0f0f0;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;">系统通知</p>
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;line-height:1.4;">{{title}}</h1>
            </td>
          </tr>
          <!-- 内容区 -->
          <tr>
            <td style="padding:28px 40px 32px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.9;white-space:pre-wrap;">{{message}}</p>
            </td>
          </tr>
          <!-- 页脚 -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">{{time}}</p>
              <p style="margin:0;font-size:11px;color:#d1d5db;">此邮件由系统自动发送，请勿直接回复。</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,

    // ── 告警通知 ──────────────────────────────────────────────
    alert: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#fff5f5;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5f5;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-top:3px solid #ef4444;border-radius:6px;box-shadow:0 1px 4px rgba(239,68,68,.1);">
          <!-- 标题区 -->
          <tr>
            <td style="padding:32px 40px 28px;border-bottom:1px solid #fee2e2;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;color:#f87171;text-transform:uppercase;">告警通知</p>
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;line-height:1.4;">{{title}}</h1>
            </td>
          </tr>
          <!-- 内容区 -->
          <tr>
            <td style="padding:28px 40px 20px;">
              <!-- 告警信息框 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:4px;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:14px;color:#991b1b;line-height:1.8;white-space:pre-wrap;">{{message}}</p>
                  </td>
                </tr>
              </table>
              <!-- 元信息 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:4px 0;">
                    <p style="margin:0;font-size:13px;color:#6b7280;"><span style="color:#4b5563;font-weight:500;">告警时间</span>&ensp;{{time}}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 0;">
                    <p style="margin:0;font-size:13px;color:#6b7280;"><span style="color:#4b5563;font-weight:500;">告警级别</span>&ensp;<span style="color:#ef4444;font-weight:600;">紧急</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- 页脚 -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #fee2e2;">
              <p style="margin:0;font-size:11px;color:#d1d5db;">此邮件由系统自动发送，如有疑问请联系管理员。</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,

    // ── 数据报告 ──────────────────────────────────────────────
    report: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-top:3px solid #3b82f6;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <!-- 标题区 -->
          <tr>
            <td style="padding:32px 40px 28px;border-bottom:1px solid #f0f0f0;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;color:#60a5fa;text-transform:uppercase;">数据报告</p>
              <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;line-height:1.4;">{{title}}</h1>
            </td>
          </tr>
          <!-- 内容区 -->
          <tr>
            <td style="padding:28px 40px 32px;">
              <div style="border-left:3px solid #3b82f6;padding-left:16px;margin-bottom:20px;">
                <p style="margin:0;font-size:14px;color:#374151;line-height:2;white-space:pre-wrap;">{{content}}</p>
              </div>
              <!-- 报告信息 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:6px 0;border-top:1px solid #f0f0f0;">
                    <p style="margin:0;font-size:12px;color:#9ca3af;">报告生成时间&ensp;{{time}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- 页脚 -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#d1d5db;">此邮件由系统自动生成，如需更多分析请访问管理后台。</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,

    // ── 感谢信 ────────────────────────────────────────────────
    thanks: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#fafafa;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <!-- 顶部装饰条 -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#f59e0b,#fbbf24);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- 内容区 -->
          <tr>
            <td style="padding:48px 48px 40px;">
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:700;color:#111827;line-height:1.4;border-bottom:2px solid #f59e0b;padding-bottom:16px;">{{title}}</h1>
              <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:2;white-space:pre-wrap;">{{message}}</p>
              <div style="margin-top:40px;padding-top:24px;border-top:1px solid #f0f0f0;">
                <p style="margin:0 0 6px;font-size:14px;color:#4b5563;font-style:italic;">此致<br><strong style="color:#111827;">敬礼</strong></p>
                <p style="margin:8px 0 0;font-size:13px;color:#9ca3af;">{{time}}</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,

    // ── 验证码 ────────────────────────────────────────────────
    verification: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#ffffff;border-top:3px solid #10b981;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <!-- 标题区 -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #f0f0f0;text-align:center;">
              <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#111827;">{{title}}</h1>
              <p style="margin:0;font-size:13px;color:#6b7280;">{{message}}</p>
            </td>
          </tr>
          <!-- 验证码展示 -->
          <tr>
            <td style="padding:32px 40px 28px;text-align:center;">
              <div style="display:inline-block;background:#f0fdf4;border:1px solid #a7f3d0;border-radius:6px;padding:20px 48px;margin-bottom:20px;">
                <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#059669;font-family:'SF Mono',Menlo,Monaco,Courier,monospace;">{{code}}</span>
              </div>
              <p style="margin:0;font-size:12px;color:#9ca3af;">有效期 {{expireTime}}</p>
              <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;">{{time}}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,

    // ── 营销邮件 ──────────────────────────────────────────────
    marketing: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <!-- 顶部 Banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#5b21b6);padding:40px 40px 36px;text-align:center;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.4;">{{title}}</h1>
              <p style="margin:0;font-size:14px;color:#ddd6fe;">{{subtitle}}</p>
            </td>
          </tr>
          <!-- 内容区 -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.9;white-space:pre-wrap;">{{message}}</p>
              <!-- CTA 按钮 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="text-align:center;padding:4px 0;">
                    <a href="{{ctaLink}}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:4px;">{{ctaText}}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- 页脚 -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#d1d5db;text-align:center;">{{time}}&ensp;|&ensp;<a href="#" style="color:#a78bfa;text-decoration:underline;">退订邮件</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,

    // ── 邀请函 ────────────────────────────────────────────────
    invitation: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'PingFang SC','Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
          <!-- 顶部 Banner -->
          <tr>
            <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:40px 40px 36px;text-align:center;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;line-height:1.4;">{{title}}</h1>
              <p style="margin:0;font-size:14px;color:#bbf7d0;">诚挚邀请您的参与</p>
            </td>
          </tr>
          <!-- 内容区 -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.9;text-align:center;white-space:pre-wrap;">{{message}}</p>
              <!-- 活动信息 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#6b7280;width:70px;"><strong style="color:#374151;">时间</strong></td>
                        <td style="padding:6px 0;font-size:13px;color:#374151;">{{eventTime}}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#6b7280;"><strong style="color:#374151;">地点</strong></td>
                        <td style="padding:6px 0;font-size:13px;color:#374151;">{{eventLocation}}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#6b7280;"><strong style="color:#374151;">联系</strong></td>
                        <td style="padding:6px 0;font-size:13px;color:#374151;">{{contact}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- 确认按钮 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="text-align:center;padding:4px 0;">
                    <a href="{{rsvpLink}}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 40px;border-radius:4px;">确认出席</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- 页脚 -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">{{time}}</p>
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
  const config = smtpConfig || {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  if (!config.host) {
    return {
      success: false,
      error: '未配置 SMTP_HOST',
      code: 'SMTP_NOT_CONFIGURED'
    };
  }

  const transporter = nodemailer.createTransport(config);
  try {
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP 连接超时')), 5000)
      )
    ]);
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
  } finally {
    transporter.close();
  }
}
