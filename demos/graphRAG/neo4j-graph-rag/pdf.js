import fs from "node:fs";
import pdfParse from "pdf-parse";

// 这个文件把 PDF -> 纯文本。
//
// pdf-parse 适合做学习 demo：
// - 直接从 PDF 中提取 text
// - 不做版面还原（表格/页眉页脚可能会影响抽取效果）
//
// 生产场景通常会：
// - 更强的 PDF 解析（例如基于布局的分块）
// - 去噪（页码、页眉页脚、脚注）
export async function extractPdfText(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  return (data.text || "").replace(/\r\n/g, "\n");
}
