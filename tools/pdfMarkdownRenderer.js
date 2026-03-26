// ========== Markdown → PDFKit 渲染（用于 pdf_write 富文本样式） ==========

import { lexer } from "marked";

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
        out.push(...flattenInline(t.tokens, { ...inherited, bold: true }));
        break;
      case "em":
        out.push(...flattenInline(t.tokens, { ...inherited, italic: true }));
        break;
      case "codespan":
        out.push({ ...inherited, text: t.text, code: true });
        break;
      case "del":
        out.push(...flattenInline(t.tokens, { ...inherited, strike: true }));
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

function applySegmentStyle(doc, seg, ctx) {
  let size = ctx.baseSize;
  if (seg.code) size -= 1;
  else if (seg.bold && ctx.hasChineseFont) size += 0.8;

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
  else doc.fillColor("#0f172a");
  // 禁止调用 doc.underline(x,y,w,h)：那是「注释下划线」API，误传 false 会导致 Rect NaN
}

/**
 * 在指定宽度下输出片段（支持 continued 换行）
 */
function drawSegments(doc, segments, ctx, x, width) {
  const merged = mergeSegments(segments).filter((s) => s.text != null && String(s.text).length > 0);
  if (!merged.length) {
    doc.moveDown(0.15);
    return;
  }
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

  const y0 = doc.y;
  const fs = Math.max(9, ctx.baseSize - 1);
  doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Courier").fontSize(fs);

  const textHeight = doc.heightOfString(code, { width: w - 2 * pad });
  const boxH = textHeight + 2 * pad + (lang ? fs + 4 : 0);

  doc.save();
  doc.rect(margin, y0, w, boxH).fill("#f1f5f9");
  doc.fillColor("#334155");

  let ty = y0 + pad;
  if (lang) {
    doc.fontSize(fs - 1).fillColor("#64748b").text(lang.trim(), margin + pad, ty, { width: w - 2 * pad });
    ty += fs + 2;
  }
  doc.fontSize(fs).fillColor("#1e293b");
  doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Courier");
  doc.text(code, margin + pad, ty, { width: w - 2 * pad });
  doc.restore();

  doc.y = y0 + boxH + 6;
}

function renderHr(doc, ctx) {
  const y = doc.y + 4;
  doc.moveTo(ctx.margin, y).lineTo(ctx.margin + ctx.contentWidth, y).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
  doc.y = y + 10;
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

  const allRows = [token.header, ...(token.rows || [])];
  const heights = allRows.map((row) => {
    let maxH = fs + 2 * pad;
    for (let c = 0; c < cols; c++) {
      const txt = cellPlain(row[c]);
      maxH = Math.max(maxH, cellTextHeight(txt) + 2 * pad);
    }
    return maxH;
  });

  let y = doc.y;
  const totalH = heights.reduce((a, b) => a + b, 0);

  doc.save();
  doc.rect(margin, y, w, totalH).strokeColor("#cbd5e1").lineWidth(0.5).stroke();

  let ry = y;
  for (let r = 0; r < allRows.length; r++) {
    const h = heights[r];
    const isHead = r === 0;
    if (isHead) {
      doc.rect(margin, ry, w, h).fill("#f1f5f9");
    }
    doc.moveTo(margin, ry + h).lineTo(margin + w, ry + h).strokeColor("#cbd5e1").lineWidth(0.5).stroke();

    for (let c = 0; c < cols; c++) {
      const x = margin + c * colW;
      if (c > 0) {
        doc.moveTo(x, ry).lineTo(x, ry + h).strokeColor("#cbd5e1").lineWidth(0.5).stroke();
      }
      const txt = cellPlain(allRows[r][c]);
      doc.fillColor(isHead ? "#0f172a" : "#334155");
      doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Helvetica");
      doc.fontSize(isHead ? fs + 0.5 : fs);
      const align = (token.align?.[c] || "left") === "right" ? "right" : token.align?.[c] === "center" ? "center" : "left";
      doc.text(txt, x + pad, ry + pad, { width: colW - 2 * pad, align });
    }
    ry += h;
  }
  doc.restore();
  doc.y = y + totalH + 8;
}

function renderBlockquote(doc, token, ctx) {
  const barW = 4;
  const gap = 10;
  const inner = ctx.margin + barW + gap;
  const w = ctx.contentWidth - barW - gap;
  const yStart = doc.y;

  const subCtx = { ...ctx, margin: inner, contentWidth: w };
  renderBlockTokens(doc, token.tokens || [], subCtx, 0);
  const yEnd = doc.y;

  doc.save();
  doc.fillColor("#e2e8f0").rect(ctx.margin, yStart, barW, Math.max(yEnd - yStart, 12)).fill();
  doc.restore();
  doc.moveDown(0.15);
}

function renderList(doc, list, ctx, depth) {
  let index = typeof list.start === "number" ? list.start : 1;
  const indent = depth * 18;

  for (const item of list.items) {
    const prefix = list.ordered ? `${index++}. ` : "• ";
    let first = true;

    for (const block of item.tokens || []) {
      if (block.type === "paragraph") {
        const segs = flattenInline(block.tokens?.length ? block.tokens : [{ type: "text", text: block.text || "" }]);
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
        doc.moveDown(0.15);
        break;
      case "heading": {
        const hs = headingSize(token.depth);
        const save = ctx.baseSize;
        ctx.baseSize = hs;
        doc.moveDown(0.2);
        if (ctx.hasChineseFont) doc.font(ctx.chineseFontName);
        else doc.font("Helvetica-Bold");
        doc.fillColor("#0f172a").fontSize(hs);
        const hToks = token.tokens?.length ? token.tokens : [{ type: "text", text: token.text || "" }];
        drawSegments(doc, flattenInline(hToks), ctx, ctx.margin, ctx.contentWidth);
        ctx.baseSize = save;
        doc.moveDown(0.15);
        break;
      }
      case "paragraph":
        drawSegments(
          doc,
          flattenInline(token.tokens?.length ? token.tokens : [{ type: "text", text: token.text || "" }]),
          ctx,
          ctx.margin,
          ctx.contentWidth
        );
        break;
      case "list":
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
          doc.font(ctx.hasChineseFont ? ctx.chineseFontName : "Helvetica").fontSize(ctx.baseSize).fillColor("#64748b");
          doc.text(token.text, ctx.margin, doc.y, { width: ctx.contentWidth });
          doc.moveDown(0.2);
        }
        break;
      default:
        if (token.text) {
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
    tokens = lexer(String(markdown || ""), { gfm: true });
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

  doc.y = margin;

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
