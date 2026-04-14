import fs from 'fs/promises';
import path from 'path';
import { Document, Paragraph, TextRun, Packer, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, LevelFormat } from 'docx';
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
  return new TextRun({ text: run.text != null ? String(run.text) : '', bold: !!run.bold, italic: !!run.italic, underline: run.underline ? {} : undefined, size: run.fontSize ? Number(run.fontSize) * 2 : undefined, color: run.color || DOCX_DEFAULT_COLOR, font: run.font || DOCX_DEFAULT_FONT, break: run.break ? Number(run.break) : undefined });
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
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') result.push(createParagraphFromConfig({ text: String(item) }, numbering));
    else if (typeof item === 'object') {
      result.push(createParagraphFromConfig(item.text != null || item.runs ? item : { ...item, text: item.text ?? '' }, numbering));
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
  const runs = [];
  const regex = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) runs.push({ text: text.slice(lastIndex, index) });
    if (match[2] != null) runs.push({ text: match[2], bold: true });
    else if (match[4] != null) runs.push({ text: match[4], font: 'Courier New' });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex) });
  return runs.length > 0 ? runs : [{ text }];
}

function getListItemMeta(line) {
  const ordered = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (ordered) {
    return { type: 'ordered', level: Math.floor((ordered[1] || '').length / 2), text: ordered[3] };
  }
  const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (bullet) {
    return { type: 'bullet', level: Math.floor((bullet[1] || '').length / 2), text: bullet[2] };
  }
  return null;
}

function normalizeListTree(items, type) {
  const root = [];
  const stack = [];
  for (const item of items) {
    const node = { text: item.text, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) stack.pop();
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ level: item.level, node });
  }
  return { type, items: root };
}

function parseCodeFenceBlock(lines, startIndex) {
  const firstLine = lines[startIndex].trim();
  const language = firstLine.slice(3).trim();
  const codeLines = [];
  let index = startIndex + 1;
  while (index < lines.length && !lines[index].trim().startsWith('```')) {
    codeLines.push(lines[index]);
    index += 1;
  }
  if (index < lines.length) index += 1;
  return {
    nextIndex: index,
    block: {
      text: codeLines.join('\n'),
      font: 'Courier New',
      spacing: { before: 120, after: 120 },
      indent: { left: 360, right: 120 },
      ...(language ? { keepLines: true } : {}),
    }
  };
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
  const lines = String(input || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      blocks.push({ type: 'blank' });
      index += 1;
      continue;
    }
    if (trimmed.startsWith('```')) {
      const codeBlock = parseCodeFenceBlock(lines, index);
      blocks.push(codeBlock.block);
      index = codeBlock.nextIndex;
      continue;
    }
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ heading: `HEADING_${headingMatch[1].length}`, text: headingMatch[2] });
      index += 1;
      continue;
    }
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ runs: parseInlineRuns(quoteLines.join(' ')), indent: { left: 360 }, spacing: { before: 80, after: 120 } });
      continue;
    }
    if (trimmed.startsWith('|')) {
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) tableLines.push(lines[index++].trim());
      const parsedTable = parseMarkdownTable(tableLines.join('\n'));
      blocks.push(parsedTable ? { type: 'table', rows: [parsedTable.headers, ...parsedTable.rows] } : { text: tableLines.join('\n') });
      continue;
    }
    const listMeta = getListItemMeta(lines[index]);
    if (listMeta) {
      const items = [];
      const listType = listMeta.type;
      while (index < lines.length) {
        const meta = getListItemMeta(lines[index]);
        if (!meta || meta.type !== listType) break;
        items.push(meta);
        index += 1;
      }
      blocks.push(normalizeListTree(items, listType === 'ordered' ? 'orderedList' : 'bulletList'));
      continue;
    }
    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !lines[index].trim().startsWith('```') && !lines[index].trim().startsWith('>') && !/^(#{1,6})\s+/.test(lines[index].trim()) && !getListItemMeta(lines[index]) && !lines[index].trim().startsWith('|')) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ runs: parseInlineRuns(paragraphLines.join(' ')) });
  }
  return blocks;
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
