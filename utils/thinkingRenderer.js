export function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 需要给思考过程的标签加上 data-thinking="true"方便前端复制的时候移除这些内容
export function wrapThinkingOpen(summaryText = "深度思考过程") {
  return `<details open style="margin: 8px 0; padding: 0; user-select: none;" data-thinking="true"><summary style="cursor: pointer; color: #999; font-size: 13px;position: relative;left: -2px;font-weight: 500;padding-bottom: 3px; user-select: none;">${escapeHtml(summaryText)} 🌀 </summary><div style="border-left: 2px solid #d9d9d9; padding-left: 8px; color: #999; font-size: 12px; font-family: inherit; user-select: none;"><div class="thinking-content" style="color: #999; font-size: 12px;"><style>.thinking-content :is(h1,h2,h3,h4,h5,h6,p,ul,ol,li,blockquote,pre,code,strong,em,span,a){color:#999;font-size:inherit;margin:4px 0}.thinking-content :is(h1,h2,h3,h4,h5,h6){font-size:12px;font-weight:500}.thinking-content pre,.thinking-content code{font-size:11px;background:#f5f5f5;padding:2px 4px;border-radius:3px}.thinking-content blockquote{border-left:2px solid #e0e0e0;padding-left:6px;margin:4px 0}</style>`;
}

export function wrapThinkingClose() {
  return `</div></div></details>\n\n`;
}
