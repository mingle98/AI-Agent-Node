// ========== 多种文件格式处理器（Excel、Word、PDF、图片等） ==========

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import PDFKit from 'pdfkit';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
import unzipper from 'unzipper';
import { resolveWorkspacePath, getPublicUrlInfo } from './fileManager.js';
import { readExcel as readExcelImpl, writeExcel as writeExcelImpl, appendToExcel as appendToExcelImpl } from './officeExcel.js';
import { writeDocx as writeDocxImpl } from './officeWord.js';
import { formatFileSize } from './officeFormatUtils.js';
import { renderMarkdownOnPdf } from './pdfMarkdownRenderer.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHINESE_FONT_PATH = process.env.CHINESE_FONT_PATH
  ? path.resolve(process.env.CHINESE_FONT_PATH)
  : path.join(__dirname, '../assets/fonts/NotoSansSC.otf');

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
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJKSC-Regular.otf',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/truetype/arphic/ukai.ttc',
  '/usr/share/fonts/truetype/arphic/uming.ttc',
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/STHeiti Light.ttc',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc',
].filter((fontPath) => /\.(otf|ttf|ttc)$/i.test(fontPath));

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
  return readExcelImpl(filePath, sessionId, options);
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
  return writeExcelImpl(filePath, sessionId, data, options);
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
  return appendToExcelImpl(filePath, sessionId, data, options);
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      note: '已保存为 HTML 格式（Word 兼容），建议使用专业库生成 .docx 文件',
      message: `文档创建成功: ${filePath}\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}`
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
  return writeDocxImpl(filePath, sessionId, paragraphs, options);
}

// ========== PowerPoint 文件处理 ==========

function normalizePptInput(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    if (Array.isArray(input.slides)) return input.slides;
    return [input];
  }
  const raw = String(input || '').trim();
  if (!raw) return [];
  if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.slides)) return parsed.slides;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {}
  }
  const sections = raw.split(/\n\s*---+\s*\n/g).map((section) => section.trim()).filter(Boolean);
  return sections.map((section, index) => {
    const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const first = lines[0] || `幻灯片 ${index + 1}`;
    const title = first.replace(/^#+\s*/, '');
    const bulletLines = lines.slice(1).map((line) => line.replace(/^[-*]\s+/, '')).filter(Boolean);
    return { title, bullets: bulletLines.length > 0 ? bulletLines : lines.slice(1) };
  });
}

function normalizePptTableRows(table) {
  if (!Array.isArray(table) || table.length === 0) return [];
  return table.map((row) => Array.isArray(row) ? row.map((cell) => cell == null ? '' : String(cell)) : [String(row)]);
}

const PPT_TEMPLATE_PRESETS = {
  default: {
    background: 'F7F9FC',
    titleColor: '1F2937',
    bodyColor: '334155',
    accent: '2563EB',
    cardBg: 'FFFFFF',
    cardTitle: '64748B',
    cardValue: '0F172A',
    tableBorder: '94A3B8',
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  },
  executive: {
    background: '0F172A',
    titleColor: 'F8FAFC',
    bodyColor: 'CBD5E1',
    accent: '38BDF8',
    cardBg: '111827',
    cardTitle: '94A3B8',
    cardValue: 'F8FAFC',
    tableBorder: '334155',
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  },
  growth: {
    background: 'FFF7ED',
    titleColor: '7C2D12',
    bodyColor: '9A3412',
    accent: 'EA580C',
    cardBg: 'FFFFFF',
    cardTitle: 'C2410C',
    cardValue: '7C2D12',
    tableBorder: 'FDBA74',
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  },
};

function getPptTheme(templateName = 'default') {
  const template = PPT_TEMPLATE_PRESETS[templateName] || PPT_TEMPLATE_PRESETS.default;
  return {
    template,
    theme: {
      headFontFace: template.headFontFace,
      bodyFontFace: template.bodyFontFace,
      lang: 'zh-CN',
    },
  };
}

function resolvePptAssetPath(assetPath, sessionId) {
  if (!assetPath) return null;
  if (/^(https?:)?\/\//i.test(assetPath) || assetPath.startsWith('data:')) return assetPath;
  return resolveWorkspacePath(assetPath, sessionId);
}

function normalizePptChartSeries(series = []) {
  if (!Array.isArray(series)) return [];
  return series
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      name: item.name || `Series ${index + 1}`,
      labels: Array.isArray(item.labels) ? item.labels.map((label) => String(label)) : [],
      values: Array.isArray(item.values) ? item.values.map((value) => Number(value)) : [],
    }))
    .filter((item) => item.labels.length > 0 && item.values.length > 0);
}

function renderPptDataCards(slide, cards = [], template) {
  if (!Array.isArray(cards) || cards.length === 0) return false;
  const gap = 0.22;
  const cardCount = Math.min(cards.length, 4);
  const totalWidth = 11.6;
  const cardWidth = (totalWidth - gap * (cardCount - 1)) / cardCount;
  cards.slice(0, cardCount).forEach((card, index) => {
    const x = 0.7 + index * (cardWidth + gap);
    slide.addShape('roundRect', {
      x,
      y: 1.45,
      w: cardWidth,
      h: 1.25,
      rectRadius: 0.08,
      fill: { color: template.cardBg },
      line: { color: template.tableBorder, width: 1 },
      shadow: { type: 'outer', color: '64748B', blur: 1, angle: 45, offset: 1, opacity: 0.18 },
    });
    slide.addText(String(card?.label || `指标 ${index + 1}`), {
      x: x + 0.18,
      y: 1.63,
      w: cardWidth - 0.36,
      h: 0.28,
      fontFace: template.bodyFontFace,
      fontSize: 10,
      bold: true,
      color: template.cardTitle,
      margin: 0,
    });
    slide.addText(String(card?.value ?? '--'), {
      x: x + 0.18,
      y: 1.92,
      w: cardWidth - 0.36,
      h: 0.4,
      fontFace: template.headFontFace,
      fontSize: 20,
      bold: true,
      color: template.cardValue,
      margin: 0,
    });
    if (card?.change || card?.meta) {
      slide.addText(String(card.change || card.meta), {
        x: x + 0.18,
        y: 2.32,
        w: cardWidth - 0.36,
        h: 0.2,
        fontFace: template.bodyFontFace,
        fontSize: 9,
        color: template.accent,
        margin: 0,
      });
    }
  });
  return true;
}

function renderPptChart(slide, chart, template, hasCards) {
  const series = normalizePptChartSeries(chart?.series);
  if (series.length === 0) return false;
  const chartType = chart?.type || 'bar';
  const chartTitle = chart?.title || '';
  slide.addChart(chartType, series, {
    x: 0.7,
    y: hasCards ? 3.0 : 1.7,
    w: 11.6,
    h: hasCards ? 3.7 : 4.8,
    catAxisLabelFontFace: template.bodyFontFace,
    catAxisLabelFontSize: 10,
    valAxisLabelFontFace: template.bodyFontFace,
    valAxisLabelFontSize: 10,
    chartColors: [template.accent, '22C55E', 'F59E0B', 'A855F7'],
    showLegend: series.length > 1,
    showTitle: Boolean(chartTitle),
    title: chartTitle,
    titleFontFace: template.headFontFace,
    titleFontSize: 14,
    titleColor: template.titleColor,
    showValue: Boolean(chart?.showValue),
    showCatName: false,
    showPercent: chartType === 'pie' || chartType === 'doughnut',
    legendPos: 'b',
    valGridLine: { color: 'E2E8F0', pt: 1 },
    showCatAxisTitle: Boolean(chart?.xAxisTitle),
    catAxisTitle: chart?.xAxisTitle,
    showValAxisTitle: Boolean(chart?.yAxisTitle),
    valAxisTitle: chart?.yAxisTitle,
  });
  return true;
}

function renderPptImage(slide, image, sessionId, hasCards, template) {
  const pathOrData = resolvePptAssetPath(image?.path || image?.src || image?.url || image?.data, sessionId);
  if (!pathOrData) return false;
  const x = image?.x ?? 0.7;
  const y = image?.y ?? (hasCards ? 3.0 : 1.7);
  const w = image?.w ?? 11.6;
  const h = image?.h ?? (hasCards ? 3.7 : 4.8);
  slide.addImage({
    ...(pathOrData.startsWith('data:') ? { data: pathOrData } : { path: pathOrData }),
    x,
    y,
    w,
    h,
    altText: image?.alt || image?.caption || 'PPT image',
    sizing: image?.fit ? { type: image.fit, w, h } : undefined,
  });
  if (image?.caption) {
    slide.addText(String(image.caption), {
      x,
      y: y + h + 0.08,
      w,
      h: 0.28,
      fontFace: template.bodyFontFace,
      fontSize: 10,
      color: template.bodyColor,
      italic: true,
      margin: 0,
    });
  }
  return true;
}

function extractPptSlideText(xml = '') {
  return Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((match) => match[1]).join('\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export async function readPptx(filePath, sessionId) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId 来访问文件系统');
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const buffer = await fs.readFile(absolutePath);
    const zip = await unzipper.Open.buffer(buffer);
    const slideEntries = zip.files.filter((file) => /^ppt\/slides\/slide\d+\.xml$/.test(file.path)).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    const slides = [];
    for (const entry of slideEntries) {
      const xml = await entry.buffer();
      const text = extractPptSlideText(xml.toString('utf8'));
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const title = lines.find((line) => /[\u4e00-\u9fa5A-Za-z0-9]/.test(line) && line.length >= 2 && line.length <= 30) || lines[0] || `Slide ${slides.length + 1}`;
      slides.push({ index: slides.length + 1, title, text, bulletCount: Math.max(0, lines.length - 1) });
    }
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);
    return { success: true, filePath, url: urlInfo?.fullUrl || null, fullUrl: urlInfo?.fullUrl || null, signedPath: urlInfo?.path || null, slideCount: slides.length, slides, message: `成功读取 PowerPoint 文件，共 ${slides.length} 页幻灯片` };
  } catch (error) {
    return { success: false, error: error.message, filePath };
  }
}

export async function writePptx(filePath, sessionId, content, options = {}) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId 来访问文件系统');
    const { overwrite = false, title = 'Presentation', layout = 'LAYOUT_WIDE', template = 'default' } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    await fs.mkdir(dirPath, { recursive: true });
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    const slidesData = normalizePptInput(content);
    const pptx = new PptxGenJS();
    pptx.layout = layout;
    pptx.author = 'AI-Agent-Node';
    pptx.subject = title;
    pptx.title = title;
    pptx.company = 'AI-Agent-Node';
    pptx.lang = 'zh-CN';
    const { template: deckTemplate, theme } = getPptTheme(template);
    pptx.theme = theme;
    const safeSlides = slidesData.length > 0 ? slidesData : [{ title: title || '演示文稿', bullets: [] }];
    safeSlides.forEach((slideData, index) => {
      const slide = pptx.addSlide();
      const activeTemplate = PPT_TEMPLATE_PRESETS[slideData?.template] || deckTemplate;
      const titleText = slideData?.title || slideData?.heading || `幻灯片 ${index + 1}`;
      const bullets = Array.isArray(slideData?.bullets) ? slideData.bullets : Array.isArray(slideData?.points) ? slideData.points : [];
      const bodyText = slideData?.text || slideData?.content || '';
      const tableRows = normalizePptTableRows(slideData?.table || slideData?.rows);
      const cards = Array.isArray(slideData?.cards) ? slideData.cards : [];
      const chart = slideData?.chart || null;
      const image = slideData?.image || slideData?.heroImage || null;

      slide.background = { color: activeTemplate.background };
      slide.addText(titleText, { x: 0.5, y: 0.4, w: 12.3, h: 0.6, fontFace: activeTemplate.headFontFace, bold: true, fontSize: 24, color: activeTemplate.titleColor });
      if (bodyText) {
        slide.addText(String(bodyText), { x: 0.7, y: 1.02, w: 11.8, h: cards.length > 0 || chart || image || tableRows.length > 0 || bullets.length > 0 ? 0.72 : 4.8, fontFace: activeTemplate.bodyFontFace, fontSize: 16, color: activeTemplate.bodyColor, breakLine: true, margin: 0.02, valign: 'top' });
      }
      const hasCards = renderPptDataCards(slide, cards, activeTemplate);
      const renderedChart = chart ? renderPptChart(slide, chart, activeTemplate, hasCards) : false;
      const renderedImage = !renderedChart && image ? renderPptImage(slide, image, sessionId, hasCards, activeTemplate) : false;
      if (!renderedChart && !renderedImage && tableRows.length > 0) {
        slide.addTable(tableRows, {
          x: 0.7,
          y: bodyText ? 2.0 : 1.35,
          w: 11.6,
          h: Math.min(4.4, 0.45 * tableRows.length + 0.3),
          border: { type: 'solid', color: activeTemplate.tableBorder, pt: 1 },
          fill: { color: 'FFFFFF' },
          color: activeTemplate.cardValue,
          fontFace: activeTemplate.bodyFontFace,
          fontSize: 14,
          margin: 0.05,
          autoFit: true,
          rowH: 0.45,
          bold: false,
        });
      }
      if (bullets.length > 0) {
        const y = tableRows.length > 0
          ? (bodyText ? 6.0 : 5.3)
          : ((renderedChart || renderedImage || hasCards) ? 6.2 : (bodyText ? 2.0 : 1.35));
        slide.addText(bullets.map((item) => ({ text: String(item), options: { bullet: { indent: 18 } } })), { x: 0.9, y, w: 11.2, h: 1.0, fontFace: activeTemplate.bodyFontFace, fontSize: 18, color: activeTemplate.cardValue, breakLine: true, margin: 0.08, valign: 'top' });
      }
      if (slideData?.notes) slide.addNotes(String(slideData.notes));
    });
    await pptx.writeFile({ fileName: absolutePath });
    const stats = await fs.stat(absolutePath);
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);
    return { success: true, filePath, url: urlInfo?.fullUrl || null, fullUrl: urlInfo?.fullUrl || null, signedPath: urlInfo?.path || null, slideCount: safeSlides.length, size: stats.size, formattedSize: formatFileSize(stats.size), template, message: `PowerPoint 文件创建成功: ${filePath}\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}` };
  } catch (error) {
    return { success: false, error: error.message, filePath };
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
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
    
    const { overwrite = false, title = 'Document', contentFormat = 'markdown' } = options;
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
          const fontSize = pageData.fontSize || options.fontSize || 12;
          const margin = 50;
          const pageWantsPlain = pageData.format === 'plain';
          const optionsWantPlain = contentFormat === 'plain';
          const usePlain = pageWantsPlain || optionsWantPlain;

          if (!usePlain) {
            if (hasChineseFont) {
              try {
                doc.font('ChineseFont');
              } catch (fontErr) {
                console.warn(`⚠️ 字体切换失败: ${fontErr.message}`);
              }
            }
            renderMarkdownOnPdf(doc, rawText, {
              margin,
              hasChineseFont,
              chineseFontName: 'ChineseFont',
              baseFontSize: fontSize,
              title: i === 0 ? title : null,
            });
            totalTextLength += rawText.length;
          } else {
            const text = hasChineseFont
              ? rawText
              : rawText.replace(/[^\x00-\x7F]/g, '?');
            totalTextLength += text.length;

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
              align: 'left',
            });
          }
        }
      }
    }
    
    doc.end();
    await pdfPromise;
    
    const stats = await fs.stat(absolutePath);
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      pageCount: pageCount || 1,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      textLength: totalTextLength,
      hasChineseFont,
      message: `PDF 文件创建成功: ${filePath}（${pageCount || 1}页，${totalTextLength}字符${hasChineseFont ? '，含中文支持' : '，无中文字体'}）\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}`
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
    const urlInfo = getPublicUrlInfo(outputAbsolute, sessionId);
    
    return {
      success: true,
      inputFiles: filePaths,
      outputPath: outputPath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      pageCount: mergedPdf.getPageCount(),
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `成功合并 ${filePaths.length} 个 PDF 文件，共 ${mergedPdf.getPageCount()} 页\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}`
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      type: 'svg',
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `SVG 文件创建成功: ${filePath}\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}`
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      rowCount: data.length,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `CSV 文件创建成功: ${filePath}\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}`
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
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
    
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);

    return {
      success: true,
      filePath: filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      size: stats.size,
      formattedSize: formatFileSize(stats.size),
      message: `JSON 文件创建成功: ${filePath}\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      filePath: filePath
    };
  }
}

