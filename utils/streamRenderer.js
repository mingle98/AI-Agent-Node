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
  'padding:4px 6px 1px 10px;margin:0 0 1px 12px;' +
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
    return `<div data-plan-phase="true" data-tool="true" style="${style}">${text}</div>\n`;
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
    return `<div data-plan-step="true" data-tool="true" style="${style}">${text}</div>\n`;
  } catch (error) {
    return '';
  }
}

/**
 * 工具调用（Tool）— 弱分支行
 * 用于：真实工具执行开始、完成
 */
export function getToolDivBox(text, stType = 'content') {
  try {
    if (!text) return '';
    const margin =
      stType === 'start'
        ? 'margin-top:10px;'
        : stType === 'end'
          ? 'margin-bottom:10px;'
          : '';
    const style = `${_toolBranch}${margin}`;
    return `<div data-tool="true" data-tool-muted="true" style="${style}">${text}</div>\n`;
  } catch (error) {
    return '';
  }
}
