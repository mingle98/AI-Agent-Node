// ========== Markdown → PDFKit 渲染（用于 pdf_write 富文本样式） ==========

import { lexer, Lexer } from "marked";

const MARKED_LEXER_OPTS = { gfm: true };

/**
 * 取出段落的内联 token。列表项在 GFM 下常为 block.type === "text"（非 paragraph），
 * 必须用 token.tokens；若为空则用 Lexer.lexInline 兜底，避免整段 raw 含 ** 未解析。
 */
function resolveInlineTokens(token) {
  if (Array.isArray(token.tokens) && token.tokens.length > 0) {
    return token.tokens;
  }
  const raw = token.text ?? "";
  if (!raw) return [];
  try {
    return Lexer.lexInline(raw, MARKED_LEXER_OPTS);
  } catch {
    return [{ type: "text", text: raw }];
  }
}

/**
 * 将 marked 行内 token 展平为带样式的文本片段
 */
function flattenInline(tokens, inherited = {}) {
  const out = [];
  if (!tokens?.length) return out;

  for (const t of tokens) {
    switch (t.type) {
      case "text":
        if (t.tokens) out.push(...flattenInline(t.tokens, inherited));
        else if (t.text) out.push({ ...inherited, text: t.text });
        break;
      case "strong":
        if (t.tokens?.length) {
          out.push(...flattenInline(t.tokens, { ...inherited, bold: true }));
        } else if (t.text) {
          out.push({ ...inherited, text: t.text, bold: true });
        }
        break;
      case "em":
        if (t.tokens?.length) {
          out.push(...flattenInline(t.tokens, { ...inherited, italic: true }));
        } else if (t.text) {
          out.push({ ...inherited, text: t.text, italic: true });
        }
        break;
      case "codespan":
        out.push({ ...inherited, text: t.text, code: true });
        break;
      case "del":
        if (t.tokens?.length) {
          out.push(...flattenInline(t.tokens, { ...inherited, strike: true }));
        } else if (t.text) {
          out.push({ ...inherited, text: t.text, strike: true });
        }
        break;
      case "link":
        out.push({
          ...inherited,
          text: tokensToPlain(t.tokens),
          link: t.href,
        });
        break;
      case "image":
        out.push({ ...inherited, text: `[图片: ${t.text || "image"}]` });
        break;
      case "br":
        out.push({ ...inherited, text: "\n" });
        break;
      case "escape":
        out.push({ ...inherited, text: t.text });
        break;
      case "html":
        out.push({ ...inherited, text: t.text || "" });
        break;
      default:
        if (t.text) out.push({ ...inherited, text: t.text });
    }
  }
  return out;
}

function tokensToPlain(tokens) {
  return flattenInline(tokens || [])
    .map((s) => s.text)
    .join("");
}

function sameStyle(a, b) {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.code === !!b.code &&
    !!a.strike === !!b.strike &&
    a.link === b.link
  );
}

function mergeSegments(segments) {
  const merged = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (
      last &&
      sameStyle(last, s) &&
      !String(s.text ?? "").includes("\n") &&
      !String(last.text ?? "").endsWith("\n")
    ) {
      last.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

function ensureDocY(doc, ctx) {
  if (!Number.isFinite(doc.y) || doc.y < ctx.margin) {
    doc.y = ctx.margin;
  }
}

function getPageBottom(doc, ctx) {
  return doc.page.height - ctx.margin;
}

function getRemainingHeight(doc, ctx) {
  ensureDocY(doc, ctx);
  return Math.max(0, getPageBottom(doc, ctx) - doc.y);
}

function startNewPage(doc, ctx) {
  doc.addPage();
  doc.y = ctx.margin;
}

function ensurePageSpace(doc, ctx, needed = 0, minFallback = 18) {
  ensureDocY(doc, ctx);
  const threshold = Math.max(Number(needed) || 0, minFallback);
  if (getRemainingHeight(doc, ctx) < threshold && doc.y > ctx.margin) {
    startNewPage(doc, ctx);
  }
}

function applySegmentStyle(doc, seg, ctx) {
  let size = ctx.baseSize;
  if (seg.code) size -= 1;
  else if (seg.bold && ctx.hasChineseFont) size += 1.2;

  doc.fontSize(size);

  if (ctx.hasChineseFont) {
    doc.font(ctx.chineseFontName);
  } else if (seg.bold && !seg.code) {
    doc.font("Helvetica-Bold");
  } else if (seg.code) {
    doc.font("Courier");
  } else {
    doc.font("Helvetica");
  }

  if (seg.code) doc.fillColor("#1e293b");
  else if (seg.link) doc.fillColor("#1d4ed8");
  else if (seg.strike) doc.fillColor("#64748b");
  else if (seg.bold && ctx.hasChineseFont) doc.fillColor("#020617");
  else doc.fillColor("#0f172a");
  // 禁止调用 doc.underline(x,y,w,h)：那是「注释下划线」API，误传 false 会导致 Rect NaN
}

/**
 * 在指定宽度下输出片段（支持 continued 换行）
 */
function drawSegments(doc, segments, ctx, x, width) {
  const merged = mergeSegments(segments).filter((s) => s.text != null && String(s.text).length > 0);
  if (!merged.length) {
    ensurePageSpace(doc, ctx, ctx.baseSize * 0.6, 12);
    doc.moveDown(0.15);
    return;
  }

  const estimatedHeight = merged.reduce((sum, seg) => {
    applySegmentStyle(doc, seg, ctx);
    return sum + doc.heightOfString(String(seg.text), { width: Math.max(1, width) });
  }, 0);
  ensurePageSpace(doc, ctx, Math.min(estimatedHeight + 8, getPageBottom(doc, ctx) - ctx.margin), 18);

  const yStart = Number.isFinite(doc.y) ? doc.y : ctx.margin;
  doc.y = yStart;
  for (let i = 0; i < merged.length; i++) {
    const seg = merged[i];
    applySegmentStyle(doc, seg, ctx);
    const y = Number.isFinite(doc.y) ? doc.y : yStart;
    const textOpts = {
      width: Math.max(1, width),
      underline: false,
      strike: !!seg.strike,
    };
    if (i < merged.length - 1) textOpts.continued = true;
    if (seg.link) textOpts.link = seg.link;
    doc.text(String(seg.text), x, y, textOpts);
  }
  doc.moveDown(0.25);
}

function headingSize(depth) {
  const sizes = { 1: 20, 2: 16, 3: 14, 4: 13, 5: 12, 6: 11 };
  return sizes[depth] || 11;
}

export { flattenInline, tokensToPlain, sameStyle, mergeSegments, headingSize };

function renderCodeBlock(doc, token, ctx) {
  const margin = ctx.margin;
  const w = ctx.contentWidth;
  const pad = 8;
  const lang = token.lang ? ` ${token.lang}` : "";
  const code = String(token.text || "").replace(/\r\n/g, "\n");
  const fs = Math.max(9, ctx.baseSize - 1);
  const lineGap = 2;
  const lines = code.split("\n");
  const lineHeight = fs + lineGap;
  const langHeight = lang ? fs + 4 : 0;
  const availableHeight = Math.max(60, getPageBottom(doc, ctx) - ctx.margin);
  const chunkCapacity = Math.max(1, Math.floor((availableHeight - 2 * pad - langHeight) / lineHeight));

  let start = 0;
  while (start < lines.length || (lines.length === 1 && lines[0] === "" && start === 0)) {
    const isFirstChunk = start === 0;
    const visibleLangHeight = isFirstChunk ? langHeight : 0;
    const end = Math.min(lines.length, start + chunkCapacity);
    const chunkLines = lines.slice(start, end);
    const chunkText = chunkLines.join("\n") || " ";
    const textHeight = Math.max(lineHeight, chunkLines.length * lineHeight);
    const boxH = textHeight + 2 * pad + visibleLangHeight;

    ensurePageSpace(doc, ctx, boxH + 6, 40);
    const y0 = doc.y;

    doc.save();
    doc.rect(margin, y0, w, boxH).fill("#f1f5f9");

    let ty = y0 + pad;
    if (isFirstChunk && lang) {
      doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Helvetica")
        .fontSize(fs - 1)
        .fillColor("#64748b")
        .text(lang.trim(), margin + pad, ty, { width: w - 2 * pad });
      ty += fs + 2;
    }

    doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Courier")
      .fontSize(fs)
      .fillColor("#1e293b")
      .text(chunkText, margin + pad, ty, {
        width: w - 2 * pad,
        lineGap,
      });
    doc.restore();

    doc.y = y0 + boxH + 6;
    start = end;
    if (lines.length === 1 && lines[0] === "") break;
  }
}

function renderHr(doc, ctx) {
  ensurePageSpace(doc, ctx, 14, 14);
  const y = doc.y + 4;
  doc.moveTo(ctx.margin, y).lineTo(ctx.margin + ctx.contentWidth, y).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
  doc.y = y + 10;
}

function drawTableRow(doc, row, rowHeight, cols, colW, pad, margin, w, fs, ctx, alignments, isHead) {
  const y = doc.y;
  if (isHead) {
    doc.rect(margin, y, w, rowHeight).fill("#f1f5f9");
  }
  doc.rect(margin, y, w, rowHeight).strokeColor("#cbd5e1").lineWidth(0.5).stroke();

  for (let c = 0; c < cols; c++) {
    const x = margin + c * colW;
    if (c > 0) {
      doc.moveTo(x, y).lineTo(x, y + rowHeight).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
    }
    const txt = row[c]?.plain || "";
    doc.fillColor(isHead ? "#0f172a" : "#334155");
    doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Helvetica");
    doc.fontSize(isHead ? fs + 0.5 : fs);
    doc.text(txt, x + pad, y + pad, { width: colW - 2 * pad, align: alignments[c] });
  }

  doc.y = y + rowHeight;
}

function renderTable(doc, token, ctx) {
  const margin = ctx.margin;
  const w = ctx.contentWidth;
  const cols = token.header?.length || 0;
  if (!cols) return;

  const colW = w / cols;
  const fs = Math.max(8, ctx.baseSize - 1);
  const pad = 6;

  const cellPlain = (cell) => {
    if (!cell) return "";
    return tokensToPlain(cell.tokens) || cell.text || "";
  };

  const cellTextHeight = (text) => {
    doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Helvetica").fontSize(fs);
    return doc.heightOfString(text || " ", { width: colW - 2 * pad });
  };

  const alignments = Array.from({ length: cols }, (_, c) => {
    const rawAlign = token.align?.[c] || "left";
    return rawAlign === "right" ? "right" : rawAlign === "center" ? "center" : "left";
  });

  const rows = [token.header, ...(token.rows || [])].map((row, index) => {
    const cells = Array.from({ length: cols }, (_, c) => {
      const plain = cellPlain(row[c]);
      return { plain };
    });
    const height = cells.reduce((maxH, cell) => Math.max(maxH, cellTextHeight(cell.plain) + 2 * pad), fs + 2 * pad);
    return { cells, height, isHead: index === 0 };
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const headerRepeatHeight = !row.isHead && rows[0] ? rows[0].height : 0;
    ensurePageSpace(doc, ctx, row.height + headerRepeatHeight + 8, 24);

    if (i > 0 && doc.y === ctx.margin && rows[0]) {
      drawTableRow(doc, rows[0].cells, rows[0].height, cols, colW, pad, margin, w, fs, ctx, alignments, true);
    }

    drawTableRow(doc, row.cells, row.height, cols, colW, pad, margin, w, fs, ctx, alignments, row.isHead);
  }

  doc.y += 8;
}

function renderBlockquote(doc, token, ctx) {
  const barW = 4;
  const gap = 10;
  const inner = ctx.margin + barW + gap;
  const w = ctx.contentWidth - barW - gap;

  const subCtx = { ...ctx, margin: inner, contentWidth: w };
  const blocks = token.tokens || [];
  let chunk = [];

  const flushChunk = () => {
    if (!chunk.length) return;
    ensurePageSpace(doc, ctx, subCtx.baseSize * 1.6, 18);
    const yStart = doc.y;
    renderBlockTokens(doc, chunk, subCtx, 0);
    const yEnd = doc.y;
    doc.save();
    doc.fillColor("#e2e8f0").rect(ctx.margin, yStart, barW, Math.max(yEnd - yStart, 12)).fill();
    doc.restore();
    chunk = [];
  };

  for (const block of blocks) {
    if (block.type === "space") {
      chunk.push(block);
      flushChunk();
      continue;
    }
    chunk.push(block);
    if (["heading", "paragraph", "text", "code", "table", "hr", "list"].includes(block.type)) {
      flushChunk();
    }
  }
  flushChunk();
  doc.moveDown(0.15);
}

function renderList(doc, list, ctx, depth) {
  let index = typeof list.start === "number" ? list.start : 1;
  const indent = depth * 18;

  for (const item of list.items) {
    const prefix = list.ordered ? `${index++}. ` : "• ";
    let first = true;

    for (const block of item.tokens || []) {
      // GFM 列表项常见为 block.type === "text"（带内联 tokens），不是 paragraph
      if (block.type === "paragraph" || block.type === "text") {
        const segs = flattenInline(resolveInlineTokens(block));
        if (first && segs.length) {
          segs[0] = { ...segs[0], text: prefix + (segs[0].text || "") };
        } else if (first) {
          segs.unshift({ text: prefix });
        }
        first = false;
        drawSegments(doc, segs, ctx, ctx.margin + indent, ctx.contentWidth - indent);
      } else if (block.type === "list") {
        renderList(doc, block, ctx, depth + 1);
      } else {
        renderBlockTokens(doc, [block], ctx, depth);
      }
    }
  }
  doc.moveDown(0.15);
}

function renderBlockTokens(doc, tokens, ctx, listDepth = 0) {
  for (const token of tokens) {
    switch (token.type) {
      case "space":
        ensurePageSpace(doc, ctx, 12, 12);
        doc.moveDown(0.15);
        break;
      case "heading": {
        const hs = headingSize(token.depth);
        const save = ctx.baseSize;
        ctx.baseSize = hs;
        ensurePageSpace(doc, ctx, hs * 2.2, 28);
        doc.moveDown(0.2);
        if (ctx.hasChineseFont) doc.font(ctx.chineseFontName);
        else doc.font("Helvetica-Bold");
        doc.fillColor("#0f172a").fontSize(hs);
        drawSegments(doc, flattenInline(resolveInlineTokens(token)), ctx, ctx.margin, ctx.contentWidth);
        ctx.baseSize = save;
        doc.moveDown(0.15);
        break;
      }
      case "paragraph":
      case "text":
        drawSegments(
          doc,
          flattenInline(resolveInlineTokens(token)),
          ctx,
          ctx.margin,
          ctx.contentWidth
        );
        break;
      case "list":
        ensurePageSpace(doc, ctx, ctx.baseSize * 1.8, 18);
        renderList(doc, token, ctx, listDepth);
        break;
      case "code":
        renderCodeBlock(doc, token, ctx);
        break;
      case "blockquote":
        renderBlockquote(doc, token, ctx);
        break;
      case "hr":
        renderHr(doc, ctx);
        break;
      case "table":
        renderTable(doc, token, ctx);
        break;
      case "html":
        if (token.text) {
          ensurePageSpace(doc, ctx, ctx.baseSize * 1.6, 18);
          doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Helvetica").fontSize(ctx.baseSize).fillColor("#64748b");
          doc.text(token.text, ctx.margin, doc.y, { width: ctx.contentWidth });
          doc.moveDown(0.2);
        }
        break;
      default:
        if (token.text) {
          ensurePageSpace(doc, ctx, ctx.baseSize * 1.6, 18);
          doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Helvetica").fontSize(ctx.baseSize).fillColor("#0f172a");
          doc.text(token.text, ctx.margin, doc.y, { width: ctx.contentWidth });
          doc.moveDown(0.2);
        }
    }
  }
}

/**
 * 在已创建且已配置字体的 PDFKit doc 上，从当前 doc.y 开始绘制 Markdown
 * @param {import('pdfkit')} doc
 * @param {string} markdown
 * @param {object} opts
 */
export function renderMarkdownOnPdf(doc, markdown, opts = {}) {
  const {
    margin = 50,
    hasChineseFont = false,
    chineseFontName = "ChineseFont",
    baseFontSize = 11,
    title = null,
  } = opts;

  const contentWidth = doc.page.width - 2 * margin;
  const ctx = {
    margin,
    contentWidth,
    baseSize: baseFontSize,
    hasChineseFont,
    chineseFontName,
  };

  let tokens;
  try {
    tokens = lexer(String(markdown || ""), MARKED_LEXER_OPTS);
  } catch {
    tokens = [
      {
        type: "paragraph",
        raw: String(markdown),
        text: String(markdown),
        tokens: [{ type: "text", text: String(markdown) }],
      },
    ];
  }

  if (!Number.isFinite(doc.y) || doc.y < margin) {
    doc.y = margin;
  }

  if (title && String(title).trim() && title !== "Document") {
    const save = ctx.baseSize;
    ctx.baseSize = 18;
    if (ctx.hasChineseFont) doc.font(ctx.chineseFontName);
    else doc.font("Helvetica-Bold");
    doc.fillColor("#0f172a").fontSize(18);
    doc.text(String(title).trim(), margin, doc.y, { width: contentWidth });
    ctx.baseSize = save;
    doc.moveDown(0.6);
  }

  renderBlockTokens(doc, tokens, ctx, 0);
}
