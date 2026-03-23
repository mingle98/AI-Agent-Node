// ========== 多用户隔离功能测试 ==========

import {
  listDirectory, readFile, writeFile, deleteFile, createDirectory,
  moveFile, copyFile, getFileInfo, searchFiles, initUserWorkspace
} from '../tools/fileManager.js';
import {
  readExcel, writeExcel, readCsv, writeCsv, readJson, writeJson,
  writeSvg, getImageInfo, readPdf, mergePdfs
} from '../tools/fileFormatHandler.js';

// 模拟两个不同的用户
const USER_A = 'user-a-123';
const USER_B = 'user-b-456';

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

let passed = 0;
let failed = 0;

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function test(name, fn) {
  try {
    await fn();
    log(`✅ ${name}`, colors.green);
    passed++;
  } catch (error) {
    log(`❌ ${name}: ${error.message}`, colors.red);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// ========== 测试用例 ==========

async function runTests() {
  log('\n🧪 多用户文件隔离功能测试\n', colors.blue);
  log('=' .repeat(50));

  // 1. 测试用户目录初始化
  await test('用户A目录初始化', async () => {
    const result = await initUserWorkspace(USER_A);
    assert(result.success === true, '初始化失败');
    assert(result.sessionId === USER_A, 'sessionId不匹配');
    assert(result.url && result.url.includes(USER_A), 'URL不包含用户ID');
  });

  await test('用户B目录初始化', async () => {
    const result = await initUserWorkspace(USER_B);
    assert(result.success === true, '初始化失败');
    assert(result.sessionId === USER_B, 'sessionId不匹配');
  });

  // 2. 测试用户A写入文件
  await test('用户A写入文件', async () => {
    const result = await writeFile(USER_A, 'test.txt', 'Hello from User A', { overwrite: true });
    assert(result.success === true, '写入失败');
    assert(result.path === 'test.txt', '路径不匹配');
    assert(result.url && result.url.includes(USER_A), 'URL不包含用户A ID');
  });

  // 3. 测试用户B无法读取用户A的文件
  await test('用户B无法读取用户A的文件（隔离验证）', async () => {
    const result = await readFile(USER_B, 'test.txt');
    assert(result.success === false, '应该读取失败');
    assert(result.error && result.error.includes('不存在'), '错误信息不正确');
  });

  // 4. 测试用户B写入同名文件（互不影响）
  await test('用户B写入同名文件', async () => {
    const result = await writeFile(USER_B, 'test.txt', 'Hello from User B', { overwrite: true });
    assert(result.success === true, '写入失败');
    assert(result.url && result.url.includes(USER_B), 'URL不包含用户B ID');
  });

  // 5. 测试用户A读取自己的文件（内容未被用户B覆盖）
  await test('用户A读取自己的文件（隔离验证）', async () => {
    const result = await readFile(USER_A, 'test.txt');
    assert(result.success === true, '读取失败');
    assert(result.content === 'Hello from User A', '内容被污染');
  });

  // 6. 测试用户B读取自己的文件
  await test('用户B读取自己的文件', async () => {
    const result = await readFile(USER_B, 'test.txt');
    assert(result.success === true, '读取失败');
    assert(result.content === 'Hello from User B', '内容不正确');
  });

  // 7. 测试目录列表隔离
  await test('用户A创建目录', async () => {
    const result = await createDirectory(USER_A, 'projects');
    assert(result.success === true, '创建失败');
  });

  await test('用户B看不到用户A的目录', async () => {
    const result = await listDirectory(USER_B, '');
    assert(result.success === true, '列出失败');
    // 用户B的目录是空的，应该不包含projects
    const hasProjects = result.items && result.items.some(item => item.name === 'projects');
    assert(!hasProjects, '不应该看到用户A的目录');
  });

  // 8. 测试非法sessionId格式
  await test('非法sessionId格式被拒绝', async () => {
    const result = await writeFile('../../etc/passwd', 'test.txt', 'malicious');
    // 应该返回错误对象而不是抛出异常
    assert(result.success === false, '应该返回失败');
    assert(result.error && (result.error.includes('非法') || result.error.includes('格式') || result.error.includes('sessionId')), 
           '错误信息不正确: ' + result.error);
  });

  // 9. 测试路径遍历防护
  await test('路径遍历攻击被阻止', async () => {
    const result = await readFile(USER_A, '../other-user/file.txt');
    assert(result.success === false, '应该读取失败');
    // 错误信息可能是"路径越界"或"sessionId"相关
    const hasValidError = result.error && (
      result.error.includes('越界') || 
      result.error.includes('sessionId') ||
      result.error.includes('不存在')
    );
    assert(hasValidError, '错误信息不正确: ' + result.error);
  });

  // 10. 测试Excel文件隔离
  await test('用户A创建Excel文件', async () => {
    const data = [['Name', 'Age'], ['Alice', 25]];
    const result = await writeExcel('data.xlsx', USER_A, data);
    assert(result.success === true, '创建失败');
  });

  await test('用户B无法读取用户A的Excel', async () => {
    const result = await readExcel('data.xlsx', USER_B);
    assert(result.success === false, '应该读取失败');
  });

  // 11. 测试JSON文件隔离
  await test('用户A创建JSON文件', async () => {
    const result = await writeJson('config.json', USER_A, { key: 'value' });
    assert(result.success === true, '创建失败');
  });

  await test('用户B读取用户A的JSON失败', async () => {
    const result = await readJson('config.json', USER_B);
    assert(result.success === false, '应该读取失败');
  });

  // 12. 测试文件移动隔离
  await test('用户A移动文件', async () => {
    const result = await moveFile(USER_A, 'test.txt', 'moved.txt');
    assert(result.success === true, '移动失败');
  });

  await test('用户B无法访问移动后的文件', async () => {
    const result = await readFile(USER_B, 'moved.txt');
    assert(result.success === false, '应该读取失败');
  });

  // 13. 测试文件搜索隔离
  await test('用户A搜索自己的文件', async () => {
    const result = await searchFiles(USER_A, 'moved');
    assert(result.success === true, '搜索失败');
    assert(result.results.length > 0, '应该找到文件');
  });

  await test('用户B搜索用户A的文件无结果', async () => {
    const result = await searchFiles(USER_B, 'moved');
    assert(result.success === true, '搜索失败');
    assert(result.results.length === 0, '不应该找到用户A的文件');
  });

  // 14. 测试空sessionId被拒绝
  await test('空sessionId被拒绝', async () => {
    const result = await writeFile('', 'test.txt', 'content');
    assert(result.success === false, '应该失败');
  });

  // 15. 清理测试数据
  await test('清理用户A测试数据', async () => {
    await deleteFile(USER_A, 'moved.txt');
    await deleteFile(USER_A, 'data.xlsx');
    await deleteFile(USER_A, 'config.json');
    await deleteFile(USER_A, 'projects', { recursive: true });
  });

  await test('清理用户B测试数据', async () => {
    await deleteFile(USER_B, 'test.txt');
  });

  // 16. 清理用户 session 根目录
  await test('清理用户 session 根目录', async () => {
    await rm(resolve('public/workspace', USER_A), { recursive: true, force: true });
    await rm(resolve('public/workspace', USER_B), { recursive: true, force: true });
  });

  // 输出测试结果
  log('\n' + '='.repeat(50));
  log(`\n📊 测试结果：`, colors.blue);
  log(`   通过: ${passed}`, colors.green);
  log(`   失败: ${failed}`, failed > 0 ? colors.red : colors.green);
  log(`   总计: ${passed + failed}`);
  log(`   通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    log('\n🎉 所有测试通过！用户隔离功能工作正常', colors.green);
  } else {
    log('\n⚠️ 部分测试失败，请检查实现', colors.yellow);
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('测试运行失败:', error);
  process.exit(1);
});
