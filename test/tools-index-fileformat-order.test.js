import assert from 'node:assert/strict';
import test from 'node:test';

import { TOOLS } from '../tools/index.js';

test('tools/index file-format wrappers keep correct argument order', async () => {
  const sessionId = `order_test_${Date.now()}`;
  const jsonPath = 'tmp/order-check.json';
  const csvPath = 'tmp/order-check.csv';

  const writeJsonRes = await TOOLS.json_write(sessionId, jsonPath, JSON.stringify({ ok: true, v: 1 }));
  assert.equal(writeJsonRes.success, true);
  assert.equal(writeJsonRes.filePath, jsonPath);

  const readJsonRes = await TOOLS.json_read(sessionId, jsonPath);
  assert.equal(readJsonRes.success, true);
  assert.equal(readJsonRes.filePath, jsonPath);
  assert.equal(readJsonRes.data.ok, true);

  const writeCsvRes = await TOOLS.csv_write(
    sessionId,
    csvPath,
    JSON.stringify([{ name: 'a', score: 1 }, { name: 'b', score: 2 }])
  );
  assert.equal(writeCsvRes.success, true);
  assert.equal(writeCsvRes.filePath, csvPath);

  const readCsvRes = await TOOLS.csv_read(sessionId, csvPath);
  assert.equal(readCsvRes.success, true);
  assert.equal(readCsvRes.filePath, csvPath);
  assert.ok(Array.isArray(readCsvRes.data));
  assert.ok(readCsvRes.data.length >= 2);

  await TOOLS.file_delete(sessionId, 'tmp', true);
});
