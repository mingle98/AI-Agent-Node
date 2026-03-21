/**
 * 图片压缩工具测试
 * 覆盖 compressImage / compressImageBatch
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { compressImage, compressImageBatch } from '../tools/imageProcessor.js';

const TEST_SESSION = `img_compress_test_${Date.now()}`;
const WORKSPACE = path.resolve('public/workspace', TEST_SESSION);

async function createTestImage(filePath, width = 800, height = 600, format = 'jpeg') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } }
  })[format]({ quality: 95 }).toFile(filePath);
}

async function createTestGif(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
  }).gif().toFile(filePath);
}

test('setup: create test images', async () => {
  await createTestImage(path.join(WORKSPACE, 'images/photo.jpg'));
  await createTestImage(path.join(WORKSPACE, 'images/photo.png'), 400, 300, 'png');
  await createTestGif(path.join(WORKSPACE, 'images/anim.gif'));
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'images/photo.jpg')));
});

test('image_compress: jpg 质量压缩', async () => {
  const res = await compressImage(TEST_SESSION, 'images/photo.jpg', 'images/photo_q60.jpg', { quality: 60 });
  assert.equal(res.success, true, res.error);
  assert.equal(res.filePath, 'images/photo_q60.jpg', 'filePath 应匹配输出路径');
  assert.ok(typeof res.size === 'number', 'size 应为数字');
  assert.ok(res.size < res.inputSize, '压缩后应比原文件小');
  assert.ok(res.url, 'url 应存在');
  assert.equal(res.format, 'jpg');
});

test('image_compress: jpg 压缩并缩放', async () => {
  const res = await compressImage(TEST_SESSION, 'images/photo.jpg', 'images/photo_400.jpg', {
    quality: 75,
    width: 400,
  });
  assert.equal(res.success, true, res.error);
  assert.ok(res.size < res.inputSize, '压缩后应比原文件小');

  const meta = await sharp(path.join(WORKSPACE, 'images/photo_400.jpg')).metadata();
  assert.ok(meta.width <= 400, '宽度应不超过 400px');
});

test('image_compress: png 压缩', async () => {
  const res = await compressImage(TEST_SESSION, 'images/photo.png', 'images/photo_compressed.png', { quality: 70 });
  assert.equal(res.success, true, res.error);
  assert.equal(res.filePath, 'images/photo_compressed.png');
  assert.equal(res.format, 'png');
});

test('image_compress: gif 压缩', async () => {
  const res = await compressImage(TEST_SESSION, 'images/anim.gif', 'images/anim_compressed.gif', {});
  assert.equal(res.success, true, res.error);
  assert.equal(res.format, 'gif');
});

test('image_compress: jpg 转 webp', async () => {
  const res = await compressImage(TEST_SESSION, 'images/photo.jpg', 'images/photo.webp', {
    quality: 80,
    format: 'webp',
  });
  assert.equal(res.success, true, res.error);
  assert.equal(res.filePath, 'images/photo.webp');
  assert.equal(res.format, 'webp');
  assert.ok(fs.existsSync(path.join(WORKSPACE, 'images/photo.webp')));
});

test('image_compress: 默认覆盖原文件', async () => {
  await createTestImage(path.join(WORKSPACE, 'images/overwrite.jpg'));
  const before = fs.statSync(path.join(WORKSPACE, 'images/overwrite.jpg')).size;
  const res = await compressImage(TEST_SESSION, 'images/overwrite.jpg', null, { quality: 50 });
  assert.equal(res.success, true, res.error);
  assert.equal(res.filePath, 'images/overwrite.jpg', '覆盖时 filePath 应为原路径');
  const after = fs.statSync(path.join(WORKSPACE, 'images/overwrite.jpg')).size;
  assert.ok(after <= before, '覆盖后文件应不大于原文件');
});

test('image_compress: 路径越界应返回失败', async () => {
  const res = await compressImage(TEST_SESSION, '../../../etc/passwd', null, {});
  assert.equal(res.success, false);
});

test('image_compress: 文件不存在应返回失败', async () => {
  const res = await compressImage(TEST_SESSION, 'images/nonexistent.jpg', null, {});
  assert.equal(res.success, false);
  assert.ok(res.error.includes('不存在'));
});

test('image_compress: 不支持的格式应返回失败', async () => {
  fs.mkdirSync(path.join(WORKSPACE, 'images'), { recursive: true });
  fs.writeFileSync(path.join(WORKSPACE, 'images/doc.pdf'), 'fake');
  const res = await compressImage(TEST_SESSION, 'images/doc.pdf', null, {});
  assert.equal(res.success, false);
  assert.ok(res.error.includes('不支持'));
});

test('image_compress_batch: 批量压缩', async () => {
  const res = await compressImageBatch(
    TEST_SESSION,
    ['images/photo.jpg', 'images/photo.png'],
    'images/batch_out',
    { quality: 70 }
  );
  assert.equal(res.success, true, res.error);
  assert.equal(res.totalCount, 2);
  assert.equal(res.successCount, 2);
  assert.equal(res.failCount, 0);
  assert.ok(res.totalSaved >= 0);
  assert.ok(res.results.every(r => r.filePath), '每个结果应含 filePath');
  assert.ok(res.results.every(r => typeof r.size === 'number'), '每个结果应含 size');
});

test('cleanup', async () => {
  fs.rmSync(WORKSPACE, { recursive: true, force: true });
  assert.ok(!fs.existsSync(WORKSPACE));
});
