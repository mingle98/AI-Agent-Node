import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'fs/promises';
import path from 'path';

import {
  initWorkspace,
  initUserWorkspace,
  saveRichText,
  batchFileOperations,
  readFile
} from '../tools/fileManager.js';
import { writeJson } from '../tools/fileFormatHandler.js';

const TEST_SESSION = 'edge_session_coverage';
const WORKSPACE_ROOT = path.resolve('public/workspace');
const SESSION_ROOT = path.resolve(WORKSPACE_ROOT, TEST_SESSION);
const ROOT_GITIGNORE = path.join(WORKSPACE_ROOT, '.gitignore');

test('fileFormatHandler.writeJson: should fail without sessionId', async () => {
  const result = await writeJson('a.json', '', { ok: 1 });
  assert.equal(result.success, false);
  assert.match(result.error, /sessionId/);
});

test('fileFormatHandler.writeJson: should respect overwrite=false when file exists', async () => {
  await fs.rm(SESSION_ROOT, { recursive: true, force: true });

  const first = await writeJson('dup.json', TEST_SESSION, { a: 1 }, { overwrite: true });
  assert.equal(first.success, true);

  const second = await writeJson('dup.json', TEST_SESSION, { a: 2 }, { overwrite: false });
  assert.equal(second.success, false);
  assert.match(second.error, /文件已存在/);

  await fs.rm(SESSION_ROOT, { recursive: true, force: true });
});

test('fileManager.saveRichText: should fail without sessionId', async () => {
  const result = await saveRichText('', 'a.md', '# title');
  assert.equal(result.success, false);
  assert.match(result.error, /sessionId/);
});

test('fileManager.batchFileOperations: should handle unknown operation type', async () => {
  const result = await batchFileOperations(TEST_SESSION, [
    { type: 'unknown_op', foo: 'bar' }
  ]);

  assert.equal(result.success, false);
  assert.equal(result.total, 1);
  assert.equal(result.failCount, 1);
  assert.match(result.results[0].result.error, /未知操作类型/);
});

test('fileManager.initWorkspace: should create root .gitignore when missing', async () => {
  let backup = null;
  try {
    backup = await fs.readFile(ROOT_GITIGNORE, 'utf-8');
  } catch {
    backup = null;
  }

  await fs.rm(ROOT_GITIGNORE, { force: true });
  const result = await initWorkspace();
  assert.equal(result.success, true);

  const recreated = await fs.readFile(ROOT_GITIGNORE, 'utf-8');
  assert.match(recreated, /# Workspace files/);

  if (backup !== null && backup !== recreated) {
    await fs.writeFile(ROOT_GITIGNORE, backup, 'utf-8');
  }
});

test('fileManager.initWorkspace: should return failure when mkdir throws', async () => {
  const originalMkdir = fs.mkdir;
  fs.mkdir = async () => {
    throw new Error('mock-mkdir-error');
  };

  try {
    const result = await initWorkspace();
    assert.equal(result.success, false);
    assert.match(result.error, /mock-mkdir-error/);
  } finally {
    fs.mkdir = originalMkdir;
  }
});

test('fileManager.initUserWorkspace: should fail when sessionId is missing', async () => {
  const result = await initUserWorkspace('');
  assert.equal(result.success, false);
  assert.match(result.error, /sessionId/);
});

test('fileManager.saveRichText: should create html from markdown path and read as binary metadata', async () => {
  await fs.rm(SESSION_ROOT, { recursive: true, force: true });

  const created = await saveRichText(TEST_SESSION, 'notes/readme.md', '# Title\n\n**Bold**', {
    theme: 'dark',
    overwrite: false
  });

  assert.equal(created.success, true);
  assert.equal(created.path, 'notes/readme.html');
  assert.equal(created.type, 'html');
  assert.equal(created.theme, 'dark');

  const readBack = await readFile(TEST_SESSION, 'notes/readme.html');
  assert.equal(readBack.success, true);
  assert.equal(readBack.isBinary, false);
  assert.match(readBack.content, /<html/i);

  await fs.rm(SESSION_ROOT, { recursive: true, force: true });
});

test('fileManager.saveRichText: should fail when file exists and overwrite=false', async () => {
  await fs.rm(SESSION_ROOT, { recursive: true, force: true });

  const first = await saveRichText(TEST_SESSION, 'dup-page', '# First', { overwrite: false });
  assert.equal(first.success, true);
  assert.equal(first.path, 'dup-page.html');

  const second = await saveRichText(TEST_SESSION, 'dup-page', '# Second', { overwrite: false });
  assert.equal(second.success, false);
  assert.match(second.error, /文件已存在/);

  await fs.rm(SESSION_ROOT, { recursive: true, force: true });
});

test('fileManager.batchFileOperations: should execute mixed operations and count success/fail', async () => {
  await fs.rm(SESSION_ROOT, { recursive: true, force: true });

  const result = await batchFileOperations(TEST_SESSION, [
    { type: 'write', path: 'batch/a.txt', content: 'A', options: { overwrite: true, autoFormat: false } },
    { type: 'mkdir', path: 'batch/dir' },
    { type: 'copy', source: 'batch/a.txt', target: 'batch/bad*name.txt' }
  ]);

  assert.equal(result.total, 3);
  assert.equal(result.successCount, 2);
  assert.equal(result.failCount, 1);
  assert.equal(result.success, false);
  assert.equal(result.results[0].result.success, true);
  assert.equal(result.results[1].result.success, true);
  assert.equal(result.results[2].result.success, false);

  await fs.rm(SESSION_ROOT, { recursive: true, force: true });
});

test('fileManager.batchFileOperations: should cover move operation success path', async () => {
  await fs.rm(SESSION_ROOT, { recursive: true, force: true });

  const result = await batchFileOperations(TEST_SESSION, [
    { type: 'write', path: 'mv/src.txt', content: 'hello', options: { overwrite: true, autoFormat: false } },
    { type: 'move', source: 'mv/src.txt', target: 'mv/dst.txt' }
  ]);

  assert.equal(result.success, true);
  assert.equal(result.successCount, 2);
  assert.equal(result.failCount, 0);
  assert.equal(result.results[1].result.success, true);
  assert.equal(result.results[1].result.operation, 'moved');

  await fs.rm(SESSION_ROOT, { recursive: true, force: true });
});

test('fileManager.saveRichText: should reject illegal filename', async () => {
  const result = await saveRichText(TEST_SESSION, '.hidden.md', '# hidden');
  assert.equal(result.success, false);
  assert.match(result.error, /非法文件名/);
});
