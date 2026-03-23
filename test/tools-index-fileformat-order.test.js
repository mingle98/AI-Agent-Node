import assert from 'node:assert/strict';
import test from 'node:test';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { TOOLS } from '../tools/index.js';

const TEST_SESSION = `order_test_${Date.now()}`;

test('tools/index file-format wrappers keep correct argument order', async () => {
  const jsonPath = 'tmp/order-check.json';
  const csvPath = 'tmp/order-check.csv';

  const writeJsonRes = await TOOLS.json_write(TEST_SESSION, jsonPath, JSON.stringify({ ok: true, v: 1 }));
  assert.equal(writeJsonRes.success, true);
  assert.equal(writeJsonRes.filePath, jsonPath);

  const readJsonRes = await TOOLS.json_read(TEST_SESSION, jsonPath);
  assert.equal(readJsonRes.success, true);
  assert.equal(readJsonRes.filePath, jsonPath);
  assert.equal(readJsonRes.data.ok, true);

  const writeCsvRes = await TOOLS.csv_write(
    TEST_SESSION,
    csvPath,
    JSON.stringify([{ name: 'a', score: 1 }, { name: 'b', score: 2 }])
  );
  assert.equal(writeCsvRes.success, true);
  assert.equal(writeCsvRes.filePath, csvPath);

  const readCsvRes = await TOOLS.csv_read(TEST_SESSION, csvPath);
  assert.equal(readCsvRes.success, true);
  assert.equal(readCsvRes.filePath, csvPath);
  assert.ok(Array.isArray(readCsvRes.data));
  assert.ok(readCsvRes.data.length >= 2);

  await TOOLS.file_delete(TEST_SESSION, 'tmp', true);
});

test('cleanup: 删除测试 session 根目录', async () => {
  await rm(resolve('public/workspace', TEST_SESSION), { recursive: true, force: true });
});
