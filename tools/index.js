// ========== 工具路由（带元数据） ==========
import { searchKnowledgeBase } from './knowledge.js';
import { analyzeCode } from './codeAnalyzer.js';
import { generateDocument } from './document.js';
import { renderMermaid } from './mermaid.js';
import { analyzeChart } from './chartAnalyzer.js';
import { getDailyNews } from './dailyNews.js';
import { execCode } from './execCode.js';
import { generatePythonScript, analyzeScriptResult, setScriptGeneratorLLM, checkScriptSafety } from './scriptGenerator.js';
import {
  listDirectory, readFile, writeFile, deleteFile, createDirectory,
  moveFile, copyFile, getFileInfo, searchFiles, batchFileOperations, initWorkspace, getUserStorageStats, resolveWorkspacePath
} from './fileManager.js';
import {
  readExcel, writeExcel, appendToExcel, readWord, writeWord,
  readWordAsHtml, readPdf, writePdf, mergePdfs, getImageInfo, writeSvg,
  readCsv, writeCsv, readJson, writeJson, writeDocx
} from './fileFormatHandler.js';
import { compressFiles, extractArchive, getArchiveInfo, listArchiveContents } from './compress.js';
import { sendEmail, sendTemplateEmail, verifySmtpConfig } from './email.js';
import { scheduleTask, getTasks, cancelTask, getTaskById, cleanupTasks } from './scheduler.js';
import { compressImage, compressImageBatch } from './imageProcessor.js';
import { TOOLS_NEEDING_SESSION_ID, toolNeedsSessionId } from './toolConstants.js';

// 重新导出工具常量，供其他模块使用
export { TOOLS_NEEDING_SESSION_ID, toolNeedsSessionId };

export const TOOL_DEFINITIONS = [
  {
    name: "search_knowledge",
    func: (vectorStore, query) => searchKnowledgeBase(vectorStore, query),
    description: "搜索本地知识库，获取AI Agent相关资料或AISuspendedBallChat组件文档",
    params: [
      { name: "查询内容", type: "string", example: "AI Agent架构设计" }
    ],
    example: 'search_knowledge("AI Agent架构设计")',
    special: true,
  },
  {
    name: "analyze_code",
    func: (code, language) => analyzeCode(code, language),
    description: "分析代码片段，解释逻辑、找出潜在问题或优化建议",
    params: [
      { name: "代码内容", type: "string", example: "function add(a, b) { return a + b; }" },
      { name: "编程语言", type: "string", example: "javascript", options: ["javascript", "python", "java", "cpp", "go", "rust", "typescript", "other"] }
    ],
    example: 'analyze_code("function add(a, b) { return a + b; }", "javascript")',
  },
  {
    name: "analyze_chart",
    func: (chartType, source, userGoal) => analyzeChart(chartType, source, userGoal),
    description: "分析图表源码/配置（Mermaid/ECharts），输出结构讲解、要点与总结，帮助用户理解图表表达的含义",
    params: [
      { name: "图表类型", type: "string", example: "mermaid", options: ["mermaid", "echarts"] },
      { name: "图表源码/配置", type: "string", example: "graph TD\nA-->B" },
      { name: "分析目标(可选)", type: "string", example: "解释业务流程与关键分支", required: false }
    ],
    example: 'analyze_chart("mermaid", "graph TD\\nA-->B", "解释流程")',
  },
  {
    name: "generate_document",
    func: (topic, docType, outline) => generateDocument(topic, docType, outline),
    description: "生成各类技术文档，如API文档、教程、README等",
    params: [
      { name: "文档主题", type: "string", example: "AI Agent快速入门" },
      { name: "文档类型", type: "string", example: "tutorial", options: ["tutorial", "api", "readme", "architecture", "guide"] },
      { name: "文档大纲", type: "string", example: "1.简介 2.安装 3.快速开始", required: false }
    ],
    example: 'generate_document("AI Agent快速入门", "tutorial", "1.简介 2.安装 3.快速开始")',
  },
  {
    name: "render_mermaid",
    func: (diagramOrType, body) => renderMermaid(diagramOrType, body),
    description: "将 Mermaid 源码渲染为标准 ```mermaid 代码块（支持直接传源码，或传 图表类型+内容 自动拼装）",
    params: [
      { name: "Mermaid源码或图表类型", type: "string", example: "sequence" },
      { name: "图表内容(可选)", type: "string", example: "participant U as 用户\nU->>F: 发送消息", required: false }
    ],
    example: 'render_mermaid("sequence", "participant U as 用户\\nU->>F: 发送消息")',
  },
  {
    name: "daily_news",
    func: (platform, limit) => getDailyNews(platform, limit),
    description: "查询今日热点新闻列表（默认：腾讯网）",
    params: [
      { name: "平台(可选)", type: "string", example: "tenxunwang", options: ["tenxunwang", "weibo"], required: false },
      { name: "返回条数(可选)", type: "number", example: 10, required: false }
    ],
    example: 'daily_news("tenxunwang", 10)',
  },
  {
    name: "exec_code",
    func: (code, language) => execCode(code, language),
    description: "在服务端沙箱环境中执行代码（支持 JavaScript/TypeScript/Python），用于数据转换、算法验证、脚本执行。注意：Python 沙箱为独立进程，无法 import 本项目的 JS 工具模块（如 daily_news），如需调用系统工具请直接使用对应工具或通过 schedule_task 调度",
    params: [
      { name: "代码内容", type: "string", example: "console.log('Hello World')" },
      { name: "编程语言", type: "string", example: "javascript", options: ["javascript", "typescript", "python"], required: false }
    ],
    example: 'exec_code("console.log(2+3)", "javascript")',
  },
  {
    name: "script_generator",
    func: (task, dataInput, outputFormat) => generatePythonScript(task, dataInput, outputFormat),
    description: "使用 LLM 根据需求生成 Python 脚本，支持数据统计、转换、算法验证等场景",
    params: [
      { name: "任务描述", type: "string", example: "计算这组数据的平均值和标准差" },
      { name: "输入数据", type: "string", example: "10, 20, 30, 40, 50", required: false },
      { name: "输出格式", type: "string", example: "auto", options: ["auto", "summary", "json", "csv", "chart_data"], required: false }
    ],
    example: 'script_generator("计算平均值", "10, 20, 30", "auto")',
  },
  // ========== 文件管理工具 ==========
  {
    name: "file_list",
    func: (sessionId, dirPath, recursive) => listDirectory(sessionId, dirPath || '', { recursive }),
    description: "列出用户专属的 workspace 目录下的文件和文件夹，支持递归列出子目录。每个用户只能访问自己的目录",
    params: [
      { name: "目录路径", type: "string", example: "docs", required: false },
      { name: "递归列出", type: "boolean", example: "false", required: false }
    ],
    example: 'file_list("docs", true)',
  },
  {
    name: "file_quota",
    func: (sessionId) => getUserStorageStats(sessionId),
    description: "查询用户 workspace 的存储配额使用情况（已用/剩余/文件数等）",
    params: [],
    example: 'file_quota()',
  },
  {
    name: "file_read",
    func: (sessionId, filePath, maxSize) => readFile(sessionId, filePath, { maxSize }),
    description: "读取用户 workspace 中指定文件的内容。支持文本文件、图片返回URL、Office文档返回基本信息",
    params: [
      { name: "文件路径", type: "string", example: "docs/readme.md" },
      { name: "最大读取字节数", type: "number", example: "1048576", required: false }
    ],
    example: 'file_read("docs/readme.md")',
  },
  {
    name: "file_write",
    func: (sessionId, filePath, content, overwrite) => writeFile(sessionId, filePath, content, { overwrite }),
    description: "在用户 workspace 中创建或写入文件。支持多种格式，返回文件访问URL",
    params: [
      { name: "文件路径", type: "string", example: "scripts/hello.js" },
      { name: "文件内容", type: "string", example: "console.log('Hello')" },
      { name: "是否覆盖", type: "boolean", example: "false", required: false }
    ],
    example: 'file_write("hello.txt", "Hello World", false)',
  },
  {
    name: "file_delete",
    func: (sessionId, path, recursive) => deleteFile(sessionId, path, { recursive }),
    description: "删除用户 workspace 中的文件或目录",
    params: [
      { name: "目标路径", type: "string", example: "old_file.txt" },
      { name: "递归删除", type: "boolean", example: "false", required: false }
    ],
    example: 'file_delete("temp/old_file.txt")',
  },
  {
    name: "file_mkdir",
    func: (sessionId, dirPath) => createDirectory(sessionId, dirPath),
    description: "在用户 workspace 中创建新目录",
    params: [
      { name: "目录路径", type: "string", example: "projects/myapp/src" }
    ],
    example: 'file_mkdir("projects/myapp")',
  },
  {
    name: "file_move",
    func: (sessionId, source, target, overwrite) => moveFile(sessionId, source, target, { overwrite }),
    description: "移动或重命名用户 workspace 中的文件/目录",
    params: [
      { name: "源路径", type: "string", example: "old_name.txt" },
      { name: "目标路径", type: "string", example: "new_name.txt" },
      { name: "是否覆盖", type: "boolean", example: "false", required: false }
    ],
    example: 'file_move("draft.md", "published/article.md")',
  },
  {
    name: "file_copy",
    func: (sessionId, source, target, overwrite) => copyFile(sessionId, source, target, { overwrite }),
    description: "复制用户 workspace 中的文件或目录",
    params: [
      { name: "源路径", type: "string", example: "template.html" },
      { name: "目标路径", type: "string", example: "backup/template.html" },
      { name: "是否覆盖", type: "boolean", example: "false", required: false }
    ],
    example: 'file_copy("template.html", "backup/template.html")',
  },
  {
    name: "file_info",
    func: (sessionId, filePath) => getFileInfo(sessionId, filePath),
    description: "获取用户 workspace 中文件或目录的详细信息",
    params: [
      { name: "文件路径", type: "string", example: "data/report.xlsx" }
    ],
    example: 'file_info("data/report.xlsx")',
  },
  {
    name: "file_search",
    func: (sessionId, keyword, dirPath) => searchFiles(sessionId, keyword, dirPath || ''),
    description: "在用户 workspace 中搜索文件",
    params: [
      { name: "搜索关键词", type: "string", example: "report" },
      { name: "搜索目录", type: "string", example: "docs", required: false }
    ],
    example: 'file_search("report", "docs")',
  },
  // ========== Excel 文件工具 ==========
  {
    name: "excel_read",
    func: (sessionId, filePath, sheetName) => readExcel(filePath, sessionId, { sheetName }),
    description: "读取用户 workspace 中的 Excel 文件，返回工作表列表和单元格数据",
    params: [
      { name: "文件路径", type: "string", example: "data/report.xlsx" },
      { name: "工作表名", type: "string", example: "Sheet1", required: false }
    ],
    example: 'excel_read("data/sales.xlsx", "Sheet1")',
  },
  {
    name: "excel_write",
    func: (sessionId, filePath, data, sheetName) => writeExcel(filePath, sessionId, JSON.parse(data), { sheetName }),
    description: "在用户 workspace 中创建 Excel 文件，支持写入二维数组数据",
    params: [
      { name: "文件路径", type: "string", example: "output/report.xlsx" },
      { name: "数据", type: "string", example: '[["姓名","年龄"],["张三",25]]' },
      { name: "工作表名", type: "string", example: "数据", required: false }
    ],
    example: 'excel_write("report.xlsx", "[[\"姓名\",\"分数\"],[\"张三\",90]]", "成绩")',
  },
  {
    name: "excel_append",
    func: (sessionId, filePath, data) => appendToExcel(filePath, sessionId, JSON.parse(data)),
    description: "向用户 workspace 中的 Excel 文件追加数据行",
    params: [
      { name: "文件路径", type: "string", example: "data/log.xlsx" },
      { name: "追加数据", type: "string", example: '[["2024-01-01","操作记录"]]' }
    ],
    example: 'excel_append("data/log.xlsx", "[[\"2024-01-15\",\"新记录\"]]")',
  },
  // ========== Word 文件工具 ==========
  {
    name: "word_read",
    func: (sessionId, filePath) => readWord(filePath, sessionId),
    description: "读取用户 workspace 中 Word 文档的纯文本内容",
    params: [
      { name: "文件路径", type: "string", example: "docs/document.docx" }
    ],
    example: 'word_read("docs/report.docx")',
  },
  {
    name: "word_read_html",
    func: (sessionId, filePath) => readWordAsHtml(filePath, sessionId),
    description: "将用户 workspace 中 Word 文档转换为 HTML 格式",
    params: [
      { name: "文件路径", type: "string", example: "docs/document.docx" }
    ],
    example: 'word_read_html("docs/report.docx")',
  },
  {
    name: "word_write_docx",
    func: (sessionId, filePath, content, options = "{}") => {
      let paragraphs;
      if (typeof content === 'string') {
        const trimmed = content.trim();
        // 检测是否为 JSON 数组或对象
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || 
            (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
          try {
            const parsed = JSON.parse(trimmed);
            paragraphs = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // JSON 解析失败，按行分割
            paragraphs = content.split('\n').filter(line => line.trim()).map(line => ({ text: line }));
          }
        } else {
          // 普通文本，按行分割
          paragraphs = content.split('\n').filter(line => line.trim()).map(line => ({ text: line }));
        }
      } else {
        paragraphs = Array.isArray(content) ? content : [content];
      }
      return writeDocx(filePath, sessionId, paragraphs, { overwrite: true, ...JSON.parse(options) });
    },
    description: "创建真正的 Word 文档（.docx 格式），使用 A4 纸张尺寸（210mm x 297mm）",
    params: [
      { name: "文件路径", type: "string", example: "output/document.docx", description: "输出 .docx 文件路径" },
      { name: "内容", type: "string|array", example: "[{\"text\":\"标题\",\"heading\":\"Heading1\"},{\"text\":\"正文内容\"}]", description: "段落数组或纯文本（自动按行分割）。支持属性：text, heading(Heading1-6), bold, italic, fontSize, alignment(left/center/right/justified)" },
      { name: "选项", type: "object", example: '{"title":"文档标题"}', description: "可选参数：title文档标题", required: false }
    ],
    example: 'word_write_docx("output/report.docx", "[{\"text\":\"第一章\",\"heading\":\"Heading1\"},{\"text\":\"这是正文内容\"}]")',
  },
  // ========== PDF 文件工具 ==========
  {
    name: "pdf_read",
    func: (sessionId, filePath) => readPdf(filePath, sessionId),
    description: "读取用户 workspace 中 PDF 文件的文本内容",
    params: [
      { name: "文件路径", type: "string", example: "docs/document.pdf" }
    ],
    example: 'pdf_read("docs/report.pdf")',
  },
  {
    name: "pdf_merge",
    func: (sessionId, files, output) => mergePdfs(files.split(","), output, sessionId),
    description: "合并用户 workspace 中的多个 PDF 文件",
    params: [
      { name: "源文件列表", type: "string", example: "doc1.pdf,doc2.pdf" },
      { name: "输出路径", type: "string", example: "merged.pdf" }
    ],
    example: 'pdf_merge("chapter1.pdf,chapter2.pdf", "full_report.pdf")',
  },
  {
    name: "pdf_write",
    func: (sessionId, filePath, content, options = "{}") => {
      const opts = typeof options === "string" ? JSON.parse(options || "{}") : (options || {});
      const contentFormat =
        opts.format === "plain" || opts.contentFormat === "plain" ? "plain" : "markdown";
      const { format: _f, contentFormat: _cf, ...rest } = opts;
      return writePdf(filePath, sessionId, [{ text: content }], {
        overwrite: true,
        contentFormat,
        ...rest,
      });
    },
    description: "将内容写入用户 workspace 的 PDF。默认按 Markdown 渲染（标题/列表/表格/代码块/加粗/链接等样式）；纯文本请传 {\"format\":\"plain\"} 或 {\"contentFormat\":\"plain\"}",
    params: [
      { name: "文件路径", type: "string", example: "output/result.pdf", description: "PDF文件输出路径" },
      { name: "内容", type: "string", example: "# 报告\\n\\n正文 **加粗**", description: "Markdown 或纯文本（由选项 format 控制）" },
      { name: "选项", type: "object", example: '{"title":"结果文档","fontSize":11}', description: "title 标题；fontSize 正文字号；format 为 plain 时关闭 Markdown 按纯文本写入；默认 Markdown 渲染", required: false }
    ],
    example: 'pdf_write("output/result.pdf", "# 标题\\n\\n段落", "{\"title\":\"我的报告\"}")',
  },
  // ========== CSV/JSON 工具 ==========
  {
    name: "csv_read",
    func: (sessionId, filePath) => readCsv(filePath, sessionId),
    description: "读取用户 workspace 中 CSV 文件，解析为结构化数据",
    params: [
      { name: "文件路径", type: "string", example: "data/export.csv" }
    ],
    example: 'csv_read("data/users.csv")',
  },
  {
    name: "csv_write",
    func: (sessionId, filePath, data) => {
      if (!filePath) throw new Error('缺少参数: 文件路径(filePath)不能为空');
      if (!data) throw new Error('缺少参数: 数据(data)不能为空，请提供JSON数组格式数据');
      try {
        const parsedData = JSON.parse(data);
        return writeCsv(filePath, sessionId, parsedData);
      } catch (e) {
        throw new Error(`数据格式错误: ${e.message}。请提供有效的JSON数组，例如: [{"name":"张三","age":25}]`);
      }
    },
    description: "将数据写入用户 workspace 中的 CSV 文件。参数: 1)文件路径 2)JSON数组数据(字符串格式)",
    params: [
      { name: "文件路径", type: "string", example: "output/data.csv", description: "CSV文件输出路径，如: output/data.csv" },
      { name: "数据", type: "string", example: '[{"name":"张三","age":25}]', description: "JSON数组格式的数据字符串，必须提供有效JSON" }
    ],
    example: 'csv_write("output/users.csv", "[{\"name\":\"张三\",\"age\":25}]")',
  },
  {
    name: "json_read",
    func: (sessionId, filePath) => readJson(filePath, sessionId),
    description: "读取用户 workspace 中 JSON 文件并解析",
    params: [
      { name: "文件路径", type: "string", example: "config/settings.json" }
    ],
    example: 'json_read("config/app.json")',
  },
  {
    name: "json_write",
    func: (sessionId, filePath, data) => {
      if (!filePath) throw new Error('缺少参数: 文件路径(filePath)不能为空');
      if (!data) throw new Error('缺少参数: 数据(data)不能为空，请提供JSON格式数据');
      try {
        const parsedData = JSON.parse(data);
        return writeJson(filePath, sessionId, parsedData);
      } catch (e) {
        throw new Error(`数据格式错误: ${e.message}。请提供有效的JSON对象或数组，例如: {"key":"value"}`);
      }
    },
    description: "将数据写入用户 workspace 中的 JSON 文件。参数: 1)文件路径 2)JSON格式数据(字符串)",
    params: [
      { name: "文件路径", type: "string", example: "output/data.json", description: "JSON文件输出路径" },
      { name: "数据", type: "string", example: '{"key":"value"}', description: "JSON格式的数据字符串" }
    ],
    example: 'json_write("output/config.json", "{\\"port\\":3000}")',
  },
  // ========== 图片工具 ==========
  {
    name: "image_compress",
    func: (sessionId, inputPath, outputPath, options = "{}") =>
      compressImage(sessionId, inputPath, outputPath || null, JSON.parse(options)),
    description: "压缩图片文件（支持 jpg/png/gif/webp/avif），可调整质量、尺寸、格式。GIF 默认保留动画帧",
    params: [
      { name: "输入路径", type: "string", example: "images/photo.jpg", description: "workspace 内的图片路径" },
      { name: "输出路径", type: "string", example: "images/photo_compressed.jpg", description: "输出路径（可选，默认覆盖原文件）", required: false },
      { name: "选项", type: "object", example: '{"quality":80,"width":1920}', description: "可选：quality(1-100,默认80)、width、height、format(jpg/png/webp/gif/avif)、fit(inside/cover/contain)、animated(保留gif动画,默认true)", required: false }
    ],
    example: 'image_compress("images/photo.jpg", "images/photo_small.jpg", "{\\"quality\\":75,\\"width\\":1280}")',
  },
  {
    name: "image_compress_batch",
    func: (sessionId, inputPaths, outputDir, options = "{}") =>
      compressImageBatch(sessionId, JSON.parse(inputPaths), outputDir || null, JSON.parse(options)),
    description: "批量压缩图片，将多张图片压缩到指定目录",
    params: [
      { name: "输入路径数组", type: "string", example: '["images/a.jpg","images/b.png"]', description: "图片路径数组（JSON字符串）" },
      { name: "输出目录", type: "string", example: "images/compressed", description: "输出目录（可选，默认覆盖原文件）", required: false },
      { name: "选项", type: "object", example: '{"quality":80}', description: "同 image_compress 选项", required: false }
    ],
    example: 'image_compress_batch("[\\"images/a.jpg\\",\\"images/b.jpg\\"]", "images/out", "{\\"quality\\":75}")',
  },
  {
    name: "image_info",
    func: (sessionId, filePath) => getImageInfo(filePath, sessionId),
    description: "获取用户 workspace 中图片文件信息",
    params: [
      { name: "文件路径", type: "string", example: "images/photo.jpg" }
    ],
    example: 'image_info("images/logo.png")',
  },
  {
    name: "svg_write",
    func: (sessionId, filePath, content) => writeSvg(filePath, sessionId, content),
    description: "在用户 workspace 中创建 SVG 矢量图形文件",
    params: [
      { name: "文件路径", type: "string", example: "images/chart.svg" },
      { name: "SVG内容", type: "string", example: '<circle cx="50" cy="50" r="40"/>' }
    ],
    example: 'svg_write("images/icon.svg", "<rect width=\"100\" height=\"100\"/>")',
  },
  // ========== 压缩/解压工具 ==========
  {
    name: "zip_compress",
    func: (sessionId, sourcePaths, outputPath, options = "{}") => compressFiles(sessionId, sourcePaths, outputPath, JSON.parse(options)),
    description: "将文件或目录压缩为 zip 文件",
    params: [
      { name: "源路径", type: "string|array", example: "docs/reports", description: "要压缩的文件或目录路径，支持单个或多个" },
      { name: "输出路径", type: "string", example: "backup.zip", description: "压缩包输出路径" },
      { name: "选项", type: "object", example: '{"overwrite":false,"compressionLevel":5}', description: "可选：overwrite是否覆盖, compressionLevel压缩级别(0-9)", required: false }
    ],
    example: 'zip_compress("documents", "docs.zip")',
  },
  {
    name: "zip_extract",
    func: (sessionId, zipPath, extractPath, options = "{}") => extractArchive(sessionId, zipPath, extractPath, JSON.parse(options)),
    description: "解压 zip 文件到指定目录",
    params: [
      { name: "压缩包路径", type: "string", example: "uploads/data.zip", description: "zip 文件路径" },
      { name: "解压目录", type: "string", example: "extracted_data", description: "解压目标目录（可选，默认使用压缩包名）", required: false },
      { name: "选项", type: "object", example: '{"overwrite":true}', description: "可选：overwrite是否覆盖现有文件", required: false }
    ],
    example: 'zip_extract("data.zip", "output")',
  },
  {
    name: "zip_info",
    func: (sessionId, zipPath) => getArchiveInfo(sessionId, zipPath),
    description: "获取压缩包的详细信息（大小、文件数量、压缩率等）",
    params: [
      { name: "压缩包路径", type: "string", example: "backup.zip", description: "zip 文件路径" }
    ],
    example: 'zip_info("backup.zip")',
  },
  {
    name: "zip_list",
    func: (sessionId, zipPath, maxFiles) => listArchiveContents(sessionId, zipPath, { maxFiles }),
    description: "列出压缩包内的文件列表（不解压）",
    params: [
      { name: "压缩包路径", type: "string", example: "archive.zip", description: "zip 文件路径" },
      { name: "最大条目数", type: "number", example: 200, description: "最多返回的文件数量", required: false }
    ],
    example: 'zip_list("archive.zip", 50)',
  },
  // ========== 邮件发送工具 ==========
  {
    name: "email_send",
    func: (sessionId, to, subject, content, options = "{}") => {
      const opts = JSON.parse(options);
      const attachments = Array.isArray(opts.attachments)
        ? opts.attachments.map((att) => {
            if (!att || !att.path || typeof att.path !== 'string') {
              return att;
            }

            const isRemotePath = /^https?:\/\//i.test(att.path);
            if (isRemotePath) {
              return att;
            }

            // 如果路径已包含 /workspace/{sessionId}/ 前缀，说明用户传的是完整 URL 路径，
            // 提取出相对部分，避免 resolveWorkspacePath 再加一层 sessionId 前缀
            const wsPrefix = `/workspace/${sessionId}/`;
            const cleanPath = att.path.startsWith(wsPrefix)
              ? att.path.slice(wsPrefix.length)
              : att.path;

            return {
              ...att,
              path: resolveWorkspacePath(cleanPath, sessionId)
            };
          })
        : opts.attachments;

      // 默认使用 HTML 格式发送邮件
      return sendEmail({
        sessionId,
        to,
        subject,
        text: undefined,
        html: content,
        from: opts.from,
        smtp: opts.smtp,
        attachments
      });
    },
    description: "发送邮件通知，支持纯文本/HTML格式，支持附件，可用于发送报告、文档等",
    params: [
      { name: "收件人", type: "string", example: "user@example.com", description: "收件人邮箱，多个用逗号分隔" },
      { name: "主题", type: "string", example: "任务完成通知" },
      { name: "内容", type: "string", example: "您的数据分析任务已完成，请查看结果。" },
      { name: "选项", type: "object", example: '{"html":false,"from":"系统通知","attachments":[{"filename":"result.pdf","path":"workspace/user123/output/result.pdf"}]}', description: "可选：html是否HTML格式, from发件人名称, smtp自定义SMTP配置, attachments附件数组(支持{{result}}占位符动态替换路径)", required: false }
    ],
    example: 'email_send("user@qq.com", "计算结果", "平均值计算完成", "{\"attachments\":[{\"filename\":\"result.pdf\",\"path\":\"output/result.pdf\"}]}")',
  },
  {
    name: "email_template",
    func: (sessionId, to, template, subject, variables = "{}") => sendTemplateEmail({
      to,
      template,
      subject,
      variables: JSON.parse(variables)
    }),
    description: "使用内置模板发送邮件，支持 notification/alert/report 模板",
    params: [
      { name: "收件人", type: "string", example: "user@example.com" },
      { name: "模板", type: "string", example: "notification", options: ["notification", "alert", "report"] },
      { name: "主题", type: "string", example: "每日报告" },
      { name: "变量", type: "object", example: '{"title":"数据统计","message":"今日新增100条记录"}', description: "模板变量替换对象", required: false }
    ],
    example: 'email_template("user@example.com", "notification", "欢迎邮件", "{\"title\":\"欢迎\",\"message\":\"感谢您的注册\"}")',
  },
  {
    name: "email_verify",
    func: () => verifySmtpConfig(),
    description: "验证 SMTP 配置是否有效，检查邮件服务连接状态",
    params: [],
    example: 'email_verify()',
  },
  // ========== 任务调度工具 ==========
  {
    name: "schedule_task",
    func: (sessionId, delayMinutes, taskType, params, description) => scheduleTask(sessionId, delayMinutes, taskType, JSON.parse(params || '{}'), description),
    description: "创建定时任务（延迟 N 分钟后执行一次指定工具）。用户ID由系统自动注入。多步骤场景请使用 Plan 模式编排多个定时任务",
    params: [
      { name: "延迟分钟数", type: "number", example: 2, description: "延迟多少分钟后执行任务" },
      { name: "任务类型", type: "string", example: "daily_news", options: ["daily_news", "email_send", "email_template", "exec_code", "script_generator", "pdf_write"], description: "要执行的任务类型，对应工具名" },
      { name: "任务参数", type: "object", example: '{"code":"console.log(1+2)","language":"javascript"}', description: "任务参数，直接传递到对应工具的各参数位置（如 email_send 需传入 to/subject/content/options）" },
      { name: "任务描述", type: "string", example: "2分钟后执行代码", description: "任务描述（可选）", required: false }
    ],
    example: 'schedule_task(2, "exec_code", \'{"code":"print(sum([1,2,3,4,5])/5)","language":"python"}\', "计算平均值")',
  },
  {
    name: "schedule_list",
    func: (sessionId, status) => getTasks(sessionId, status || 'pending'),
    description: "查询当前用户的定时任务列表（用户ID由系统自动注入）",
    params: [
      { name: "状态过滤", type: "string", example: "pending", options: ["pending", "completed", "failed", "cancelled", "all"], description: "按状态过滤任务", required: false }
    ],
    example: 'schedule_list("pending")',
  },
  {
    name: "schedule_cancel",
    func: (sessionId, taskId) => cancelTask(sessionId, taskId),
    description: "取消当前用户的待执行任务（只能操作自己的任务，用户ID由系统自动注入）",
    params: [
      { name: "任务ID", type: "string", example: "uuid-string", description: "要取消的任务ID" }
    ],
    example: 'schedule_cancel("task-uuid")',
  },
];

// 生成工具映射表
export const TOOLS = TOOL_DEFINITIONS.reduce((acc, tool) => {
  acc[tool.name] = tool.func;
  return acc;
}, {
  // 额外暴露的底层函数
  writeDocx: writeDocx
});

// 导出函数
export {
  searchKnowledgeBase,
  analyzeCode,
  analyzeChart,
  generateDocument,
  renderMermaid,
  getDailyNews,
  execCode,
  generatePythonScript,
  analyzeScriptResult,
  setScriptGeneratorLLM,
  checkScriptSafety,
  // 文件管理
  listDirectory, readFile, writeFile, deleteFile, createDirectory,
  moveFile, copyFile, getFileInfo, searchFiles, batchFileOperations, initWorkspace,
  // 文件格式处理
  readExcel, writeExcel, appendToExcel, readWord, writeWord,
  readWordAsHtml, readPdf, writePdf, mergePdfs, getImageInfo, writeSvg,
  readCsv, writeCsv, readJson, writeJson, writeDocx,
  // 压缩工具
  compressFiles, extractArchive, getArchiveInfo, listArchiveContents,
  // 图片处理
  compressImage, compressImageBatch,
  // 邮件工具
  sendEmail, sendTemplateEmail, verifySmtpConfig,
  // 调度工具
  scheduleTask, getTasks, cancelTask, getTaskById, cleanupTasks,
};
