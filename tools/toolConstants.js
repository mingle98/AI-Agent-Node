// ========== 工具常量定义 ==========
// 集中维护需要 sessionId 的工具列表，避免多处定义不一致

/**
 * 需要 sessionId 进行用户隔离的工具列表
 * 这些工具在调用时会自动注入 sessionId 作为第一个参数
 */
export const TOOLS_NEEDING_SESSION_ID = [
  // ========== 邮件工具 ==========
  'email_send',
  'email_template',
  
  // ========== 文件管理工具 ==========
  'file_list',
  'file_quota',
  'file_read',
  'file_write',
  'file_delete',
  'file_mkdir',
  'file_move',
  'file_copy',
  'file_info',
  'file_search',
  
  // ========== Excel 工具 ==========
  'excel_read',
  'excel_write',
  'excel_append',
  
  // ========== Word 工具 ==========
  'word_read',
  'word_read_html',
  'word_write_docx',
  
  // ========== PDF 工具 ==========
  'pdf_read',
  'pdf_write',
  'pdf_merge',
  
  // ========== CSV/JSON 工具 ==========
  'csv_read',
  'csv_write',
  'json_read',
  'json_write',
  
  // ========== 图片工具 ==========
  'image_info',
  'svg_write',
  'image_compress',
  'image_compress_batch',
  
  // ========== 压缩工具 ==========
  'zip_compress',
  'zip_extract',
  'zip_info',
  'zip_list',
  
  // ========== 定时任务工具 ==========
  'schedule_task',
  'schedule_list',
  'schedule_cancel',
];

/**
 * 检查工具是否需要 sessionId
 * @param {string} toolName - 工具名称
 * @returns {boolean}
 */
export function toolNeedsSessionId(toolName) {
  return TOOLS_NEEDING_SESSION_ID.includes(toolName);
}
