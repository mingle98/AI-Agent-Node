import assert from "node:assert/strict";
import test from "node:test";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { readFileLines } from "../tools/fileManager.js";

const TEST_SESSION = `file_read_lines_test_${Date.now()}`;
const TEST_DIR = "tmp/file-read-lines";

test("readFileLines: should read inclusive line range with line numbers", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, "a\nb\nc\nd\ne", { overwrite: true });

  const result = await readFileLines(TEST_SESSION, `${TEST_DIR}/sample.txt`, 2, 4);

  assert.equal(result.success, true);
  assert.equal(result.actualStartLine, 2);
  assert.equal(result.actualEndLine, 4);
  assert.equal(result.lineCount, 3);
  assert.equal(result.content, "2|b\n3|c\n4|d");

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("readFileLines: should reject invalid ranges", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, "a\nb\nc", { overwrite: true });

  const result = await readFileLines(TEST_SESSION, `${TEST_DIR}/sample.txt`, 5, 2);

  assert.equal(result.success, false);
  assert.match(result.error, /起始行号不能大于结束行号/);

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("readFileLines: should reject out-of-range start line", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, "a\nb\nc", { overwrite: true });

  const result = await readFileLines(TEST_SESSION, `${TEST_DIR}/sample.txt`, 10, 12);

  assert.equal(result.success, false);
  assert.match(result.error, /起始行号超出文件总行数/);

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("readFileLines: should not include readFile truncation marker as content", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  const content = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join("\n");
  await writeFile(TEST_SESSION, `${TEST_DIR}/truncated.txt`, content, { overwrite: true });

  const result = await readFileLines(TEST_SESSION, `${TEST_DIR}/truncated.txt`, 1, 20, { maxSize: 12 });

  assert.equal(result.success, true);
  assert.equal(result.content.includes("[文件内容已截断"), false);

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("readFileLines: should cap single request to 200 lines", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  const content = Array.from({ length: 220 }, (_, i) => `line-${i + 1}`).join("\n");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, content, { overwrite: true });

  const result = await readFileLines(TEST_SESSION, `${TEST_DIR}/sample.txt`, 1, 220);

  assert.equal(result.success, false);
  assert.match(result.error, /最多读取 200 行/);

  await rm(workspaceRoot, { recursive: true, force: true });
});
