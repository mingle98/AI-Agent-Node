// ========== Markdown 转 HTML 渲染器 (使用 marked.js) ==========

import { marked } from 'marked';

/**
 * 将 Markdown 内容转换为 HTML
 * @param {string} markdown - Markdown 内容
 * @param {Object} options - 配置选项
 * @returns {string} - HTML 内容
 */
export function markdownToHtml(markdown, options = {}) {
  const { 
    title = 'Document',
    theme = 'default'
  } = options;

  // 使用 marked 解析 Markdown
  const htmlContent = marked.parse(markdown, {
    gfm: true,        // GitHub Flavored Markdown
    breaks: true,     // 自动转换换行
    headerIds: true,  // 为标题添加 id
    mangle: false,    // 不编码邮件地址
    sanitize: false   // 允许 HTML 标签
  });

  return generateHtmlDocument(htmlContent, { title, theme });
}

/**
 * 生成完整的 HTML 文档
 * @param {string} bodyContent - body 内容
 * @param {Object} options - 选项
 * @returns {string}
 */
function generateHtmlDocument(bodyContent, options = {}) {
  const { title = 'Document', theme = 'default' } = options;
  
  const themes = {
    default: {
      bg: '#ffffff',
      text: '#24292f',
      link: '#0969da',
      codeBg: '#f6f8fa',
      border: '#d0d7de',
      heading: '#1f2328',
      blockquoteBg: '#f6f8fa',
      blockquoteBorder: '#d0d7de'
    },
    dark: {
      bg: '#0d1117',
      text: '#c9d1d9',
      link: '#58a6ff',
      codeBg: '#161b22',
      border: '#30363d',
      heading: '#e6edf3',
      blockquoteBg: '#161b22',
      blockquoteBorder: '#30363d'
    },
    elegant: {
      bg: '#fafbfc',
      text: '#2d3748',
      link: '#3182ce',
      codeBg: '#edf2f7',
      border: '#e2e8f0',
      heading: '#1a202c',
      blockquoteBg: '#f7fafc',
      blockquoteBorder: '#cbd5e0'
    }
  };
  
  const t = themes[theme] || themes.default;
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: ${t.text};
      background-color: ${t.bg};
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 24px;
      word-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
      color: ${t.heading};
    }
    h1 { font-size: 2em; border-bottom: 1px solid ${t.border}; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid ${t.border}; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    h5 { font-size: 0.875em; }
    h6 { font-size: 0.85em; color: ${theme === 'dark' ? '#8b949e' : '#656d76'}; }
    p { margin-top: 0; margin-bottom: 16px; }
    a { color: ${t.link}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    del { text-decoration: line-through; }
    ul, ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; }
    li { margin-bottom: 0.25em; }
    li > p { margin-top: 16px; }
    ul ul, ul ol, ol ol, ol ul { margin-top: 0; margin-bottom: 0; }
    blockquote {
      margin: 0 0 16px;
      padding: 0 1em;
      color: ${theme === 'dark' ? '#8b949e' : '#656d76'};
      border-left: 0.25em solid ${t.blockquoteBorder};
      background-color: ${t.blockquoteBg};
    }
    blockquote > :first-child { margin-top: 0; }
    blockquote > :last-child { margin-bottom: 0; }
    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 85%;
      padding: 0.2em 0.4em;
      background-color: ${t.codeBg};
      border-radius: 6px;
    }
    pre {
      padding: 16px;
      overflow: auto;
      font-size: 85%;
      line-height: 1.45;
      background-color: ${t.codeBg};
      border-radius: 6px;
      margin-bottom: 16px;
    }
    pre code {
      display: inline;
      padding: 0;
      margin: 0;
      overflow: visible;
      line-height: inherit;
      background-color: transparent;
      border: 0;
      font-size: 100%;
    }
    img { max-width: 100%; box-sizing: content-box; border-radius: 6px; }
    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: ${t.border};
      border: 0;
    }
    table {
      border-spacing: 0;
      border-collapse: collapse;
      margin-bottom: 16px;
      width: 100%;
      overflow: auto;
    }
    table th, table td {
      padding: 6px 13px;
      border: 1px solid ${t.border};
    }
    table tr {
      background-color: ${t.bg};
      border-top: 1px solid ${t.border};
    }
    table tr:nth-child(2n) { background-color: ${t.codeBg}; }
    table th { font-weight: 600; background-color: ${t.codeBg}; }
    @media print {
      body { padding: 0; background-color: white; color: black; }
      h1, h2 { border-bottom-color: #000; }
      pre, code, blockquote { background-color: #f5f5f5 !important; }
    }
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

/**
 * 创建富文本文件（Markdown 自动转 HTML）
 * @param {string} filePath - 文件路径
 * @param {string} markdownContent - Markdown 内容
 * @param {Object} options - 选项
 * @returns {Object} - 文件信息
 */
export function createRichTextFile(filePath, markdownContent, options = {}) {
  const { title, theme = 'default' } = options;
  
  // 如果路径是 .md 文件，改为 .html
  let htmlPath = filePath;
  if (filePath.endsWith('.md')) {
    htmlPath = filePath.replace(/\.md$/, '.html');
  } else if (!filePath.endsWith('.html')) {
    htmlPath = filePath + '.html';
  }
  
  // 转换为 HTML
  const htmlContent = markdownToHtml(markdownContent, { 
    title: title || htmlPath.split('/').pop().replace('.html', ''),
    theme 
  });
  
  return {
    htmlPath,
    htmlContent,
    originalPath: filePath,
    isConverted: filePath !== htmlPath
  };
}
