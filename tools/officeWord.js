import fs from 'fs/promises';
import path from 'path';
import { Document, Paragraph, TextRun, Packer, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, LevelFormat } from 'docx';
import { marked } from 'marked';
import { resolveWorkspacePath, getPublicUrlInfo } from './fileManager.js';
import { formatFileSize, isPlainObject } from './officeFormatUtils.js';

const DOCX_DEFAULT_FONT = '宋体';
const DOCX_DEFAULT_COLOR = '000000';
const DOCX_TABLE_BORDER_COLOR = 'B7C0D8';

function normalizeHeadingLevel(heading) {
  if (!heading) return undefined;
  if (typeof heading === 'string' && HeadingLevel[heading]) return HeadingLevel[heading];
  return heading;
}

function normalizeAlignment(alignment) {
  if (!alignment) return undefined;
  if (typeof alignment === 'string' && AlignmentType[alignment]) return AlignmentType[alignment];
  return alignment;
}

function normalizeRun(run) {
  if (run == null) return null;
  if (typeof run === 'string' || typeof run === 'number' || typeof run === 'boolean') return new TextRun({ text: String(run), font: DOCX_DEFAULT_FONT, color: DOCX_DEFAULT_COLOR });
  if (typeof run !== 'object') return null;
  return new TextRun({ text: run.text != null ? String(run.text) : '', bold: !!run.bold, italics: !!(run.italic || run.italics), underline: run.underline ? {} : undefined, size: run.fontSize ? Number(run.fontSize) * 2 : undefined, color: run.color || DOCX_DEFAULT_COLOR, font: run.font || DOCX_DEFAULT_FONT, break: run.break ? Number(run.break) : undefined });
}

function normalizeParagraphSpacing(spacing) {
  if (!spacing || typeof spacing !== 'object') return undefined;
  const result = {};
  if (spacing.before != null) result.before = Number(spacing.before) * 20;
  if (spacing.after != null) result.after = Number(spacing.after) * 20;
  if (spacing.line != null) result.line = Number(spacing.line) * 20;
  if (spacing.lineRule) result.lineRule = spacing.lineRule;
  return Object.keys(result).length > 0 ? result : undefined;
}

function createParagraphFromConfig(input, listConfig) {
  if (input == null) return new Paragraph({ children: [normalizeRun('')] });
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return new Paragraph({ children: [normalizeRun(String(input))], ...(listConfig ? { numbering: listConfig } : {}) });
  if (typeof input !== 'object') return new Paragraph({ children: [normalizeRun(String(input))] });
  if (input.type === 'blank') return new Paragraph({ children: [normalizeRun('')], spacing: normalizeParagraphSpacing(input.spacing) || { after: 160 } });
  const runs = [];
  if (input.text != null) runs.push(normalizeRun({ text: String(input.text), bold: input.bold, italic: input.italic, underline: input.underline, fontSize: input.fontSize, color: input.color, font: input.font, break: input.break }));
  if (Array.isArray(input.runs)) input.runs.forEach((run) => { const normalized = normalizeRun(run); if (normalized) runs.push(normalized); });
  if (runs.length === 0) runs.push(normalizeRun(''));
  const options = { children: runs };
  const heading = normalizeHeadingLevel(input.heading);
  if (heading) options.heading = heading;
  const alignment = normalizeAlignment(input.alignment);
  if (alignment) options.alignment = alignment;
  const spacing = normalizeParagraphSpacing(input.spacing);
  if (spacing) options.spacing = spacing;
  if (input.indent && typeof input.indent === 'object') {
    const indent = {};
    if (input.indent.left != null) indent.left = Number(input.indent.left) * 20;
    if (input.indent.right != null) indent.right = Number(input.indent.right) * 20;
    if (input.indent.firstLine != null) indent.firstLine = Number(input.indent.firstLine) * 20;
    if (input.indent.hanging != null) indent.hanging = Number(input.indent.hanging) * 20;
    if (Object.keys(indent).length > 0) options.indent = indent;
  }
  if (input.keepLines) options.keepLines = true;
  if (input.keepNext) options.keepNext = true;
  if (input.pageBreakBefore) options.pageBreakBefore = true;
  if (listConfig) options.numbering = listConfig;
  return new Paragraph(options);
}

function createTableCellFromValue(value, cellOptions = {}) {
  const normalizedCell = value && typeof value === 'object' && !Array.isArray(value) && (value.text != null || value.paragraphs || value.columnSpan || value.rowSpan || value.backgroundColor) ? value : { text: value == null ? '' : String(value) };
  const paragraphs = Array.isArray(normalizedCell.paragraphs) && normalizedCell.paragraphs.length > 0 ? normalizedCell.paragraphs.map((paragraph) => createParagraphFromConfig(paragraph)) : [createParagraphFromConfig({ text: normalizedCell.text == null ? '' : String(normalizedCell.text), bold: cellOptions.bold || normalizedCell.bold, alignment: normalizedCell.alignment })];
  return new TableCell({ children: paragraphs, columnSpan: normalizedCell.columnSpan, rowSpan: normalizedCell.rowSpan, shading: normalizedCell.backgroundColor ? { fill: normalizedCell.backgroundColor.replace('#', '') } : undefined, width: normalizedCell.width ? { size: Number(normalizedCell.width), type: WidthType.DXA } : undefined, margins: { top: 100, bottom: 100, left: 120, right: 120 } });
}

function createTableFromConfig(tableConfig) {
  const rows = Array.isArray(tableConfig.rows) ? tableConfig.rows : [];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: 'single', size: 1, color: DOCX_TABLE_BORDER_COLOR }, bottom: { style: 'single', size: 1, color: DOCX_TABLE_BORDER_COLOR }, left: { style: 'single', size: 1, color: DOCX_TABLE_BORDER_COLOR }, right: { style: 'single', size: 1, color: DOCX_TABLE_BORDER_COLOR }, insideHorizontal: { style: 'single', size: 1, color: DOCX_TABLE_BORDER_COLOR }, insideVertical: { style: 'single', size: 1, color: DOCX_TABLE_BORDER_COLOR } }, rows: rows.map((row, rowIndex) => { const cells = Array.isArray(row) ? row : Array.isArray(row?.cells) ? row.cells : []; const isHeader = !!row?.header || (rowIndex === 0 && tableConfig.firstRowAsHeader !== false); return new TableRow({ tableHeader: isHeader, children: cells.map((cell) => createTableCellFromValue(cell, { bold: isHeader })) }); }) });
}

function createListParagraphs(items, listType = 'bullet', level = 0) {
  const safeLevel = Math.max(0, Math.min(8, Number(level) || 0));
  const numbering = { reference: listType === 'ordered' ? 'ai-agent-ordered-list' : 'ai-agent-bullet-list', level: safeLevel };
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item == null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') result.push(createParagraphFromConfig({ runs: parseInlineRuns(String(item)) }, numbering));
    else if (typeof item === 'object') {
      const normalizedItem = item.text != null || item.runs ? item : { ...item, text: item.text ?? '' };
      result.push(createParagraphFromConfig(normalizedItem.text != null && !normalizedItem.runs ? { ...normalizedItem, runs: parseInlineRuns(String(normalizedItem.text)), text: undefined } : normalizedItem, numbering));
      if (Array.isArray(item.children) && item.children.length > 0) result.push(...createListParagraphs(item.children, item.type || listType, safeLevel + 1));
    }
  }
  return result;
}

function buildDocxChildren(blocks) {
  const children = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block == null) continue;
    if (typeof block === 'string' || typeof block === 'number' || typeof block === 'boolean') children.push(createParagraphFromConfig(String(block)));
    else if (typeof block === 'object' && block.type === 'table') children.push(createTableFromConfig(block));
    else if (typeof block === 'object' && ['orderedList', 'unorderedList', 'bulletList'].includes(block.type)) children.push(...createListParagraphs(block.items || [], block.type === 'orderedList' ? 'ordered' : 'bullet', block.level || 0));
    else if (typeof block === 'object' && block.type === 'listItem') children.push(...createListParagraphs([block], block.listType || 'bullet', block.level || 0));
    else if (typeof block === 'object') children.push(createParagraphFromConfig(block));
  }
  if (children.length === 0) children.push(createParagraphFromConfig(''));
  return children;
}

function parseInlineRuns(text) {
  return inlineTokensToRuns(marked.lexer(String(text || ''), { gfm: true }).flatMap((token) => token.tokens || (token.type === 'paragraph' ? token.tokens || [] : [])));
}

function inlineTokensToRuns(tokens = []) {
  const runs = [];
  const appendText = (value, extra = {}) => {
    if (value == null || value === '') return;
    const parts = String(value).split('\n');
    parts.forEach((part, index) => {
      if (part) runs.push({ text: part, ...extra, ...(index < parts.length - 1 ? { break: 1 } : {}) });
      else if (index < parts.length - 1) runs.push({ text: '', break: 1, ...extra });
    });
  };
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (!token) continue;
    if (token.type === 'text' || token.type === 'escape') {
      if (Array.isArray(token.tokens) && token.tokens.length > 0) runs.push(...inlineTokensToRuns(token.tokens));
      else appendText(token.text || token.raw || '');
      continue;
    }
    if (token.type === 'strong') {
      inlineTokensToRuns(token.tokens).forEach((run) => runs.push({ ...run, bold: true }));
      continue;
    }
    if (token.type === 'em') {
      inlineTokensToRuns(token.tokens).forEach((run) => runs.push({ ...run, italic: true }));
      continue;
    }
    if (token.type === 'codespan') {
      appendText(token.text || '', { font: 'Courier New' });
      continue;
    }
    if (token.type === 'link') {
      const linkRuns = token.tokens?.length ? inlineTokensToRuns(token.tokens) : [{ text: token.text || token.href || '' }];
      linkRuns.forEach((run) => runs.push({ ...run, underline: true, color: '0563C1' }));
      continue;
    }
    if (token.type === 'br') {
      runs.push({ text: '', break: 1 });
      continue;
    }
    if (token.type === 'html') {
      const stripped = String(token.raw || token.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '');
      appendText(stripped);
      continue;
    }
    if (Array.isArray(token.tokens) && token.tokens.length > 0) {
      runs.push(...inlineTokensToRuns(token.tokens));
      continue;
    }
    appendText(token.text || token.raw || '');
  }
  return runs.length > 0 ? runs : [{ text: '' }];
}

function tokensToPlainText(tokens = []) {
  return inlineTokensToRuns(tokens).map((run) => run.text ?? '').join('');
}

function listItemsFromMarked(items = [], listType = 'bullet') {
  return items.map((item) => {
    const children = [];
    const contentTokens = [];
    for (const token of item.tokens || []) {
      if (token.type === 'list') {
        children.push(...listItemsFromMarked(token.items || [], token.ordered ? 'ordered' : 'bullet'));
        continue;
      }
      if (token.type === 'space') continue;
      if (token.type === 'paragraph' || token.type === 'text') {
        if (Array.isArray(token.tokens)) contentTokens.push(...token.tokens);
        else contentTokens.push(token);
        continue;
      }
      if (token.type === 'html') {
        contentTokens.push(token);
        continue;
      }
    }
    if (item.task) {
      const checkbox = item.checked ? '☑ ' : '☐ ';
      contentTokens.unshift({ type: 'text', text: checkbox, raw: checkbox });
    }
    return { runs: inlineTokensToRuns(contentTokens), children, type: listType };
  });
}

function parseMarkdownTable(markdown) {
  const lines = String(markdown || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0].includes('|') || !lines[1].includes('|')) return null;
  const separatorPattern = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;
  if (!separatorPattern.test(lines[1])) return null;
  const parseRow = (line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  return { headers: parseRow(lines[0]), rows: lines.slice(2).map(parseRow).filter((row) => row.length > 0) };
}

function parseMarkdownToDocxBlocks(input) {
  const tokens = marked.lexer(String(input || ''), { gfm: true });
  const blocks = [];
  for (const token of tokens) {
    if (!token) continue;
    if (token.type === 'space') {
      blocks.push({ type: 'blank' });
      continue;
    }
    if (token.type === 'heading') {
      blocks.push({ heading: `HEADING_${Math.min(6, Math.max(1, Number(token.depth) || 1))}`, runs: inlineTokensToRuns(token.tokens || []) });
      continue;
    }
    if (token.type === 'paragraph') {
      blocks.push({ runs: inlineTokensToRuns(token.tokens || []) });
      continue;
    }
    if (token.type === 'text') {
      blocks.push({ runs: inlineTokensToRuns(token.tokens || [{ type: 'text', text: token.text || token.raw || '' }]) });
      continue;
    }
    if (token.type === 'blockquote') {
      const quoteText = (token.tokens || []).map((child) => {
        if (child.type === 'paragraph' || child.type === 'text') return tokensToPlainText(child.tokens || [{ type: 'text', text: child.text || child.raw || '' }]);
        if (child.type === 'space') return '';
        return child.raw || child.text || '';
      }).filter(Boolean).join(' ');
      blocks.push({ runs: inlineTokensToRuns([{ type: 'text', text: quoteText, raw: quoteText }]), indent: { left: 360 }, spacing: { before: 80, after: 120 } });
      continue;
    }
    if (token.type === 'code') {
      blocks.push({ text: token.text || '', font: 'Courier New', spacing: { before: 120, after: 120 }, indent: { left: 360, right: 120 }, keepLines: true });
      continue;
    }
    if (token.type === 'table') {
      const headerRow = (token.header || []).map((cell) => tokensToPlainText(cell.tokens || [{ type: 'text', text: cell.text || '' }]));
      const bodyRows = (token.rows || []).map((row) => row.map((cell) => tokensToPlainText(cell.tokens || [{ type: 'text', text: cell.text || '' }])));
      blocks.push({ type: 'table', rows: [headerRow, ...bodyRows] });
      continue;
    }
    if (token.type === 'list') {
      blocks.push({ type: token.ordered ? 'orderedList' : 'bulletList', items: listItemsFromMarked(token.items || [], token.ordered ? 'ordered' : 'bullet') });
      continue;
    }
    if (token.type === 'html') {
      const htmlText = tokensToPlainText([{ type: 'html', raw: token.raw || token.text || '' }]);
      if (htmlText.trim()) blocks.push({ runs: inlineTokensToRuns([{ type: 'text', text: htmlText, raw: htmlText }]) });
      continue;
    }
  }
  return blocks.length > 0 ? blocks : [];
}

export function parseWordInput(input) {
  if (Array.isArray(input)) return input;
  if (isPlainObject(input)) return [input];
  const raw = String(input || '');
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
  }
  if (/^(#{1,6})\s+/m.test(raw) || /^\d+\.\s+/m.test(raw) || /^\s*[-*]\s+/m.test(raw) || /^\s*>/m.test(raw) || /^```/m.test(raw) || /^\|.*\|/m.test(raw)) return parseMarkdownToDocxBlocks(raw);
  return raw.split('\n').map((line) => line.trim() ? ({ text: line }) : ({ type: 'blank' }));
}

export async function writeDocx(filePath, sessionId, paragraphs, options = {}) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId 来访问文件系统');
    const { overwrite = false, title = 'Document' } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    await fs.mkdir(dirPath, { recursive: true });
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    const normalizedParagraphs = parseWordInput(paragraphs);
    const docChildren = buildDocxChildren(normalizedParagraphs);
    const paragraphCount = docChildren.filter((child) => child instanceof Paragraph).length;
    const tableCount = docChildren.filter((child) => child instanceof Table).length;
    const doc = new Document({ creator: 'AI-Agent-Node', title, numbering: { config: [{ reference: 'ai-agent-bullet-list', levels: Array.from({ length: 9 }, (_, level) => ({ level, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][level % 3], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } } })) }, { reference: 'ai-agent-ordered-list', levels: Array.from({ length: 9 }, (_, level) => ({ level, format: LevelFormat.DECIMAL, text: `%${level + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } } })) }] }, sections: [{ properties: { page: { width: 11906, height: 16838, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: docChildren }] });
    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(absolutePath, buffer);
    const stats = await fs.stat(absolutePath);
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);
    return { success: true, filePath, url: urlInfo?.fullUrl || null, fullUrl: urlInfo?.fullUrl || null, signedPath: urlInfo?.path || null, size: stats.size, formattedSize: formatFileSize(stats.size), pageSize: 'A4 (210mm x 297mm)', paragraphCount, tableCount, blockCount: docChildren.length, message: `Word 文档创建成功: ${filePath}（A4 纸张）\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}` };
  } catch (error) {
    return { success: false, error: error.message, filePath };
  }
}
