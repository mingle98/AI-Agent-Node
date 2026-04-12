import assert from "node:assert/strict";
import test from "node:test";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { searchFileContents } from "../tools/fileManager.js";

const TEST_SESSION = `file_content_search_test_${Date.now()}`;
const TEST_DIR = "tmp/content-search";

test("searchFileContents: should find text content with line, column and preview", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/a.txt`, "alpha\nTODO: fix login flow\nomega", { overwrite: true });
  await writeFile(TEST_SESSION, `${TEST_DIR}/b.md`, "# Notes\nThis file mentions apiKey in the content.", { overwrite: true });

  const result = await searchFileContents(TEST_SESSION, "TODO", TEST_DIR, { maxResults: 10, maxFileSize: 1024 * 1024 });

  assert.equal(result.success, true);
  assert.ok(result.count >= 1);
  assert.ok(result.results.some(item => item.path.endsWith("a.txt")));

  const match = result.results.find(item => item.path.endsWith("a.txt"));
  assert.ok(match);
  assert.equal(match.match.line, 2);
  assert.ok(match.match.column >= 1);
  assert.match(match.match.preview, /TODO: fix login flow/);

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("searchFileContents: should be case-insensitive and respect maxResults", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/one.txt`, "contains apiKey here", { overwrite: true });
  await writeFile(TEST_SESSION, `${TEST_DIR}/two.txt`, "apiKey appears again", { overwrite: true });

  const result = await searchFileContents(TEST_SESSION, "apikey", TEST_DIR, { maxResults: 1, maxFileSize: 1024 * 1024 });

  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(result.maxResults, 1);
  assert.ok(result.results[0].match.preview.toLowerCase().includes("apikey"));

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("searchFileContents: should default limits to conservative values", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  for (let i = 1; i <= 4; i++) {
    await writeFile(TEST_SESSION, `${TEST_DIR}/many-${i}.txt`, `contains default-limit keyword ${i}`, { overwrite: true });
  }

  const result = await searchFileContents(TEST_SESSION, "default-limit", TEST_DIR);

  assert.equal(result.success, true);
  assert.equal(result.maxResults, 3);
  assert.equal(result.maxFileSize, 256 * 1024);
  assert.equal(result.maxScannedFiles, 30);
  assert.equal(result.maxTotalBytes, 2 * 1024 * 1024);
  assert.equal(result.count, 3);

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("searchFileContents: should stop when scan budget is exhausted", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  for (let i = 1; i <= 35; i++) {
    await writeFile(TEST_SESSION, `${TEST_DIR}/budget-${i}.txt`, `no target here ${i}`, { overwrite: true });
  }

  const result = await searchFileContents(TEST_SESSION, "missing-keyword", TEST_DIR);

  assert.equal(result.success, true);
  assert.equal(result.scannedFiles, 30);
  assert.equal(result.stoppedByScanLimit, true);
  assert.equal(result.count, 0);

  await rm(workspaceRoot, { recursive: true, force: true });
});

test("searchFileContents: should skip unreadable files without failing the whole search", async () => {
  const workspaceRoot = resolve("public/workspace", TEST_SESSION);
  await rm(workspaceRoot, { recursive: true, force: true });

  const { writeFile } = await import("../tools/fileManager.js");
  await writeFile(TEST_SESSION, `${TEST_DIR}/good.txt`, "needle inside readable file", { overwrite: true });
  await writeFile(TEST_SESSION, `${TEST_DIR}/bad.txt`, "broken", { overwrite: true });
  await rm(resolve(workspaceRoot, TEST_DIR, "bad.txt"), { force: true });

  const result = await searchFileContents(TEST_SESSION, "needle", TEST_DIR, { maxResults: 5 });

  assert.equal(result.success, true);
  assert.ok(result.results.some(item => item.path.endsWith("good.txt")));

  await rm(workspaceRoot, { recursive: true, force: true });
});
