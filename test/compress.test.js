import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  compressFiles,
  extractArchive,
  getArchiveInfo,
  listArchiveContents
} from '../tools/compress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试用的 session ID
const TEST_SESSION = 'test_compress_session';

// 构建测试 workspace 路径
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../public/workspace');
const TEST_WORKSPACE = path.join(WORKSPACE_ROOT, TEST_SESSION);

describe('compress.js 压缩工具测试', () => {
  // 测试前置：创建测试目录和文件
  before(() => {
    // 清理旧的测试目录
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true });
    }
    
    // 创建测试目录结构
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
    fs.mkdirSync(path.join(TEST_WORKSPACE, 'test_dir'), { recursive: true });
    fs.mkdirSync(path.join(TEST_WORKSPACE, 'test_dir', 'subdir'), { recursive: true });
    
    // 创建测试文件
    fs.writeFileSync(path.join(TEST_WORKSPACE, 'test_dir', 'file1.txt'), 'Hello World');
    fs.writeFileSync(path.join(TEST_WORKSPACE, 'test_dir', 'file2.txt'), 'Test content 2');
    fs.writeFileSync(path.join(TEST_WORKSPACE, 'test_dir', 'subdir', 'file3.txt'), 'Nested file content');
    fs.writeFileSync(path.join(TEST_WORKSPACE, 'single_file.txt'), 'Single file for testing');
  });

  // 测试后置：清理测试目录
  after(() => {
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true });
    }
  });

  describe('compressFiles - 压缩文件', () => {
    it('应该能压缩单个文件', async () => {
      const result = await compressFiles(
        TEST_SESSION,
        'single_file.txt',
        'single_file.zip',
        { overwrite: true }
      );
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.outputPath, 'single_file.zip');
      assert.ok(fs.existsSync(result.fullPath), '压缩文件应该存在');
      assert.ok(result.size > 0, '压缩文件应该有内容');
      assert.ok(result.url, '应该返回 url');
      assert.ok(result.fullUrl, '应该返回 fullUrl');
      assert.ok(result.fullUrl.includes(result.url), 'fullUrl 应该包含 url');
    });

    it('应该能压缩目录', async () => {
      const result = await compressFiles(
        TEST_SESSION,
        'test_dir',
        'test_dir.zip',
        { overwrite: true, compressionLevel: 6 }
      );
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.compressedCount, 1);
      assert.ok(fs.existsSync(result.fullPath), '压缩文件应该存在');
    });

    it('应该能压缩多个文件/目录', async () => {
      const result = await compressFiles(
        TEST_SESSION,
        ['single_file.txt', 'test_dir'],
        'multi_source.zip',
        { overwrite: true }
      );
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.compressedCount, 2);
    });

    it('不覆盖已存在的文件应该报错', async () => {
      // 先创建一个压缩文件
      await compressFiles(
        TEST_SESSION,
        'single_file.txt',
        'no_overwrite.zip',
        { overwrite: true }
      );
      
      // 再次尝试不覆盖
      const result = await compressFiles(
        TEST_SESSION,
        'single_file.txt',
        'no_overwrite.zip',
        { overwrite: false }
      );
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('已存在'));
    });

    it('压缩不存在的路径应该报错', async () => {
      const result = await compressFiles(
        TEST_SESSION,
        'nonexistent_path',
        'error.zip',
        { overwrite: true }
      );
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('不存在'));
    });
  });

  describe('extractArchive - 解压文件', () => {
    it('应该能解压压缩包', async () => {
      // 先确保有压缩文件
      await compressFiles(
        TEST_SESSION,
        'test_dir',
        'extract_test.zip',
        { overwrite: true }
      );
      
      const result = await extractArchive(
        TEST_SESSION,
        'extract_test.zip',
        'extracted_default',
        { overwrite: true }
      );
      
      assert.strictEqual(result.success, true);
      assert.ok(result.extractedCount > 0, '应该解压出文件');
      assert.ok(fs.existsSync(result.fullExtractPath), '解压目录应该存在');
    });

    it('应该能解压到指定目录', async () => {
      // 先确保有压缩文件
      await compressFiles(
        TEST_SESSION,
        'single_file.txt',
        'extract_to_path.zip',
        { overwrite: true }
      );
      
      const result = await extractArchive(
        TEST_SESSION,
        'extract_to_path.zip',
        'custom_extract_path',
        { overwrite: true }
      );
      
      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(path.join(TEST_WORKSPACE, 'custom_extract_path')), '自定义解压路径应该存在');
    });

    it('解压不存在的压缩包应该报错', async () => {
      const result = await extractArchive(
        TEST_SESSION,
        'nonexistent.zip',
        'output',
        { overwrite: true }
      );
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('不存在'));
    });
  });

  describe('getArchiveInfo - 获取压缩包信息', () => {
    it('应该返回压缩包详细信息', async () => {
      // 创建测试用的压缩包
      await compressFiles(
        TEST_SESSION,
        ['single_file.txt', 'test_dir'],
        'info_test.zip',
        { overwrite: true }
      );
      
      const result = await getArchiveInfo(TEST_SESSION, 'info_test.zip');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.size > 0, '应该有大小信息');
      assert.ok(result.sizeFormatted, '应该有格式化后的大小');
      assert.ok(typeof result.fileCount === 'number', '应该有文件数量');
      assert.ok(typeof result.directoryCount === 'number', '应该有目录数量');
      assert.ok(result.compressionRatio, '应该有压缩率');
      assert.ok(Array.isArray(result.files), '应该有文件列表');
      assert.ok(result.url, '应该返回 url');
      assert.ok(result.fullUrl, '应该返回 fullUrl');
    });

    it('获取不存在的压缩包信息应该报错', async () => {
      const result = await getArchiveInfo(TEST_SESSION, 'nonexistent.zip');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('不存在'));
    });
  });

  describe('listArchiveContents - 列出压缩包内容', () => {
    it('应该列出压缩包内文件', async () => {
      // 创建测试用的压缩包
      await compressFiles(
        TEST_SESSION,
        'test_dir',
        'list_test.zip',
        { overwrite: true }
      );
      
      const result = await listArchiveContents(TEST_SESSION, 'list_test.zip', { maxFiles: 100 });
      
      assert.strictEqual(result.success, true);
      assert.ok(Array.isArray(result.files), '应该返回文件列表');
      assert.ok(typeof result.fileCount === 'number', '应该有文件计数');
      assert.ok(typeof result.directoryCount === 'number', '应该有目录计数');
      
      // 验证文件列表项结构
      if (result.files.length > 0) {
        const firstFile = result.files[0];
        assert.ok(firstFile.name, '文件项应该有名称');
        assert.ok(firstFile.type, '文件项应该有类型');
      }
    });

    it('应该限制返回的文件数量', async () => {
      const result = await listArchiveContents(
        TEST_SESSION,
        'list_test.zip',
        { maxFiles: 2 }
      );
      
      assert.strictEqual(result.success, true);
      assert.ok(result.files.length <= 2, '返回的文件数不应该超过限制');
    });

    it('列出不存在的压缩包内容应该报错', async () => {
      const result = await listArchiveContents(TEST_SESSION, 'nonexistent.zip');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('不存在'));
    });
  });

  describe('完整工作流测试', () => {
    it('压缩 -> 列出内容 -> 获取信息 -> 解压 完整流程', async () => {
      const sourcePath = 'test_dir';
      const zipPath = 'workflow_test.zip';
      const extractPath = 'workflow_extracted';
      
      // 1. 压缩
      const compressResult = await compressFiles(
        TEST_SESSION,
        sourcePath,
        zipPath,
        { overwrite: true }
      );
      assert.strictEqual(compressResult.success, true);
      
      // 2. 列出内容
      const listResult = await listArchiveContents(TEST_SESSION, zipPath);
      assert.strictEqual(listResult.success, true);
      
      // 3. 获取信息
      const infoResult = await getArchiveInfo(TEST_SESSION, zipPath);
      assert.strictEqual(infoResult.success, true);
      assert.ok(infoResult.fileCount > 0 || infoResult.directoryCount > 0);
      
      // 4. 解压
      const extractResult = await extractArchive(
        TEST_SESSION,
        zipPath,
        extractPath,
        { overwrite: true }
      );
      assert.strictEqual(extractResult.success, true);
      assert.ok(extractResult.extractedCount > 0);
      
      // 验证解压后的内容
      assert.ok(fs.existsSync(path.join(TEST_WORKSPACE, extractPath)));
    });
  });
});
