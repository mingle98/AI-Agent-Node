import assert from "node:assert/strict";
import test from "node:test";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { editFileLines } from "../tools/fileManager.js";

const TEST_SESSION = `file_edit_lines_test_${Date.now()}`;
const TEST_DIR = "tmp/file-edit-lines";

test("editFileLines: should replace inclusive line range", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile, readFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, "a\nb\nc\nd\ne", { overwrite: true });

  const result = await editFileLines(TEST_SESSION, `${TEST_DIR}/sample.txt`, 2, 4, "x\ny");
  const readResult = await readFile(TEST_SESSION, `${TEST_DIR}/sample.txt`);

  assert.equal(result.success, true);
  assert.equal(result.actualStartLine, 2);
  assert.equal(result.actualEndLine, 4);
  assert.equal(result.replacedLineCount, 3);
  assert.equal(result.insertedLineCount, 2);
  assert.equal(result.content, "2|x\n3|y");
  assert.equal(readResult.content, "a\nx\ny\ne");

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("editFileLines: should reject truncated edit source", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  const content = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join("\n");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, content, { overwrite: true });

  const result = await editFileLines(TEST_SESSION, `${TEST_DIR}/sample.txt`, 1, 2, "new-line", { maxSize: 12 });

  assert.equal(result.success, false);
  assert.match(result.error, /读取已截断/);

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("editFileLines: should reject binary files", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.pdf`, "fake-pdf-content", { overwrite: true });

  const result = await editFileLines(TEST_SESSION, `${TEST_DIR}/sample.pdf`, 1, 1, "new-content");

  assert.equal(result.success, false);
  assert.match(result.error, /不支持按行编辑/);

  await rm(workspaceRoot, { recursive: true, force: true });
});
