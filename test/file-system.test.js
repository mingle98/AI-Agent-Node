// ========== 文件操作系统综合测试 ==========

import {
  listDirectory, readFile, writeFile, deleteFile, createDirectory,
  moveFile, copyFile, getFileInfo, searchFiles, initWorkspace
} from '../tools/fileManager.js';
import {
  readExcel, writeExcel, readCsv, writeCsv, readJson, writeJson,
  writeSvg, getImageInfo, readPdf, mergePdfs
} from '../tools/fileFormatHandler.js';

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const TEST_DIR = 'test_auto_' + Date.now();
const TEST_SESSION = 'test_session_123';
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${message}`);
  } else {
    failedTests++;
    console.log(`  ❌ ${message}`);
  }
}

async function runTest(name, testFn) {
  console.log(`\n🧪 ${name}`);
  try {
    await testFn();
  } catch (error) {
    failedTests++;
    console.log(`  ❌ 测试失败: ${error.message}`);
  }
}

// ========== 基础文件操作测试 ==========

async function testInitWorkspace() {
  const result = await initWorkspace(TEST_SESSION);
  assert(result.success, 'Workspace 初始化成功');
  assert(result.path.includes('public/workspace'), '路径包含 public/workspace');
}

async function testCreateDirectory() {
  const result = await createDirectory(TEST_SESSION, `${TEST_DIR}/subdir1/nested`);
  assert(result.success, '嵌套目录创建成功');
  assert(result.fullUrl && result.fullUrl.includes('http'), '返回完整 URL');
  assert(result.message.includes('完整地址'), '消息包含完整地址提示');
  
  // 验证树形结构
  const listResult = await listDirectory(TEST_SESSION, TEST_DIR, { recursive: true });
  assert(listResult.success, '列出目录成功');
  assert(listResult.treeView && listResult.treeView.includes('└──'), '树形结构包含连接线');
  assert(listResult.treeView.includes('📁'), '树形结构包含文件夹图标');
}

async function testWriteFile() {
  // 测试普通文本
  const textResult = await writeFile(TEST_SESSION, `${TEST_DIR}/plain.txt`, 'Hello World');
  assert(textResult.success, '文本文件写入成功');
  assert(!textResult.isConverted, '普通文本不转换格式');
  assert(textResult.fullUrl && textResult.fullUrl.startsWith('http'), '返回完整 URL');
  
  // 测试 Markdown 自动转 HTML
  const mdContent = `# 标题

这是**加粗**的文字

- 列表项1
- 列表项2`;
  const mdResult = await writeFile(TEST_SESSION, `${TEST_DIR}/document.txt`, mdContent);
  assert(mdResult.success, 'Markdown 文件写入成功');
  assert(mdResult.isConverted === true, '检测到 Markdown 并自动转换');
  assert(mdResult.path.endsWith('.html'), '自动改为 .html 后缀');
  assert(mdResult.fullUrl && mdResult.fullUrl.endsWith('.html'), '完整 URL 指向 HTML');
  assert(mdResult.message.includes('自动转换为 HTML'), '消息提示格式转换');
}

async function testReadFile() {
  // 读取普通文本
  const result = await readFile(TEST_SESSION, `${TEST_DIR}/plain.txt`);
  assert(result.success, '读取文件成功');
  assert(result.content === 'Hello World', '内容正确');
  assert(result.fullUrl && result.fullUrl.startsWith('http'), '返回完整 URL');
  assert(result.formattedSize && result.formattedSize.includes('B'), '格式化文件大小');
}

async function testFileInfo() {
  const result = await getFileInfo(TEST_SESSION, `${TEST_DIR}/plain.txt`);
  assert(result.success, '获取文件信息成功');
  assert(result.fullUrl && result.fullUrl.startsWith('http'), '返回完整 URL');
  assert(result.type === 'txt', '文件类型识别正确');
  assert(result.isDirectory === false, '不是目录');
  assert(result.permissions && result.permissions.readable, '返回权限信息');
}

async function testMoveFile() {
  const result = await moveFile(TEST_SESSION,
    `${TEST_DIR}/plain.txt`,
    `${TEST_DIR}/subdir1/moved.txt`
  );
  assert(result.success, '移动文件成功');
  assert(result.fullUrl && result.fullUrl.includes('moved.txt'), '新路径完整 URL 正确');
  assert(result.sourcePath === `${TEST_DIR}/plain.txt`, '记录源路径');
}

async function testCopyFile() {
  const result = await copyFile(TEST_SESSION,
    `${TEST_DIR}/subdir1/moved.txt`,
    `${TEST_DIR}/copied.txt`
  );
  assert(result.success, '复制文件成功');
  assert(result.fullUrl && result.fullUrl.includes('copied.txt'), '复制后完整 URL 正确');
  
  // 验证原文件和新文件都存在
  const original = await readFile(TEST_SESSION, `${TEST_DIR}/subdir1/moved.txt`);
  const copy = await readFile(TEST_SESSION, `${TEST_DIR}/copied.txt`);
  assert(original.success && copy.success, '原文件和副本都存在');
}

async function testDeleteFile() {
  const result = await deleteFile(TEST_SESSION, `${TEST_DIR}/copied.txt`);
  assert(result.success, '删除文件成功');
  assert(result.type === 'file', '识别为文件类型');
  
  // 验证已删除
  const check = await readFile(TEST_SESSION, `${TEST_DIR}/copied.txt`);
  assert(!check.success, '确认文件已删除');
}

async function testListDirectory() {
  // 创建更多文件和目录以测试树形结构
  await writeFile(TEST_SESSION, `${TEST_DIR}/file1.txt`, 'content1');
  await writeFile(TEST_SESSION, `${TEST_DIR}/file2.txt`, 'content2');
  await createDirectory(TEST_SESSION, `${TEST_DIR}/folder1`);
  await writeFile(TEST_SESSION, `${TEST_DIR}/folder1/nested.txt`, 'nested content');
  
  const result = await listDirectory(TEST_SESSION, TEST_DIR, { recursive: true });
  assert(result.success, '列出目录成功');
  assert(result.items.length >= 4, '至少包含4个项目');
  assert(result.stats.total >= 4, '统计总数正确');
  assert(result.treeView && result.treeView.length > 0, '返回树形视图');
  assert(result.treeView.includes('📄'), '树形视图包含文件图标');
  assert(result.treeView.includes('📁'), '树形视图包含文件夹图标');
  assert(result.message.includes('```'), '消息包含代码块格式');
  assert(result.fullUrl && result.fullUrl.startsWith('http'), '返回完整 URL');
}

async function testSearchFiles() {
  const result = await searchFiles(TEST_SESSION, 'nested', TEST_DIR);
  assert(result.success, '搜索文件成功');
  assert(result.count >= 1, '找到至少1个匹配');
  assert(result.results[0].fullUrl && result.results[0].fullUrl.startsWith('http'), '搜索结果包含完整 URL');
}

// ========== 多种文件格式测试 ==========

async function testExcelOperations() {
  const data = [
    ['姓名', '年龄', '城市'],
    ['张三', 25, '北京'],
    ['李四', 30, '上海'],
    ['王五', 28, '深圳']
  ];
  
  // 创建 Excel
  const writeResult = await writeExcel(`${TEST_DIR}/data.xlsx`, TEST_SESSION, data, { sheetName: '用户数据' });
  assert(writeResult.success, 'Excel 创建成功');
  assert(writeResult.message.includes('完整地址'), '消息包含完整地址');
  assert(writeResult.fullUrl && writeResult.fullUrl.endsWith('.xlsx'), '完整 URL 指向 xlsx');
  
  // 读取 Excel
  const readResult = await readExcel(`${TEST_DIR}/data.xlsx`, TEST_SESSION);
  assert(readResult.success, 'Excel 读取成功');
  assert(readResult.sheets.length > 0, '至少有一个工作表');
  assert(readResult.data && readResult.data.length > 0, '有数据内容');
}

async function testCsvOperations() {
  const data = [
    { name: '产品A', price: 100, stock: 50 },
    { name: '产品B', price: 200, stock: 30 },
    { name: '产品C', price: 150, stock: 80 }
  ];
  
  // 创建 CSV
  const writeResult = await writeCsv(`${TEST_DIR}/products.csv`, TEST_SESSION, data);
  assert(writeResult.success, 'CSV 创建成功');
  assert(writeResult.message.includes('完整地址'), '消息包含完整地址');
  
  // 读取 CSV
  const readResult = await readCsv(`${TEST_DIR}/products.csv`, TEST_SESSION);
  assert(readResult.success, 'CSV 读取成功');
  assert(readResult.headers.length === 3, '有3列');
  assert(readResult.data.length === 3, '有3行数据');
}

async function testJsonOperations() {
  const data = {
    app: 'AI Agent',
    version: '1.0.0',
    features: ['文件管理', 'Excel处理', 'PDF合并'],
    settings: { theme: 'dark', lang: 'zh-CN' }
  };
  
  // 创建 JSON
  const writeResult = await writeJson(`${TEST_DIR}/config.json`, TEST_SESSION, data);
  assert(writeResult.success, 'JSON 创建成功');
  assert(writeResult.message.includes('完整地址'), '消息包含完整地址');
  
  // 读取 JSON
  const readResult = await readJson(`${TEST_DIR}/config.json`, TEST_SESSION);
  assert(readResult.success, 'JSON 读取成功');
  assert(readResult.data.app === 'AI Agent', '数据解析正确');
  assert(readResult.data.features.length === 3, '数组数据正确');
}

async function testSvgCreation() {
  const svgContent = `
    <circle cx="50" cy="50" r="40" fill="red"/>
    <rect x="20" y="20" width="60" height="60" fill="blue" opacity="0.5"/>
  `;
  
  const result = await writeSvg(`${TEST_DIR}/chart.svg`, TEST_SESSION, svgContent);
  assert(result.success, 'SVG 创建成功');
  assert(result.type === 'svg', '类型识别为 SVG');
  assert(result.fullUrl && result.fullUrl.endsWith('.svg'), '完整 URL 指向 SVG');
  assert(result.message.includes('完整地址'), '消息包含完整地址');
}

async function testImageInfo() {
  // 创建一个简单的 SVG 作为测试图片
  const svgContent = '<circle cx="50" cy="50" r="40" fill="green"/>';
  await writeSvg(`${TEST_DIR}/test_image.svg`, TEST_SESSION, svgContent);
  
  const result = await getImageInfo(`${TEST_DIR}/test_image.svg`, TEST_SESSION);
  assert(result.success, '获取图片信息成功');
  assert(result.type === 'svg', '类型识别为 SVG');
  assert(result.formattedSize && result.formattedSize.includes('B'), '有格式化大小');
}

async function testPdfMerge() {
  // 创建两个简单的 PDF
  const pdf1 = await import('./utils/pdfCreator.js').then(m => m.createSimplePdf(`${TEST_DIR}/doc1.pdf`));
  const pdf2 = await import('./utils/pdfCreator.js').then(m => m.createSimplePdf(`${TEST_DIR}/doc2.pdf`));
  
  // 合并 PDF
  const result = await mergePdfs([`${TEST_DIR}/doc1.pdf`, `${TEST_DIR}/doc2.pdf`], `${TEST_DIR}/merged.pdf`);
  assert(result.success, 'PDF 合并成功');
  assert(result.pageCount === 2, '合并后共2页');
  assert(result.message.includes('完整地址'), '消息包含完整地址');
}

// ========== 智能格式转换测试 ==========

async function testSmartMarkdownConversion() {
  // 测试 Markdown 特征检测（需要至少2个特征才识别为Markdown）
  const testCases = [
    { content: '# 标题\n\n**加粗**文字', shouldConvert: true, desc: '标题粗体' },
    { content: '**粗体** 和 *斜体*', shouldConvert: true, desc: '粗体斜体' },
    { content: '- 列表1\n- 列表2\n\n**粗体**', shouldConvert: true, desc: '列表粗体' },
    { content: '1. 第一项\n2. 第二项\n\n> 引用', shouldConvert: true, desc: '有序列表引用' },
    { content: '> 引用文字\n\n**加粗**', shouldConvert: true, desc: '引用加粗' },
    { content: '`code` 和 **加粗**', shouldConvert: true, desc: '代码加粗' },
    { content: '普通文本，没有Markdown格式', shouldConvert: false, desc: '普通文本' },
    { content: 'Hello World', shouldConvert: false, desc: '简单英文' }
  ];
  
  for (const testCase of testCases) {
    const result = await writeFile(TEST_SESSION, `${TEST_DIR}/smart_${testCase.desc}.txt`, testCase.content);
    if (testCase.shouldConvert) {
      assert(result.isConverted === true, `${testCase.desc} 被识别为 Markdown 并转换`);
      assert(result.path.endsWith('.html'), `${testCase.desc} 转为 HTML 文件`);
    } else {
      assert(!result.isConverted, `${testCase.desc} 不被转换`);
      assert(result.path.endsWith('.txt'), `${testCase.desc} 保持原格式`);
    }
  }
}

// ========== 清理测试 ==========

async function cleanup() {
  console.log('\n🧹 清理测试文件...');
  const result = await deleteFile(TEST_SESSION, TEST_DIR, { recursive: true });
  if (result.success) {
    console.log('  ✅ 测试目录已清理');
  } else {
    console.log('  ⚠️  清理失败:', result.error);
  }
  // 清理 session 根目录
  await rm(resolve('public/workspace', TEST_SESSION), { recursive: true, force: true });
}

// ========== 运行所有测试 ==========

async function runAllTests() {
  console.log('🚀 开始文件操作系统综合测试\n');
  console.log('=' .repeat(50));
  
  // 基础操作测试
  await runTest('初始化 Workspace', testInitWorkspace);
  await runTest('创建目录', testCreateDirectory);
  await runTest('写入文件（含智能转换）', testWriteFile);
  await runTest('读取文件', testReadFile);
  await runTest('获取文件信息', testFileInfo);
  await runTest('移动文件', testMoveFile);
  await runTest('复制文件', testCopyFile);
  await runTest('删除文件', testDeleteFile);
  await runTest('列出目录（含树形结构）', testListDirectory);
  await runTest('搜索文件', testSearchFiles);
  
  // 格式处理测试
  await runTest('Excel 操作', testExcelOperations);
  await runTest('CSV 操作', testCsvOperations);
  await runTest('JSON 操作', testJsonOperations);
  await runTest('SVG 创建', testSvgCreation);
  await runTest('图片信息', testImageInfo);
  // await runTest('PDF 合并', testPdfMerge); // 需要 pdfCreator 工具
  
  // 智能转换测试
  await runTest('智能 Markdown 转换', testSmartMarkdownConversion);
  
  // 清理
  await cleanup();
  
  // 测试报告
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试报告');
  console.log('='.repeat(50));
  console.log(`  ✅ 通过: ${passedTests}`);
  console.log(`  ❌ 失败: ${failedTests}`);
  console.log(`  📈 通过率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
  
  if (failedTests === 0) {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n⚠️  有测试未通过，请检查');
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('测试运行错误:', error);
  process.exit(1);
});
