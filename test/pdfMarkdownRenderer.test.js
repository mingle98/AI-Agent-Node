/**
 * pdfMarkdownRenderer 完整测试套件
 *
 * 覆盖范围：
 *   1. 单元测试：flattenInline / tokensToPlain / sameStyle / mergeSegments / headingSize
 *   2. 集成测试：renderMarkdownOnPdf 生成 PDF（doc.end() 不抛错）
 *      - 标题（H1-H6）
 *      - 段落（加粗 / 斜体 / 代码 / 删除线 / 链接 / 图片占位 / 转义）
 *      - 无序列表 / 有序列表 / 嵌套列表
 *      - 围栏代码块
 *      - 引用块
 *      - 水平线
 *      - 表格（左/中/右对齐）
 *      - 空输入容错
 *      - plain 选项跳过 Markdown 渲染
 *      - 多页内容
 */
import test from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import {
  renderMarkdownOnPdf,
  flattenInline,
  tokensToPlain,
  sameStyle,
  mergeSegments,
  headingSize,
} from "../tools/pdfMarkdownRenderer.js";
import { TOOLS } from "../tools/index.js";

// ---------------------------------------------------------------------------
// 辅助：生成 minimal PDFKit doc，用于渲染测试
// ---------------------------------------------------------------------------
function makeDoc() {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  let pageAddedCount = 0;
  doc.on("data", (c) => chunks.push(c));
  doc.on("pageAdded", () => {
    pageAddedCount += 1;
  });
  return {
    doc,
    chunks,
    getPageCount: () => 1 + pageAddedCount,
  };
}

async function endAndBuffer(doc, chunks) {
  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// ---------------------------------------------------------------------------
// 1. headingSize
// ---------------------------------------------------------------------------
test("headingSize: 1-6 返回正确的字号", () => {
  assert.equal(headingSize(1), 20);
  assert.equal(headingSize(2), 16);
  assert.equal(headingSize(3), 14);
  assert.equal(headingSize(4), 13);
  assert.equal(headingSize(5), 12);
  assert.equal(headingSize(6), 11);
  assert.equal(headingSize(99), 11); // 越界回退
  assert.equal(headingSize(0), 11);
});

// ---------------------------------------------------------------------------
// 2. tokensToPlain / flattenInline
// ---------------------------------------------------------------------------
test("tokensToPlain: 提取行内 token 的纯文本", () => {
  const tokens = [
    { type: "text", text: "Hello " },
    { type: "strong", tokens: [{ type: "text", text: "Bold" }] },
    { type: "text", text: " world" },
  ];
  assert.equal(tokensToPlain(tokens), "Hello Bold world");
});

test("tokensToPlain: 空值返回空字符串", () => {
  assert.equal(tokensToPlain([]), "");
  assert.equal(tokensToPlain(null), "");
  assert.equal(tokensToPlain(undefined), "");
});

test("flattenInline: strong / em / codespan / del / link / image / br / escape / html / text", () => {
  const tokens = [
    { type: "strong", tokens: [{ type: "text", text: "bold" }] },
    { type: "em", tokens: [{ type: "text", text: "italic" }] },
    { type: "codespan", text: "code" },
    { type: "del", tokens: [{ type: "text", text: "del" }] },
    { type: "link", href: "https://x.com", tokens: [{ type: "text", text: "link" }] },
    { type: "image", text: "alt" },
    { type: "br" },
    { type: "escape", text: "&" },
    { type: "html", text: "<b>" },
    { type: "text", text: "plain" },
  ];
  const segs = flattenInline(tokens);
  assert.equal(segs.length, 10);
  assert.equal(segs[0].bold, true);
  assert.equal(segs[0].text, "bold");
  assert.equal(segs[1].italic, true);
  assert.equal(segs[1].text, "italic");
  assert.equal(segs[2].code, true);
  assert.equal(segs[2].text, "code");
  assert.equal(segs[3].strike, true);
  assert.equal(segs[4].link, "https://x.com");
  assert.equal(segs[4].text, "link");
  assert.equal(segs[5].text, "[图片: alt]");
  assert.equal(segs[6].text, "\n");
  assert.equal(segs[7].text, "&");
  assert.equal(segs[8].text, "<b>");
  assert.equal(segs[9].text, "plain");
});

test("flattenInline: 嵌套多级 token 正确继承属性", () => {
  const tokens = [
    {
      type: "strong",
      tokens: [
        { type: "em", tokens: [{ type: "text", text: "bold-italic" }] },
      ],
    },
  ];
  const segs = flattenInline(tokens);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].bold, true);
  assert.equal(segs[0].italic, true);
  assert.equal(segs[0].text, "bold-italic");
});

test("flattenInline: 无效 token 不崩溃", () => {
  const tokens = [
    { type: "unknown", text: "???" },
    { type: "text" },
    { type: "text", text: null },
  ];
  assert.doesNotThrow(() => flattenInline(tokens));
  const segs = flattenInline(tokens);
  assert.ok(segs.length >= 1);
});

// ---------------------------------------------------------------------------
// 3. sameStyle
// ---------------------------------------------------------------------------
test("sameStyle: 相同属性返回 true", () => {
  assert.equal(sameStyle({ bold: true, italic: false }, { bold: true, italic: false }), true);
  assert.equal(sameStyle({ code: true }, { code: true }), true);
  assert.equal(sameStyle({}, {}), true);
  assert.equal(sameStyle({ link: "https://x.com" }, { link: "https://x.com" }), true);
});

test("sameStyle: 不同属性返回 false", () => {
  assert.equal(sameStyle({ bold: true }, { bold: false }), false);
  assert.equal(sameStyle({ bold: true }, { italic: true }), false);
  assert.equal(sameStyle({ link: "a" }, { link: "b" }), false);
  assert.equal(sameStyle({ code: true }, {}), false);
});

// ---------------------------------------------------------------------------
// 4. mergeSegments
// ---------------------------------------------------------------------------
test("mergeSegments: 合并相邻同样式片段（直接拼接，不额外加空格）", () => {
  const segs = [
    { text: "Hello", bold: true },
    { text: " ", bold: true },
    { text: "World", bold: true },
    { text: "!", bold: false },
  ];
  const merged = mergeSegments(segs);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].text, "Hello World");
  assert.equal(merged[1].text, "!");
  assert.equal(merged[1].bold, false);
});

test("mergeSegments: 换行符阻止合并", () => {
  const segs = [
    { text: "Line1\n", bold: true },
    { text: "Line2", bold: true },
  ];
  const merged = mergeSegments(segs);
  assert.equal(merged.length, 2);
});

test("mergeSegments: 末尾换行阻止合并", () => {
  const segs = [
    { text: "A\n", bold: true },
    { text: "B", bold: true },
  ];
  const merged = mergeSegments(segs);
  assert.equal(merged.length, 2);
});

test("mergeSegments: null/undefined 片段转为 'null' 字符串（不崩溃）", () => {
  const segs = [
    { text: "Hello", bold: true },
    { text: null, bold: true },
    { text: undefined, bold: true },
    { text: "World", bold: true },
  ];
  const merged = mergeSegments(segs);
  // null/undefined 转为 "null"/"undefined" 字符串，被合并进相邻片段
  assert.ok(merged.length >= 1);
  assert.ok(merged[0].text.includes("Hello"));
  assert.ok(merged[0].text.includes("null"));
  assert.ok(merged[0].text.includes("undefined"));
  assert.ok(merged[0].text.includes("World"));
});

test("mergeSegments: 空数组返回空数组", () => {
  assert.deepEqual(mergeSegments([]), []);
});

// ---------------------------------------------------------------------------
// 5. renderMarkdownOnPdf — 集成测试
// ---------------------------------------------------------------------------

test("renderMarkdownOnPdf: H1-H6 标题全部成功生成", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6", {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100, "PDF buffer 应该有内容");
  assert.ok(buf.slice(0, 4).toString() === "%PDF", "PDF magic header");
});

test("renderMarkdownOnPdf: 加粗/斜体/代码/删除线/链接 全部成功生成", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(
      doc,
      "**bold** *italic* `code` ~~del~~ [link](https://example.com)",
      {}
    );
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 图片 token 产生占位符文本不抛错", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "![alt text](https://example.com/img.png)", {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 转义字符 & HTML 行内 token", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(
      doc,
      "行内 `代码` 与 **加粗** 混排，含 \\*转义\\* 与 <span>HTML</span>",
      {}
    );
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 无序列表", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(
      doc,
      "- Item A\n- Item B\n  - Nested\n  - Also nested",
      {}
    );
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 列表项内 **加粗**（GFM 块级 text，非 paragraph）", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  const md = "**经济基础**：交通运输数据印证了实体经济的活跃度与抗风险能力。";
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, `- ${md}`, {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
  const s = buf.toString("latin1");
  assert.ok(!s.includes("**"), "PDF 流中不应再出现未解析的 ** 字面量");
});

test("renderMarkdownOnPdf: 有序列表", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "1. First\n2. Second\n3. Third", {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 有序列表 start 属性", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "99. Ninety-nine\n100. One hundred", {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 围栏代码块（含语言标签）", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  const md = "```javascript\nconst x = 42;\nconsole.log(x);\n```";
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, md, {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 引用块", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "> 这是一段引用\n> 多行引用内容", {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 水平线", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "上文\n\n---\n\n下文", {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 表格（左/中/右对齐）", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  const md =
    "| 左对齐 | 居中 | 右对齐 |\n" +
    "| :--- | :---: | ---: |\n" +
    "| A1 | B1 | C1 |\n" +
    "| A2 | B2 | C2 |";
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, md, {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 空字符串 / 空白 / null / undefined 不抛错", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "", {});
    renderMarkdownOnPdf(doc, "   ", {});
    renderMarkdownOnPdf(doc, null, {});
    renderMarkdownOnPdf(doc, undefined, {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 0);
});

test("renderMarkdownOnPdf: title 选项渲染第一页标题", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, "## 正文", { title: "My Report" });
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: title 为空或 'Document' 时忽略", async () => {
  const { doc: d1, chunks: c1 } = makeDoc();
  const { doc: d2, chunks: c2 } = makeDoc();
  d1.font("Helvetica");
  d2.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(d1, "## 正文", { title: "" });
    renderMarkdownOnPdf(d2, "## 正文", { title: "Document" });
  });
  const [buf1, buf2] = await Promise.all([endAndBuffer(d1, c1), endAndBuffer(d2, c2)]);
  assert.ok(buf1.length > 0);
  assert.ok(buf2.length > 0);
});

test("renderMarkdownOnPdf: 中文内容（无中文字体）回退成功", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(
      doc,
      "# 标题\n这是**中文**段落，包含*斜体*。",
      { hasChineseFont: false }
    );
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 复杂混排（完整报告格式）", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  const md =
    "# 项目报告\n\n" +
    "## 概述\n" +
    "这是**加粗**与*斜体*混合的段落，含 `代码` 与 [链接](https://example.com)。\n\n" +
    "## 代码示例\n" +
    "```python\nprint('hello')\n```\n\n" +
    "| 指标 | 数值 |\n" +
    "|------|------|\n" +
    "| A | 100 |\n\n" +
    "> 引用：这是一段引用内容。\n\n" +
    "---\n\n" +
    "1. 步骤一\n2. 步骤二\n   - 子步骤 A\n   - 子步骤 B\n";
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, md, { title: "完整报告测试" });
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 多页内容（两页段落）", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  const para = (n) => `这是第 ${n} 段测试文本，用于验证多页渲染。`.repeat(10);
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(
      doc,
      `# 第一页\n\n${para(1)}\n\n# 第二页\n\n${para(2)}`,
      {}
    );
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 200);
});

test("renderMarkdownOnPdf: 段落中混排多种行内样式", async () => {
  const { doc, chunks } = makeDoc();
  doc.font("Helvetica");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(
      doc,
      "**粗** + *斜* + `代码` + ~~划~~ + [链](https://x.com) + 图示![](x.png)",
      {}
    );
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 100);
});

test("renderMarkdownOnPdf: 多页代码块与表格安全分页", async () => {
  const { doc, chunks, getPageCount } = makeDoc();
  doc.font("Helvetica");
  const codeLines = Array.from({ length: 120 }, (_, i) => `console.log('line ${i + 1}')`).join("\n");
  const tableRows = Array.from({ length: 40 }, (_, i) => `| 行 ${i + 1} | 内容 ${"数据".repeat(8)} |`).join("\n");
  const md =
    "# 跨页块测试\n\n" +
    "```javascript\n" +
    codeLines +
    "\n```\n\n" +
    "| 标题 | 说明 |\n" +
    "| --- | --- |\n" +
    tableRows;

  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, md, {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 500);
  assert.ok(getPageCount() >= 2);
});

test("renderMarkdownOnPdf: blockquote 跨页不应抛错", async () => {
  const { doc, chunks, getPageCount } = makeDoc();
  doc.font("Helvetica");
  const quoteBody = Array.from({ length: 140 }, (_, i) => `> 这是第 ${i + 1} 行引用内容，${"测试文本".repeat(12)}`).join("\n");
  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, quoteBody, {});
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 300);
  assert.ok(getPageCount() >= 2);
});

test("renderMarkdownOnPdf: 实际政策汇总样式内容分页稳定", async () => {
  const { doc, chunks, getPageCount } = makeDoc();
  doc.font("Helvetica");
  const repeatEmploymentBlock = Array.from({ length: 36 }, (_, i) => (
    `### 就业带动（案例 ${i + 1}）\n` +
    `- 无带动1人就业，年补贴1000元，最高2万元/年（3年）\n` +
    `- 吸纳重点群体就业可叠加社保补贴与岗位补贴\n` +
    `- 区级政策通常要求企业正常经营、依法纳税、按期申报\n`
  )).join("\n");

  const md =
    "# 一人公司政策汇总\n\n" +
    "## 1. 杭州市 —— 《支持一人公司 OPC 创新创业发展的若干举措》（2026年4月）\n\n" +
    "核心政策\n\n" +
    "| 类别 | 内容 |\n" +
    "| --- | --- |\n" +
    "| 审批简化 | 全程网办 + 半天办结；首套公章免费刻制；电子执照免费申领 |\n" +
    "| 地址灵活 | 推行工位注册、一址多照、免房产证明 |\n" +
    "| 治理简化 | 一人可兼任法人、执行董事、经理，无需监事 |\n" +
    "| 税收优惠 | 增值税免征（小规模纳税人月销<10万）；企业所得税实际税负约5% |\n" +
    "| 创业补贴 | 初次创办且经营满6个月，补贴3000元（大学生/失业人员） |\n\n" +
    "注册流程\n\n" +
    "1. 登录“浙里办”企业开办专区\n" +
    "2. 名称自主申报（准备 3-5 个备选名）\n" +
    "3. 填写经营范围、注册资本（建议10-50万，5年内实缴）\n" +
    "4. 提交法人/股东信息、股权比例（100%独资）\n" +
    "5. 选择注册地址（自有/租赁/园区工位）\n" +
    "6. 审核通过后领取营业执照（最快半天）\n" +
    "7. 免费刻章、申领电子执照\n\n" +
    "## 2. 上海市 —— 各区差异化补贴\n\n" +
    "### 临港区\n" +
    "- 团办公与住宿：前3年享租金减免\n" +
    "- 算力补贴：最高30万元\n" +
    "- 融资支持：最高500万元 + 80万元创业担保贷款\n" +
    "- 人才政策：直接落户 / 绿色通道 / 创业保险\n\n" +
    "### 徐汇区\n" +
    "- 办公支持：首年工位全免，优秀者再免1年 + 租房补贴2000元/月\n" +
    "- 核心资源：“三券”（算力 / 模型 / 语料），每项最高100万元\n" +
    "- 资金支持：启动资金最高10万元 + 赛事奖励最高500万元\n\n" +
    "### 浦东新区（张江）\n" +
    "- 园区孵化：可申请低成本工位、联合办公和公共会议室\n" +
    "- 科创支持：对人工智能、数据、芯片类项目优先推荐入库\n" +
    "- 金融支持：贷款贴息、知识产权质押融资、人才安居政策\n\n" +
    repeatEmploymentBlock;

  assert.doesNotThrow(() => {
    renderMarkdownOnPdf(doc, md, { title: "政策汇总复现测试" });
  });
  const buf = await endAndBuffer(doc, chunks);
  assert.ok(buf.length > 1200);
  assert.ok(getPageCount() >= 4);
});

// ---------------------------------------------------------------------------
// 6. writePdf 通过 pdf_write 工具 — Markdown vs plain 模式
// ---------------------------------------------------------------------------
test("pdf_write: Markdown 模式（默认）生成 PDF 成功", async () => {
  const sid = `pdf_md_${Date.now()}`;
  const res = await TOOLS.pdf_write(
    sid,
    "test_md_mode.pdf",
    "# 标题\n\n**加粗**段落",
    JSON.stringify({ overwrite: true })
  );
  assert.equal(res.success, true, `Markdown 模式失败: ${res.error || res.message}`);
  await TOOLS.file_delete(sid, "test_md_mode.pdf", false).catch(() => {});
});

test("pdf_write: plain 模式生成 PDF 成功", async () => {
  const sid = `pdf_plain_${Date.now()}`;
  const res = await TOOLS.pdf_write(
    sid,
    "test_plain_mode.pdf",
    "# 标题（plain）\n\n**加粗**不会被渲染",
    JSON.stringify({ overwrite: true, contentFormat: "plain" })
  );
  assert.equal(res.success, true, `plain 模式失败: ${res.error || res.message}`);
  await TOOLS.file_delete(sid, "test_plain_mode.pdf", false).catch(() => {});
});

test("pdf_write: format: 'plain' 等效跳过 Markdown 渲染", async () => {
  const sid = `pdf_format_${Date.now()}`;
  const res = await TOOLS.pdf_write(
    sid,
    "test_format.pdf",
    "plain via format option",
    JSON.stringify({ overwrite: true, format: "plain" })
  );
  assert.equal(res.success, true, `format plain 失败: ${res.error || res.message}`);
  await TOOLS.file_delete(sid, "test_format.pdf", false).catch(() => {});
});

test("pdf_write: 中文 Markdown 生成 PDF（含系统字体回退）", async () => {
  const sid = `pdf_cn_${Date.now()}`;
  const res = await TOOLS.pdf_write(
    sid,
    "test_cn_md.pdf",
    "# 中文报告\n\n这是**加粗**中文段落，含 *斜体* 与 [链接](https://example.com)。\n\n```\n代码块\n```\n",
    JSON.stringify({ overwrite: true })
  );
  assert.equal(res.success, true, `中文 Markdown 失败: ${res.error || res.message}`);
  assert.equal(typeof res.hasChineseFont, "boolean", "应返回 hasChineseFont 布尔值");
  await TOOLS.file_delete(sid, "test_cn_md.pdf", false).catch(() => {});
});

test("pdf_write: 覆盖已存在文件（默认 overwrite:true）", async () => {
  const sid = `pdf_overwrite_${Date.now()}`;
  const path = "test_overwrite.pdf";
  const res1 = await TOOLS.pdf_write(sid, path, "v1", JSON.stringify({ overwrite: true }));
  assert.equal(res1.success, true, "首次写入失败");
  const res2 = await TOOLS.pdf_write(sid, path, "v2", JSON.stringify({ overwrite: true }));
  assert.equal(res2.success, true, "覆盖写入失败");
  await TOOLS.file_delete(sid, path, false).catch(() => {});
});

test("pdf_write: 文件不存在时正常创建", async () => {
  const sid = `pdf_newfile_${Date.now()}`;
  const res = await TOOLS.pdf_write(
    sid,
    `test_new_${Date.now()}.pdf`,
    "brand new",
    JSON.stringify({ overwrite: true })
  );
  assert.equal(res.success, true, "新建文件应成功");
  await TOOLS.file_delete(sid, res.filePath, false).catch(() => {});
});

test("pdf_write: 返回正确的 url / pageCount / hasChineseFont", async () => {
  const sid = `pdf_ret_${Date.now()}`;
  const res = await TOOLS.pdf_write(
    sid,
    "test_ret.pdf",
    "# Test",
    JSON.stringify({ overwrite: true })
  );
  assert.equal(res.success, true);
  assert.ok(typeof res.url === "string");
  assert.ok(res.url.includes("/workspace/"));
  assert.ok(typeof res.pageCount === "number");
  assert.ok(res.pageCount >= 1);
  assert.ok(typeof res.hasChineseFont === "boolean");
  await TOOLS.file_delete(sid, "test_ret.pdf", false).catch(() => {});
});
