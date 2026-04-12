import assert from "node:assert/strict";
import test from "node:test";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { replaceFileText } from "../tools/fileManager.js";

const TEST_SESSION = `file_replace_text_test_${Date.now()}`;
const TEST_DIR = "tmp/file-replace-text";

test("replaceFileText: should replace first match by default", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile, readFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, "TODO\nTODO\nDONE", { overwrite: true });

  const result = await replaceFileText(TEST_SESSION, `${TEST_DIR}/sample.txt`, "TODO", "DONE");
  const readResult = await readFile(TEST_SESSION, `${TEST_DIR}/sample.txt`);

  assert.equal(result.success, true);
  assert.equal(result.replacementCount, 1);
  assert.equal(readResult.content, "DONE\nTODO\nDONE");

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("replaceFileText: should replace all matches when maxReplacements is 0", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile, readFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, "TODO\nTODO\nDONE", { overwrite: true });

  const result = await replaceFileText(TEST_SESSION, `${TEST_DIR}/sample.txt`, "TODO", "DONE", { maxReplacements: 0 });
  const readResult = await readFile(TEST_SESSION, `${TEST_DIR}/sample.txt`);

  assert.equal(result.success, true);
  assert.equal(result.replacementCount, 2);
  assert.equal(readResult.content, "DONE\nDONE\nDONE");

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("replaceFileText: should reject empty oldText", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/sample.txt`, "abc", { overwrite: true });

  const result = await replaceFileText(TEST_SESSION, `${TEST_DIR}/sample.txt`, "", "x");

  assert.equal(result.success, false);
  assert.match(result.error, /oldText 必须是非空字符串/);

  await rm(workspaceRoot, { recursive: true, force: true });
});
