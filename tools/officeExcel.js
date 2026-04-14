import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';

import { resolveWorkspacePath, getPublicUrlInfo } from './fileManager.js';
import { formatFileSize, isPlainObject } from './officeFormatUtils.js';

function isExcelCellConfig(value) {
  return isPlainObject(value) && ['value','text','formula','result','richText','hyperlink','note','font','fill','border','alignment','numFmt','protection','style'].some((key) => key in value);
}

function normalizeExcelArgb(color) {
  if (!color || typeof color !== 'string') return null;
  const hex = color.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `FF${hex.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `FF${hex.split('').map((char) => char + char).join('').toUpperCase()}`;
  return null;
}

function normalizeExcelColorConfig(color) {
  if (!color) return color;
  if (typeof color === 'string') {
    const argb = normalizeExcelArgb(color);
    return argb ? { argb } : color;
  }
  if (isPlainObject(color) && typeof color.argb === 'string') {
    const argb = normalizeExcelArgb(color.argb);
    return argb ? { ...color, argb } : color;
  }
  return color;
}

function normalizeExcelFont(font) {
  if (!isPlainObject(font)) return font;
  return {
    ...font,
    ...(font.color ? { color: normalizeExcelColorConfig(font.color) } : {}),
  };
}

function normalizeExcelFill(fill) {
  if (!isPlainObject(fill)) return fill;
  const normalized = { ...fill };
  if (normalized.fgColor) normalized.fgColor = normalizeExcelColorConfig(normalized.fgColor);
  if (normalized.bgColor) normalized.bgColor = normalizeExcelColorConfig(normalized.bgColor);
  return normalized;
}

function normalizeExcelBorder(border) {
  if (!isPlainObject(border)) return border;
  const normalizeBorderSide = (side) => {
    if (!isPlainObject(side)) return side;
    return {
      ...side,
      ...(side.color ? { color: normalizeExcelColorConfig(side.color) } : {}),
    };
  };
  return {
    ...border,
    top: normalizeBorderSide(border.top),
    left: normalizeBorderSide(border.left),
    bottom: normalizeBorderSide(border.bottom),
    right: normalizeBorderSide(border.right),
    diagonal: normalizeBorderSide(border.diagonal),
  };
}

function normalizeExcelStyle(style) {
  if (!isPlainObject(style)) return style;
  return {
    ...style,
    ...(style.font ? { font: normalizeExcelFont(style.font) } : {}),
    ...(style.fill ? { fill: normalizeExcelFill(style.fill) } : {}),
    ...(style.border ? { border: normalizeExcelBorder(style.border) } : {}),
  };
}

function resolveExcelCellValue(value) {
  if (!isExcelCellConfig(value)) return value;
  if ('value' in value) return value.value;
  if ('formula' in value) return { formula: value.formula, result: value.result };
  if ('richText' in value) return { richText: value.richText };
  if ('hyperlink' in value) return { text: value.text || value.hyperlink, hyperlink: value.hyperlink, tooltip: value.tooltip };
  if ('text' in value) return value.text;
  return null;
}

function applyExcelCellConfig(cell, value) {
  const cellValue = resolveExcelCellValue(value);
  if (cellValue !== undefined) cell.value = cellValue;
  if (!isExcelCellConfig(value)) return;
  if (value.numFmt) cell.numFmt = value.numFmt;
  if (value.font) cell.font = normalizeExcelFont(value.font);
  if (value.alignment) cell.alignment = value.alignment;
  if (value.fill) cell.fill = normalizeExcelFill(value.fill);
  if (value.border) cell.border = normalizeExcelBorder(value.border);
  if (value.protection) cell.protection = value.protection;
  if (value.style && isPlainObject(value.style)) Object.assign(cell.style, normalizeExcelStyle(value.style));
  if (value.note) cell.note = value.note;
}

function addExcelRow(worksheet, rowData, rowOptions = {}) {
  const { bold = false, fill = null } = rowOptions;
  if (Array.isArray(rowData)) {
    const row = worksheet.addRow(rowData.map(resolveExcelCellValue));
    rowData.forEach((cellValue, index) => {
      const cell = row.getCell(index + 1);
      applyExcelCellConfig(cell, cellValue);
      if (bold) {
        if (!cell.font || Object.keys(cell.font).length === 0) cell.font = { bold: true };
        else if (!cell.font.bold) cell.font = { ...normalizeExcelFont(cell.font), bold: true };
      }
      if (fill && (!cell.fill || Object.keys(cell.fill).length === 0)) cell.fill = normalizeExcelFill(fill);
    });
    return row;
  }
  if (isPlainObject(rowData) && Array.isArray(rowData.cells)) {
    const row = worksheet.addRow(rowData.cells.map(resolveExcelCellValue));
    rowData.cells.forEach((cellValue, index) => {
      const cell = row.getCell(index + 1);
      applyExcelCellConfig(cell, cellValue);
      if (bold) {
        if (!cell.font || Object.keys(cell.font).length === 0) cell.font = { bold: true };
        else if (!cell.font.bold) cell.font = { ...normalizeExcelFont(cell.font), bold: true };
      }
      if (fill && (!cell.fill || Object.keys(cell.fill).length === 0)) cell.fill = normalizeExcelFill(fill);
    });
    if (rowData.height != null) row.height = rowData.height;
    if (rowData.hidden != null) row.hidden = !!rowData.hidden;
    if (rowData.outlineLevel != null) row.outlineLevel = rowData.outlineLevel;
    return row;
  }
  if (isPlainObject(rowData)) return worksheet.addRow(Object.values(rowData));
  return worksheet.addRow([rowData]);
}

function normalizeSheetPayload(sheet, options = {}) {
  const normalizedData = parseExcelInput(sheet);
  const base = {
    rows: Array.isArray(normalizedData) ? normalizedData : [],
    sheetName: options.sheetName || 'Sheet1',
    headers: options.headers || null,
    columns: options.columns || null,
    merges: options.merges || [],
    views: options.views || [],
    overwrite: options.overwrite || false,
    autoWidth: options.autoWidth !== false,
  };
  if (isPlainObject(normalizedData) && !Array.isArray(normalizedData)) {
    return {
      rows: Array.isArray(normalizedData.rows) ? normalizedData.rows : Array.isArray(normalizedData.data) ? normalizedData.data : [],
      sheetName: normalizedData.sheetName || base.sheetName,
      headers: normalizedData.headers || base.headers,
      columns: normalizedData.columns || base.columns,
      merges: normalizedData.merges || base.merges,
      views: normalizedData.views || base.views,
      overwrite: options.overwrite ?? normalizedData.overwrite ?? false,
      autoWidth: normalizedData.autoWidth ?? base.autoWidth,
    };
  }
  return base;
}

function buildDefaultSheetNames(count, baseName) {
  const root = baseName || 'Sheet';
  return Array.from({ length: count }, (_, index) => {
    if (count === 1) return root === 'Sheet' ? 'Sheet1' : root;
    if (index === 0 && root !== 'Sheet') return root;
    return root === 'Sheet' ? `Sheet${index + 1}` : `${root}_${index + 1}`;
  });
}

function isLegacyParallelSheetPayload(data) {
  return isPlainObject(data)
    && Array.isArray(data.headers)
    && Array.isArray(data.rows)
    && data.headers.length > 0
    && data.rows.length > 0
    && data.headers.length === data.rows.length
    && data.headers.every((item) => Array.isArray(item))
    && data.rows.every((item) => Array.isArray(item));
}

function columnIndexToName(index) {
  let current = Number(index) + 1;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result || 'A';
}

function normalizeMergeRange(range) {
  if (typeof range === 'string') return range.trim();
  if (Array.isArray(range) && range.length === 4 && range.every((value) => Number.isInteger(Number(value)))) {
    const [startRow, startCol, endRow, endCol] = range.map((value) => Number(value));
    return `${columnIndexToName(startCol)}${startRow + 1}:${columnIndexToName(endCol)}${endRow + 1}`;
  }
  return null;
}

function normalizeExcelWritePayload(data, options = {}) {
  const normalizedData = parseExcelInput(data);
  if (Array.isArray(normalizedData) && normalizedData.length > 0 && normalizedData.every((item) => isPlainObject(item) && (item.sheetName || item.rows || item.headers || item.columns || item.merges || item.views))) {
    return {
      sheets: normalizedData.map((sheet, index) => normalizeSheetPayload(sheet, { ...options, sheetName: sheet.sheetName || options.sheetName || `Sheet${index + 1}` })),
      overwrite: options.overwrite || false,
    };
  }
  if (isPlainObject(normalizedData) && Array.isArray(normalizedData.sheets)) {
    return {
      sheets: normalizedData.sheets.map((sheet, index) => normalizeSheetPayload(sheet, { ...options, sheetName: sheet?.sheetName || options.sheetName || `Sheet${index + 1}` })),
      overwrite: options.overwrite ?? normalizedData.overwrite ?? false,
    };
  }
  if (isLegacyParallelSheetPayload(normalizedData)) {
    const sheetCount = normalizedData.rows.length;
    const sheetNames = Array.isArray(normalizedData.sheetNames) && normalizedData.sheetNames.length === sheetCount
      ? normalizedData.sheetNames
      : buildDefaultSheetNames(sheetCount, options.sheetName || normalizedData.sheetName || 'Sheet');
    return {
      sheets: normalizedData.rows.map((sheetRows, index) => normalizeSheetPayload({
        sheetName: sheetNames[index],
        headers: normalizedData.headers[index] || null,
        rows: sheetRows,
        columns: Array.isArray(normalizedData.columns) ? normalizedData.columns[index] || null : null,
        merges: Array.isArray(normalizedData.merges) ? normalizedData.merges[index] || [] : [],
        views: Array.isArray(normalizedData.views) ? normalizedData.views[index] || [] : [],
        autoWidth: normalizedData.autoWidth,
      }, options)),
      overwrite: options.overwrite || false,
    };
  }
  return {
    sheets: [normalizeSheetPayload(normalizedData, options)],
    overwrite: options.overwrite || false,
  };
}

function applyExcelColumns(worksheet, columns) {
  if (!Array.isArray(columns) || columns.length === 0) return;
  worksheet.columns = columns.map((column) => {
    if (!isPlainObject(column)) return { width: Number(column) || undefined };
    const nextColumn = {};
    if (column.key) nextColumn.key = column.key;
    if (column.width != null) nextColumn.width = Number(column.width);
    if (column.hidden != null) nextColumn.hidden = !!column.hidden;
    if (column.outlineLevel != null) nextColumn.outlineLevel = column.outlineLevel;
    if (column.style) nextColumn.style = normalizeExcelStyle(column.style);
    return nextColumn;
  });
}

function autoFitExcelColumns(worksheet) {
  worksheet.columns.forEach((column) => {
    if (column.width) return;
    let maxLength = 10;
    column.eachCell({ includeEmpty: true }, (cell) => {
      let raw = cell.value;
      if (raw && typeof raw === 'object' && 'richText' in raw && Array.isArray(raw.richText)) raw = raw.richText.map((item) => item.text || '').join('');
      if (raw && typeof raw === 'object' && 'result' in raw) raw = raw.result;
      const cellLength = raw == null ? 0 : String(raw).length;
      if (cellLength > maxLength) maxLength = Math.min(cellLength, 50);
    });
    column.width = maxLength + 2;
  });
}

function extractExcelCell(cell) {
  const value = cell.value;
  const style = {};
  if (cell.numFmt) style.numFmt = cell.numFmt;
  if (cell.font && Object.keys(cell.font).length > 0) style.font = cell.font;
  if (cell.alignment && Object.keys(cell.alignment).length > 0) style.alignment = cell.alignment;
  if (cell.fill && Object.keys(cell.fill).length > 0) style.fill = cell.fill;
  if (cell.border && Object.keys(cell.border).length > 0) style.border = cell.border;
  let text = '';
  try { text = value == null ? '' : cell.text; } catch { text = value == null ? '' : String(value); }
  return { address: cell.address, text, value: value && typeof value === 'object' && 'formula' in value ? value.result : value, formula: value && typeof value === 'object' && 'formula' in value ? value.formula : null, result: value && typeof value === 'object' && 'formula' in value ? value.result : null, style };
}

function parseMarkdownTable(markdown) {
  const lines = String(markdown || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0].includes('|') || !lines[1].includes('|')) return null;
  const separatorPattern = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;
  if (!separatorPattern.test(lines[1])) return null;
  const parseRow = (line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => convertExcelPrimitive(cell.trim()));
  return { headers: parseRow(lines[0]), rows: lines.slice(2).map(parseRow).filter((row) => row.length > 0) };
}

function convertExcelPrimitive(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^-?\d+(\.\d+)?%$/.test(trimmed)) return Number(trimmed.slice(0, -1)) / 100;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^(true|false)$/i.test(trimmed)) return /^true$/i.test(trimmed);
  if (/^\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}(?::\d{2})?)?$/.test(trimmed)) {
    const date = new Date(trimmed.replace(' ', 'T'));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return trimmed;
}

function parseDelimitedTextTable(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes('|') ? '|' : lines[0].includes(',') ? ',' : null;
  if (!delimiter) return null;
  const rows = lines.map((line) => line.split(delimiter).map((cell) => convertExcelPrimitive(cell.trim())).filter((cell, index, arr) => !(delimiter === '|' && index === 0 && cell === '' && arr.length > 1)));
  if (rows.some((row) => row.length < 2)) return null;
  return { headers: rows[0], rows: rows.slice(1) };
}

export function parseExcelInput(input) {
  if (isPlainObject(input) || Array.isArray(input)) return input;
  const raw = String(input || '');
  if (!raw.trim()) return { rows: [] };
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try { return JSON.parse(raw); } catch {}
  }
  const markdownTable = parseMarkdownTable(raw);
  if (markdownTable) return { headers: markdownTable.headers, rows: markdownTable.rows };
  const delimitedTable = parseDelimitedTextTable(raw);
  if (delimitedTable) return { headers: delimitedTable.headers, rows: delimitedTable.rows };
  return { rows: raw.split(/\r?\n/).filter((line) => line.trim()).map((line) => [line]) };
}

function applyHeaderRows(worksheet, headers) {
  if (!Array.isArray(headers) || headers.length === 0) return 0;
  const headerRows = Array.isArray(headers[0]) ? headers : [headers];
  headerRows.forEach((headerRow) => addExcelRow(worksheet, headerRow, {
    bold: true,
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
  }));
  return headerRows.length;
}

function applyWorksheetMerges(worksheet, merges) {
  if (!Array.isArray(merges)) return 0;
  let mergeCount = 0;
  for (const range of merges) {
    const normalizedRange = normalizeMergeRange(range);
    if (!normalizedRange) continue;
    worksheet.mergeCells(normalizedRange);
    mergeCount += 1;
  }
  return mergeCount;
}

function writeSheetToWorksheet(workbook, sheetPayload, fallbackIndex) {
  const { sheetName = `Sheet${fallbackIndex + 1}`, headers = null, columns = null, merges = [], views = [], autoWidth = true, rows = [] } = sheetPayload;
  const worksheet = workbook.addWorksheet(sheetName);
  applyExcelColumns(worksheet, columns);
  if (Array.isArray(views) && views.length > 0) worksheet.views = views;
  const headerRowCount = applyHeaderRows(worksheet, headers);
  if (Array.isArray(rows)) rows.forEach((row) => addExcelRow(worksheet, row));
  const mergeCount = applyWorksheetMerges(worksheet, merges);
  if (autoWidth) autoFitExcelColumns(worksheet);
  return { worksheet, headerRowCount, mergeCount, rowCount: Array.isArray(rows) ? rows.length : 0 };
}

export async function readExcel(filePath, sessionId, options = {}) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId 来访问文件系统');
    const { sheetIndex = 0, sheetName = null } = options;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absolutePath);
    const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[sheetIndex];
    if (!worksheet) throw new Error(sheetName ? `工作表 "${sheetName}" 不存在` : `工作表索引 ${sheetIndex} 超出范围`);
    const data = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const rowValues = row.values.slice(1);
      data.push({ rowNumber, height: row.height ?? null, hidden: !!row.hidden, values: rowValues.map((_, columnIndex) => extractExcelCell(row.getCell(columnIndex + 1))) });
    });
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);
    return {
      success: true,
      filePath,
      url: urlInfo?.fullUrl || null,
      fullUrl: urlInfo?.fullUrl || null,
      signedPath: urlInfo?.path || null,
      sheets: workbook.worksheets.map((sheet) => ({ name: sheet.name, rowCount: sheet.rowCount, columnCount: sheet.columnCount, views: sheet.views || [] })),
      currentSheet: { name: worksheet.name, index: worksheet.id, views: worksheet.views || [] },
      columns: worksheet.columns.map((column, index) => ({ index: index + 1, key: column.key || null, width: column.width ?? null, hidden: !!column.hidden, outlineLevel: column.outlineLevel ?? 0, style: column.style && Object.keys(column.style).length > 0 ? column.style : null })),
      merges: Object.keys(worksheet._merges || {}),
      data: data.slice(0, 1000),
      totalRows: data.length,
      message: `成功读取 Excel 文件，共 ${workbook.worksheets.length} 个工作表，当前工作表 "${worksheet.name}" 有 ${data.length} 行数据`
    };
  } catch (error) {
    return { success: false, error: error.message, filePath };
  }
}

export async function writeExcel(filePath, sessionId, data, options = {}) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId 来访问文件系统');
    const payload = normalizeExcelWritePayload(data, options);
    const { sheets, overwrite = false } = payload;
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const dirPath = path.dirname(absolutePath);
    await fs.mkdir(dirPath, { recursive: true });
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (exists && !overwrite) throw new Error(`文件已存在: ${filePath}，如需覆盖请设置 overwrite: true`);
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    workbook.modified = new Date();
    let totalRows = 0;
    let totalHeaders = 0;
    let totalMerges = 0;
    sheets.forEach((sheetPayload, index) => {
      const { headerRowCount, mergeCount, rowCount } = writeSheetToWorksheet(workbook, sheetPayload, index);
      totalRows += rowCount;
      totalHeaders += headerRowCount;
      totalMerges += mergeCount;
    });
    await workbook.xlsx.writeFile(absolutePath);
    const stats = await fs.stat(absolutePath);
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);
    return { success: true, filePath, url: urlInfo?.fullUrl || null, fullUrl: urlInfo?.fullUrl || null, signedPath: urlInfo?.path || null, sheetName: sheets[0]?.sheetName || 'Sheet1', sheetCount: sheets.length, rowCount: totalRows, headerCount: totalHeaders, mergeCount: totalMerges, size: stats.size, formattedSize: formatFileSize(stats.size), message: `Excel 文件创建成功: ${filePath}\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}` };
  } catch (error) {
    return { success: false, error: error.message, filePath };
  }
}

export async function appendToExcel(filePath, sessionId, data, options = {}) {
  try {
    if (!sessionId) throw new Error('需要提供 sessionId 来访问文件系统');
    const payload = normalizeExcelWritePayload(data, options);
    const { sheets } = payload;
    if (sheets.length !== 1) throw new Error('appendToExcel 仅支持单工作表追加，请指定单个 sheet payload');
    const { sheetName = null, rows = [], views = [] } = sheets[0];
    const absolutePath = resolveWorkspacePath(filePath, sessionId);
    const exists = await fs.stat(absolutePath).catch(() => null);
    if (!exists) return await writeExcel(filePath, sessionId, data, options);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(absolutePath);
    const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!worksheet) throw new Error(`工作表不存在: ${sheetName || '默认工作表'}`);
    if (Array.isArray(views) && views.length > 0) worksheet.views = views;
    if (Array.isArray(rows)) rows.forEach((row) => addExcelRow(worksheet, row));
    await workbook.xlsx.writeFile(absolutePath);
    const urlInfo = getPublicUrlInfo(absolutePath, sessionId);
    return { success: true, filePath, url: urlInfo?.fullUrl || null, fullUrl: urlInfo?.fullUrl || null, signedPath: urlInfo?.path || null, sheetName: worksheet.name, appendedRows: rows.length, totalRows: worksheet.rowCount, message: `成功向 Excel 文件追加 ${rows.length} 行数据，当前共 ${worksheet.rowCount} 行\n访问地址: ${urlInfo?.fullUrl || '不可用'}\n签名路径: ${urlInfo?.path || '不可用'}` };
  } catch (error) {
    return { success: false, error: error.message, filePath };
  }
}
