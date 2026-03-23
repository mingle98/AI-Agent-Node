// ========== 多种文件格式处理器（Excel、Word、PDF、图片等） ==========

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import PDFKit from 'pdfkit';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { Document, Paragraph, TextRun, Packer, PageOrientation, SectionType } from 'docx';
import { resolveWorkspacePath, getPublicUrl, FILE_MANAGER_CONFIG } from './fileManager.js';
import { CONFIG } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHINESE_FONT_PATH = path.join(__dirname, '../assets/fonts/NotoSansSC.otf');

async function isValidFontFile(fontPath) {
  try {
    const fd = await fs.open(fontPath, 'r');
    const buf = Buffer.alloc(4);
    await fd.read(buf, 0, 4, 0);
    await fd.close();
    const magic = buf.toString('hex');
    return (
      magic === '4f54544f' || // OTF: OTTO
      magic === '00010000' || // TTF
      magic === '74727565' || // TTF: true
      magic === '74746366'    // TTC: ttcf
    );
  } catch {
    return false;
  }
}
const CHINESE_FONT_CANDIDATES = [
  CHINESE_FONT_PATH,
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/STHeiti Light.ttc',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc'
].filter(fontPath => fontPath.endsWith('.otf') || fontPath.endsWith('.ttf'));

// ========== Excel 文件处理 ==========

/**
 * 读取 Excel 文件
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @param {number} options.sheetIndex - 工作表索引（默认0）
 * @param {string} options.sheetName - 工作表名称（优先级高于sheetIndex）
 * @returns {Promise<Object>}
 */
export async function readExcel(filePath, sessionId, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { sheetIndex = 0, sheetName = null } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absolutePath);
    
    // 获取工作表
    let worksheet;
    if (sheetName) {
      worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) {
        throw new Error(`工作表 "${sheetName}" 不存在`);
      }
    } else {
      worksheet = workbook.worksheets[sheetIndex];
      if (!worksheet) {
        throw new Error(`工作表索引 ${sheetIndex} 超出范围`);
      }
    }
    
    // 提取数据
    const data = [];
    worksheet.eachRow((row, rowNumber) => {
      const rowData = row.values.slice(1); // 移除第一个空元素
      data.push({
        rowNumber,
        values: rowData.map(cell => {
          if (cell && typeof cell === 'object' && 'text' in cell) {
            return cell.text;
          }
          if (cell && typeof cell === 'object' && 'formula' in cell) {
            return { formula: cell.formula, result: cell.result };
          }
          return cell;
        })
      });
    });
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      sheets: workbook.worksheets.map(sheet => ({
        name: sheet.name,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount
      })),
      currentSheet: {
        name: worksheet.name,
        index: worksheet.id
      },
      data: data.slice(0, 1000), // 限制返回行数
      totalRows: data.length,
      message: `成功读取 Excel 文件，共 ${workbook.worksheets.length} 个工作表，当前工作表 "${worksheet.name}" 有 ${data.length} 行数据`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 创建/写入 Excel 文件
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Array<Array>} data - 二维数组数据
 * @param {Object} options - 选项
 * @param {string} options.sheetName - 工作表名称
 * @param {Array} options.headers - 表头
 * @param {boolean} options.overwrite - 是否覆盖
 * @returns {Promise<Object>}
 */
export async function writeExcel(filePath, sessionId, data, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { sheetName = 'Sheet1', headers = null, overwrite = false } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    }
    
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    workbook.modified = new Date();
    
    const worksheet = workbook.addWorksheet(sheetName);
    
    // 添加表头
    if (headers && headers.length > 0) {
      worksheet.addRow(headers);
      // 设置表头样式
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    }
    
    // 添加数据
    if (Array.isArray(data)) {
      data.forEach(row => {
        if (Array.isArray(row)) {
          worksheet.addRow(row);
        } else if (typeof row === 'object') {
          worksheet.addRow(Object.values(row));
        }
      });
    }
    
    // 自动调整列宽
    worksheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const cellLength = cell.value ? String(cell.value).length : 0;
        if (cellLength > maxLength) {
          maxLength = Math.min(cellLength, 50);
        }
      });
      column.width = maxLength + 2;
    });
    
    await workbook.xlsx.writeFile(absolutePath);
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      sheetName: sheetName,
      rowCount: data.length,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `Excel 文件创建成功: ${filePath}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 向 Excel 文件追加数据
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Array<Array>} data - 要追加的数据
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function appendToExcel(filePath, sessionId, data, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { sheetName = null } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    
    // 检查文件存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (!exists) {
      // 文件不存在则创建
      return await writeExcel(filePath, sessionId, data, options);
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absolutePath);
    
    // 获取工作表
    const worksheet = sheetName 
      ? workbook.getWorksheet(sheetName) 
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error(`工作表不存在: ${sheetName || '默认工作表'}`);
    }
    
    // 追加数据
    const startRow = worksheet.rowCount;
    if (Array.isArray(data)) {
      data.forEach(row => {
        if (Array.isArray(row)) {
          worksheet.addRow(row);
        } else if (typeof row === 'object') {
          worksheet.addRow(Object.values(row));
        }
      });
    }
    
    await workbook.xlsx.writeFile(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      sheetName: worksheet.name,
      appendedRows: data.length,
      totalRows: worksheet.rowCount,
      message: `成功向 Excel 文件追加 ${data.length} 行数据，当前共 ${worksheet.rowCount} 行\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

// ========== Word 文件处理 ==========

/**
 * 读取 Word 文件（.docx）
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>}
 */
export async function readWord(filePath, sessionId) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    
    const result = await mammoth.extractRawText({ path: absolutePath });
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      content: result.value,
      messages: result.messages,
      message: `成功读取 Word 文件，共 ${result.value.length} 字符`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 读取 Word 文件为 HTML
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>}
 */
export async function readWordAsHtml(filePath, sessionId) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    
    const result = await mammoth.convertToHtml({ path: absolutePath });
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      html: result.value,
      messages: result.messages,
      message: `成功将 Word 文件转换为 HTML`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 创建简单的 Word 文件（使用 HTML 转换）
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {string} htmlContent - HTML 内容
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function writeWord(filePath, sessionId, htmlContent, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false, title = 'Document' } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    }
    
    // 由于 mammoth 只支持读取，我们使用简单的 HTML 模板保存
    // 实际项目中可以使用 docx 库来创建真正的 Word 文档
    const docTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #333; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>
    `.trim();
    
    await fs.writeFile(absolutePath, docTemplate);
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      note: '已保存为 HTML 格式（Word 兼容），建议使用专业库生成 .docx 文件',
      message: `文档创建成功: ${filePath}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 创建真正的 Word 文件（.docx 格式，A4 纸张）
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Array<Object>} paragraphs - 段落数组，每个段落包含 text 和可选的 style 属性
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function writeDocx(filePath, sessionId, paragraphs, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false, title = 'Document' } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    }
    
    // A4 纸张尺寸（单位：twips，1英寸 = 1440 twips）
    // A4: 210mm x 297mm = 8.27英寸 x 11.69英寸
    const A4_WIDTH = 11906;   // 约 8.27 英寸
    const A4_HEIGHT = 16838;  // 约 11.69 英寸
    const MARGIN = 1440;      // 1 英寸边距
    
    // 构建段落数组
    const docParagraphs = [];
    
    if (Array.isArray(paragraphs)) {
      for (const para of paragraphs) {
        if (typeof para === 'string') {
          // 简单字符串段落
          docParagraphs.push(new Paragraph({
            children: [new TextRun({ text: para })]
          }));
        } else if (para && typeof para === 'object') {
          // 带样式的段落
          const textRuns = [];
          
          if (para.text) {
            const runOptions = { text: para.text };
            
            // 应用样式
            if (para.bold) runOptions.bold = true;
            if (para.italic) runOptions.italic = true;
            if (para.underline) runOptions.underline = true;
            if (para.fontSize) runOptions.size = para.fontSize * 2; // docx 使用 half-points
            if (para.color) runOptions.color = para.color;
            if (para.font) runOptions.font = para.font;
            
            textRuns.push(new TextRun(runOptions));
          }
          
          if (para.runs && Array.isArray(para.runs)) {
            for (const run of para.runs) {
              const runOptions = typeof run === 'string' ? { text: run } : {
                text: run.text || '',
                bold: run.bold,
                italic: run.italic,
                underline: run.underline,
                size: run.fontSize ? run.fontSize * 2 : undefined,
                color: run.color,
                font: run.font
              };
              textRuns.push(new TextRun(runOptions));
            }
          }
          
          const paraOptions = { children: textRuns };
          
          // 段落样式
          if (para.heading) {
            paraOptions.heading = para.heading; // Heading1, Heading2, etc.
          }
          if (para.alignment) {
            paraOptions.alignment = para.alignment; // left, center, right, justified
          }
          if (para.spacing && para.spacing.after) {
            paraOptions.spacing = { after: para.spacing.after * 20 }; // twips
          }
          
          docParagraphs.push(new Paragraph(paraOptions));
        }
      }
    }
    
    // 创建文档，使用 A4 纸张尺寸
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            width: A4_WIDTH,
            height: A4_HEIGHT,
            margin: {
              top: MARGIN,
              right: MARGIN,
              bottom: MARGIN,
              left: MARGIN
            }
          }
        },
        children: docParagraphs.length > 0 ? docParagraphs : [new Paragraph({
          children: [new TextRun({ text: '' })]
        })]
      }]
    });
    
    // 生成并保存文档
    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(absolutePath, buffer);
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      pageSize: 'A4 (210mm x 297mm)',
      paragraphCount: docParagraphs.length,
      message: `Word 文档创建成功: ${filePath}（A4 纸张）\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

// ========== PDF 文件处理 ==========

/**
 * 读取 PDF 文件文本内容
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>}
 */
export async function readPdf(filePath, sessionId) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    
    const dataBuffer = await fs.readFile(absolutePath);
    const pdfData = await pdfParse(dataBuffer);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      pageCount: pdfData.numpages,
      info: pdfData.info,
      content: pdfData.text.slice(0, 50000), // 限制返回内容长度
      isTruncated: pdfData.text.length > 50000,
      totalLength: pdfData.text.length,
      message: `成功读取 PDF 文件，共 ${pdfData.numpages} 页，${pdfData.text.length} 字符`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 创建简单的 PDF 文件（使用 PDFKit + 中文字体）
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Array<Object>} pages - 页面内容数组
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function writePdf(filePath, sessionId, pages, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false, title = 'Document' } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    }
    
    // 使用 PDFKit 创建 PDF（按需初始化，避免模块加载时因字体异常崩溃）
    const doc = new PDFKit();
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    
    const pdfPromise = new Promise((resolve, reject) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        fs.writeFile(absolutePath, pdfBuffer).then(resolve).catch(reject);
      });
      doc.on('error', reject);
    });
    
    // 加载中文字体（如果可用）
    let hasChineseFont = false;
    for (const fontPath of CHINESE_FONT_CANDIDATES) {
      try {
        // 先检查文件是否存在且是合法字体格式
        await fs.access(fontPath);
        if (!(await isValidFontFile(fontPath))) {
          console.warn(`⚠️ 字体文件格式无效（非字体二进制）: ${fontPath}`);
          continue;
        }
        // 再尝试注册字体
        try {
          doc.registerFont('ChineseFont', fontPath);
          hasChineseFont = true;
          break;
        } catch (fontError) {
          console.warn(`⚠️ 字体加载失败: ${fontPath} - ${fontError.message}`);
          // 继续尝试下一个字体
        }
      } catch {
        // 文件不存在，尝试下一个
      }
    }
    
    let totalTextLength = 0;
    let pageCount = 0;
    
    if (Array.isArray(pages)) {
      for (let i = 0; i < pages.length; i++) {
        const pageData = pages[i];
        
        if (i > 0) {
          doc.addPage();
        }
        pageCount++;
        
        if (pageData.text) {
          const rawText = String(pageData.text);
          const text = hasChineseFont
            ? rawText
            : rawText.replace(/[^\x00-\x7F]/g, '?');
          totalTextLength += text.length;
          
          const fontSize = pageData.fontSize || 12;
          const margin = 50;
          
          // 使用中文字体（如果有）
          if (hasChineseFont) {
            try {
              doc.font('ChineseFont');
            } catch (fontErr) {
              console.warn(`⚠️ 字体切换失败: ${fontErr.message}`);
              hasChineseFont = false;
            }
          }
          doc.fontSize(fontSize);
          doc.text(text, margin, margin, {
            width: doc.page.width - 2 * margin,
            height: doc.page.height - 2 * margin,
            align: 'left'
          });
        }
      }
    }
    
    doc.end();
    await pdfPromise;
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      pageCount: pageCount || 1,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      textLength: totalTextLength,
      hasChineseFont,
      message: `PDF 文件创建成功: ${filePath}（${pageCount || 1}页，${totalTextLength}字符${hasChineseFont ? '，含中文支持' : '，无中文字体'}）\n访问地址: ${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 合并多个 PDF 文件
 * @param {Array<string>} filePaths - PDF 文件路径数组（相对用户workspace）
 * @param {string} outputPath - 输出文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function mergePdfs(filePaths, outputPath, sessionId, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false } = options;
    const outputAbsolute = resolveWorkspacePath(outputPath, sessionId);
    const dirPath = path.dirname(outputAbsolute);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(outputAbsolute).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${outputPath}，如需覆盖请设置 overwrite: true`);
    }
    
    const mergedPdf = await PDFDocument.create();
    
    for (const filePath of filePaths) {
      const absolutePath = resolveWorkspacePath(filePath, sessionId);
      const pdfBytes = await fs.readFile(absolutePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }
    
    const mergedPdfBytes = await mergedPdf.save();
    await fs.writeFile(outputAbsolute, mergedPdfBytes);
    
    const stats = await fs.stat(outputAbsolute);
    
    return {
      success: true,
      inputFiles: filePaths,
      outputPath: outputPath,
      url: getPublicUrl(outputAbsolute, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(outputAbsolute, sessionId)}`,
      pageCount: mergedPdf.getPageCount(),
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `成功合并 ${filePaths.length} 个 PDF 文件，共 ${mergedPdf.getPageCount()} 页\n访问地址: ${getPublicUrl(outputAbsolute, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(outputAbsolute, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ========== 图片文件处理 ==========

/**
 * 获取图片文件信息
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>}
 */
export async function getImageInfo(filePath, sessionId) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const stats = await fs.stat(absolutePath);
    
    // 读取文件头部获取图片尺寸
    const buffer = await fs.readFile(absolutePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    
    let width = null;
    let height = null;
    
    // 简单的图片尺寸检测
    if (ext === 'png') {
      if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        width = buffer.readUInt32BE(16);
        height = buffer.readUInt32BE(20);
      }
    } else if (ext === 'jpg' || ext === 'jpeg') {
      // 简化的 JPEG 尺寸检测
      for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i] === 0xFF && (buffer[i + 1] === 0xC0 || buffer[i + 1] === 0xC2)) {
          height = buffer.readUInt16BE(i + 5);
          width = buffer.readUInt16BE(i + 7);
          break;
        }
      }
    } else if (ext === 'gif') {
      if (buffer.slice(0, 3).toString() === 'GIF') {
        width = buffer.readUInt16LE(6);
        height = buffer.readUInt16LE(8);
      }
    } else if (ext === 'bmp') {
      width = buffer.readUInt32LE(18);
      height = buffer.readUInt32LE(22);
    }
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      type: ext,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      width,
      height,
      dimensions: width && height ? `${width} x ${height}` : '未知',
      modifiedAt: stats.mtime.toISOString(),
      message: `图片信息获取成功: ${ext.toUpperCase()} 格式，${formatFileSize(stats.size)}${width && height ? `，尺寸: ${width}x${height}` : ''}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 创建 SVG 图片
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {string} svgContent - SVG 内容
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function writeSvg(filePath, sessionId, svgContent, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = false } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    }
    
    // 确保 SVG 内容有效
    let finalSvg = svgContent;
    if (!svgContent.trim().startsWith('<svg') && !svgContent.trim().startsWith('<?xml')) {
      finalSvg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n${svgContent}\n</svg>`;
    }
    
    await fs.writeFile(absolutePath, finalSvg);
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      type: 'svg',
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `SVG 文件创建成功: ${filePath}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

// ========== CSV 文件处理 ==========

/**
 * 解析 CSV 内容
 * @param {string} content - CSV 内容
 * @param {Object} options - 选项
 * @returns {Array<Object>}
 */
function parseCSV(content, options = {}) {
  const { delimiter = ',', hasHeader = true } = options;
  const lines = content.trim().split('\n');
  
  if (lines.length === 0) return [];
  
  let headers = [];
  let startIndex = 0;
  
  if (hasHeader) {
    headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    startIndex = 1;
  } else {
    const firstRow = lines[0].split(delimiter);
    headers = firstRow.map((_, i) => `Column${i + 1}`);
  }
  
  const data = [];
  for (let i = startIndex; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    data.push(row);
  }
  
  return { headers, data };
}

/**
 * 将数据转换为 CSV
 * @param {Array<Object>} data - 数据数组
 * @param {Array<string>} headers - 表头
 * @returns {string}
 */
function toCSV(data, headers = null) {
  if (!data || data.length === 0) return '';
  
  const cols = headers || Object.keys(data[0]);
  const lines = [];
  
  // 表头
  lines.push(cols.join(','));
  
  // 数据行
  data.forEach(row => {
    const values = cols.map(col => {
      const value = String(row[col] || '');
      // 如果值包含逗号、换行或引号，需要用引号包裹
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    lines.push(values.join(','));
  });
  
  return lines.join('\n');
}

/**
 * 读取 CSV 文件
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function readCsv(filePath, sessionId, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const content = await fs.readFile(absolutePath, 'utf-8');
    
    const { headers, data } = parseCSV(content, options);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      headers: headers,
      data: data.slice(0, 1000), // 限制返回行数
      totalRows: data.length,
      message: `成功读取 CSV 文件，共 ${data.length} 行，${headers.length} 列`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 写入 CSV 文件
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Array<Object>} data - 数据
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function writeCsv(filePath, sessionId, data, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = true, headers = null } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    }
    
    const csvContent = toCSV(data, headers);
    await fs.writeFile(absolutePath, csvContent, 'utf-8');
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      rowCount: data.length,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `CSV 文件创建成功: ${filePath}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

// ========== JSON 文件处理 ==========

/**
 * 读取 JSON 文件
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @returns {Promise<Object>}
 */
export async function readJson(filePath, sessionId) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const data = JSON.parse(content);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      data: data,
      message: `成功读取 JSON 文件`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

/**
 * 写入 JSON 文件
 * @param {string} filePath - 文件路径（相对用户workspace）
 * @param {string} sessionId - 用户会话ID
 * @param {Object} data - 数据
 * @param {Object} options - 选项
 * @returns {Promise<Object>}
 */
export async function writeJson(filePath, sessionId, data, options = {}) {
  try {
    if (!sessionId) {
      throw new Error('需要提供 sessionId 来访问文件系统');
    }
    
    const { overwrite = true, pretty = true } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    
    // 确保目录存在
    await fs.mkdir(dirPath, { recursive: true });
    
    // 检查是否已存在
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) {
      throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    }
    
    const jsonContent = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    await fs.writeFile(absolutePath, jsonContent, 'utf-8');
    
    const stats = await fs.stat(absolutePath);
    
    return {
      success: true,
      filePath: filePath,
      url: getPublicUrl(absolutePath, sessionId),
      fullUrl: `${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `JSON 文件创建成功: ${filePath}\n访问地址: ${getPublicUrl(absolutePath, sessionId)}\n完整地址: ${CONFIG.baseUrl}${getPublicUrl(absolutePath, sessionId)}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

// ========== 工具函数 ==========

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}
