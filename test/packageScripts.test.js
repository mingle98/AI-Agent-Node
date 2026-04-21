import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const packageJsonPath = new URL("../package.json", import.meta.url);

test("package.json: should include llm wiki npm scripts", async () => {
  const raw = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(raw);

  assert.ok(pkg.scripts);
  assert.equal(pkg.scripts["wiki:build"], "node scripts/buildLlmWiki.js");
  assert.equal(pkg.scripts["wiki:build:force"], "node scripts/buildLlmWiki.js --force");
  assert.equal(pkg.scripts["wiki:review"], "node scripts/reviewLlmWiki.js --list");
  assert.equal(pkg.scripts["wiki:review:apply"], "node scripts/reviewLlmWiki.js --apply");
  assert.equal(pkg.scripts["wiki:review:all"], "node scripts/reviewLlmWiki.js --apply --all");
  assert.equal(pkg.scripts["wiki:review:publish"], "node scripts/reviewLlmWiki.js --apply --all --write");
});
