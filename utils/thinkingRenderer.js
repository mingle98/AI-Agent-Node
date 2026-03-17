export function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function wrapThinkingOpen(summaryText = "深度思考过程") {
  return `<details open style="margin: 8px 0; padding: 0;"><summary style="cursor: pointer; color: #999; font-size: 13px;position: relative;left: -2px;font-weight: 500;padding-bottom: 3px;">${escapeHtml(summaryText)} 🌀 </summary><div style="border-left: 2px solid #d9d9d9; padding-left: 8px; color: #999; font-size: 12px; font-family: inherit;">`;
}

export function wrapThinkingClose() {
  return `</div></details>\n\n---\n`;
}
