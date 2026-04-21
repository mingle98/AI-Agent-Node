#!/usr/bin/env node
// ========== LLM Wiki 候选审核与发布脚本 ==========

import path from "path";
import { fileURLToPath } from "url";
import { createEmbeddings } from "../llm.js";
import {
  listLearningCandidates,
  promoteLearningCandidates,
} from "../utils/llmWikiBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseCSV(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCLI() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const applyMode = args.includes("--apply");
  const approveAll = args.includes("--all");
  const write = args.includes("--write");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const indexesArg = args.find((arg) => arg.startsWith("--indexes="));
  const fingerprintsArg = args.find((arg) => arg.startsWith("--fingerprints="));

  const limit = limitArg ? Number(limitArg.split("=")[1]) : 50;
  const indexes = parseCSV(indexesArg ? indexesArg.split("=")[1] : "").map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
  const fingerprints = parseCSV(fingerprintsArg ? fingerprintsArg.split("=")[1] : "");

  return {
    listOnly,
    applyMode,
    approveAll,
    write,
    limit,
    indexes,
    fingerprints,
  };
}

function printCandidateList(rows) {
  console.log("\n📥 候选池列表");
  console.log("=".repeat(70));
  if (!rows.length) {
    console.log("（空）");
    return;
  }
  rows.forEach((row) => {
    console.log(`${row.index}. ${row.question}`);
    console.log(`   - ts: ${row.ts}`);
    console.log(`   - title: ${row.title || "(无)"}`);
    console.log(`   - refs: ${row.references}`);
    console.log(`   - fingerprint: ${row.fingerprint}`);
  });
}

async function main() {
  const cli = parseCLI();
  const projectRoot = path.join(__dirname, "..");
  const wikiPath = path.join(projectRoot, "llm_wiki");

  const candidates = listLearningCandidates({
    wikiPath,
    limit: cli.limit,
  });

  if (cli.listOnly || (!cli.applyMode && !cli.approveAll && cli.indexes.length === 0 && cli.fingerprints.length === 0)) {
    printCandidateList(candidates);
    console.log("\n💡 用法示例：");
    console.log("  node scripts/reviewLlmWiki.js --list");
    console.log("  node scripts/reviewLlmWiki.js --apply --indexes=1,3");
    console.log("  node scripts/reviewLlmWiki.js --apply --all --write");
    return;
  }

  const embeddings = createEmbeddings();
  const result = await promoteLearningCandidates({
    wikiPath,
    embeddings,
    approveAll: cli.approveAll,
    indexes: cli.indexes,
    fingerprints: cli.fingerprints,
    dryRun: !cli.write,
    learningConfig: {
      enabled: true,
      writeEnabled: true,
      mode: "direct",
      extractor: {
        useHeuristicFirst: true,
        enableLLMExtractor: false, // 审核发布走候选概念，不再额外调用 LLM
      },
    },
  });

  console.log("\n🧾 审核结果");
  console.log("=".repeat(70));
  console.log(`selected: ${result.selected}`);
  console.log(`written: ${result.written}`);
  console.log(`skipped: ${result.skipped}`);
  console.log(`remaining: ${result.remaining}`);
  console.log(`mode: ${result.dryRun ? "dry-run(预演)" : "write(正式写入)"}`);

  if (result.results.length) {
    console.log("\n明细：");
    result.results.slice(0, 20).forEach((item, idx) => {
      const brief = item.status === "written"
        ? `${item.status} | ${item.title} (${item.slug})`
        : `${item.status} | ${item.reason || item.conceptTitle || ""}`;
      console.log(`  ${idx + 1}. ${brief}`);
    });
    if (result.results.length > 20) {
      console.log(`  ... 其余 ${result.results.length - 20} 条省略`);
    }
  }

  if (result.dryRun) {
    console.log("\nℹ️ 当前是预演模式，未改动候选池与正式 Wiki。");
    console.log("   如确认发布，增加 --write 参数。");
  }
}

main().catch((error) => {
  console.error("\n❌ 审核脚本失败:", error.message);
  process.exit(1);
});