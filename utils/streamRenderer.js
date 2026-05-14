// ========== 流式渲染工具 ==========
// 统一管理所有状态提示框样式，供 ProductionAgent / planExecMode 等模块共享
// 层次：PLAN（主、冷色强调）> 步骤（次、中性灰弱于 PLAN）> 工具过程（最弱）
// 风格：扁平直角、无圆角、无卡片阴影；左侧色条 + 浅底

/** PLAN 主流程行 */
const _planRow =
  'display:block;box-sizing:border-box;' +
  'border-radius:0;box-shadow:none;border:none;' +
  'line-height:1.45;letter-spacing:0.01em;' +
  'padding:8px 10px 6px 12px;margin:0 0 4px 0;' +
  'font-size:14px;';

/** 步骤行：刻意弱于 PLAN（小一号、常规字重、灰系底与细条，避免暖色抢主视觉） */
const _stepRow =
  'display:block;box-sizing:border-box;' +
  'border-radius:0;box-shadow:none;border:none;' +
  'line-height:1.45;letter-spacing:0.01em;' +
  'padding:6px 10px 5px 11px;margin:0 0 3px 0;' +
  'font-size:13px;';

/** 工具过程：挂在主流程下的细线分支，体量明显更小、更淡 */
const _toolBranch =
  'display:block;box-sizing:border-box;' +
  'border-radius:0;box-shadow:none;border:none;' +
  'line-height:1.35;letter-spacing:0.02em;' +
  'font-size:12px;font-weight:400;' +
  'padding:1px 4px 1px 4px;margin:0 0 1px 0px;' +
  'border-left:1px solid #e5e7eb;' +
  'color:#b4bcc8;background:transparent;';

/**
 * 计划阶段（PLAN）
 * 用于：生成计划、计划完成/失败、开始执行、全部结束
 */
export function getPlanPhaseDivBox(text, stType = 'content') {
  try {
    if (!text) return '';
    const margin =
      stType === 'start' ? 'margin-top:16px;' : stType === 'end' ? 'margin-bottom:12px;' : '';
    const style =
      `${_planRow}${margin}` +
      'font-weight:600;' +
      'color:#0f172a;background:#f1f5f9;border-left:3px solid #2563eb;';
    return `<div data-plan-phase="true" data-tool="true" style="${style}">${text}</div>\n\n`;
  } catch (error) {
    return '';
  }
}

/**
 * 步骤边界（Step）— 视觉弱于 PLAN：中性灰、细条、不加粗
 * 用于：步骤标题、步骤完成
 */
export function getPlanStepDivBox(text, stType = 'content') {
  try {
    if (!text) return '';
    const margin =
      stType === 'start' ? 'margin-top:8px;' : stType === 'end' ? 'margin-bottom:8px;' : '';
    const style =
      `${_stepRow}${margin}` +
      'font-weight:400;' +
      'color:#64748b;background:#f8fafc;border-left:2px solid #cbd5e1;';
    return `<div data-plan-step="true" data-tool="true" style="${style}">${text}</div>\n\n`;
  } catch (error) {
    return '';
  }
}

export function formatToolDisplayName(name, maxLength = 25) {
  const chars = Array.from(String(name || ""));
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join("")}...` : chars.join("");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getToolStatusIcon(status = 'running') {
  const iconStyle = 'display:inline-block;width:18px;height:18px;flex:0 0 18px;';

  if (status === 'success') {
    return `<svg viewBox="0 0 16 16" fill="none" style="${iconStyle}" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="#22c55e" stroke-width="1.4"></circle><path d="M5.2 8.1l1.8 1.9 3.8-4.2" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  }

  return `<svg viewBox="0 0 16 16" fill="none" style="${iconStyle}" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="#94a3b8" stroke-width="1.4"></circle><path d="M8 5.1v3.1l2.2 1.3" stroke="#64748b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
}

/**
 * 工具调用（Tool）— 弱分支行
 * 用于：真实工具执行开始、完成
 */
export function getToolDivBox(payload, stType = 'start') {
  try {
    if (!payload) return '';

    const normalized = typeof payload === 'string'
      ? { text: payload, label: '', status: 'running' }
      : payload;
    const {
      text = '',
      label = '',
      status = 'running',
      meta = ''
    } = normalized || {};

    if (!text) return '';
    const margin =
      stType === 'start'
        ? 'margin-top:7px;'
        : stType === 'end'
          ? 'margin-bottom:7px;'
          : '';
    const style = `${_toolBranch}${margin}display:flex;align-items:center;gap:6px;`;
    const labelStyle =
      'display:inline-block;font-size:10px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;';
    const textStyle = 'display:inline-block;color:#818181;';
    const metaStyle = 'display:inline-block;margin-left:4px;color:#94a3b8;';
    const icon = getToolStatusIcon(status);
    const labelHtml = label ? `<span style="${labelStyle}">${escapeHtml(label)}</span>` : '';
    const metaHtml = meta ? `<span style="${metaStyle}">${escapeHtml(meta)}</span>` : '';

    return `<div data-tool="true" data-tool-muted="true" data-tool-status="${escapeHtml(status)}" style="${style}">${icon}${labelHtml}<span style="${textStyle}">${escapeHtml(text)}</span>${metaHtml}</div>\n\n`;
  } catch (error) {
    return '';
  }
}
