import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";

import {
  buildLLMWiki,
  processLLMWikiLearning,
  listLearningCandidates,
  promoteLearningCandidates,
} from "../utils/llmWikiBuilder.js";

function createTempWikiPath(prefix = "llmwiki-test-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("processLLMWikiLearning: should apply answer length guard before candidate learning", async () => {
  const wikiPath = await createTempWikiPath();

  const result = await processLLMWikiLearning({
    wikiPath,
    embeddings: { mock: true },
    question: "什么是编排层？",
    answer: "编排层负责协调多个能力和步骤。",
    references: [],
    learningConfig: {
      writeEnabled: false,
      mode: "candidate",
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "answer-too-short");
});

test("processLLMWikiLearning: should append candidate when candidate mode enabled", async () => {
  const wikiPath = await createTempWikiPath();

  const result = await processLLMWikiLearning({
    wikiPath,
    embeddings: { mock: true },
    question: "什么是编排层？",
    answer: "编排层负责协调多个能力和步骤，并驱动整个任务执行流程，还负责上下文组织、状态推进与结果整合。",
    references: [{ title: "编排层", slug: "orchestration" }],
    learningConfig: {
      writeEnabled: false,
      mode: "candidate",
      extractor: {
        useHeuristicFirst: true,
        enableLLMExtractor: false,
      },
    },
  });

  assert.equal(result.status, "candidate");

  const rows = listLearningCandidates({ wikiPath, limit: 10 });
  assert.equal(rows.length, 1);
  assert.ok(rows[0].question.includes("编排层"));
});

test("processLLMWikiLearning: should skip duplicate fingerprint on repeated candidate learning", async () => {
  const wikiPath = await createTempWikiPath();
  const options = {
    wikiPath,
    embeddings: { mock: true },
    question: "什么是执行层？",
    answer: "执行层负责调用工具和落地具体动作，保证计划可以真正执行，并将执行结果稳定反馈给上层。",
    references: [{ title: "执行层", slug: "execution" }],
    learningConfig: {
      writeEnabled: false,
      mode: "candidate",
      extractor: {
        useHeuristicFirst: true,
        enableLLMExtractor: false,
      },
    },
  };

  const first = await processLLMWikiLearning(options);
  const second = await processLLMWikiLearning(options);

  assert.equal(first.status, "candidate");
  assert.equal(second.status, "skipped");
  assert.equal(second.reason, "duplicate-fingerprint");
});

test("processLLMWikiLearning: should respect write throttle state when limit reached", async () => {
  const wikiPath = await createTempWikiPath();
  const today = new Date().toISOString().slice(0, 10);

  await writeFile(
    path.join(wikiPath, "learning-state.json"),
    JSON.stringify({
      version: 1,
      events: [],
      fingerprints: [],
      writeStats: {
        date: today,
        count: 2,
        lastWriteAt: new Date(Date.now() - 60 * 1000).toISOString(),
      },
    }, null, 2),
    "utf-8"
  );

  const result = await processLLMWikiLearning({
    wikiPath,
    embeddings: { mock: true },
    question: "什么是路由层？",
    answer: "路由层决定应该调用哪类能力，是系统进行能力选择的重要一层，并负责让请求流向正确的执行路径。",
    references: [],
    learningConfig: {
      writeEnabled: false,
      mode: "candidate",
      maxWritesPerDay: 2,
      minSecondsBetweenWrites: 0,
      extractor: {
        useHeuristicFirst: true,
        enableLLMExtractor: false,
      },
    },
  });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /每日写入上限/);
});

test("processLLMWikiLearning: should write candidate file content", async () => {
  const wikiPath = await createTempWikiPath();

  await processLLMWikiLearning({
    wikiPath,
    embeddings: { mock: true },
    question: "什么是能力路由？",
    answer: "能力路由用于根据用户意图动态选择工具和技能，从而减少无关能力暴露，并提升整体执行准确率。",
    references: [{ title: "能力路由", slug: "capability-routing" }],
    learningConfig: {
      writeEnabled: false,
      mode: "candidate",
      extractor: {
        useHeuristicFirst: true,
        enableLLMExtractor: false,
      },
    },
  });

  const raw = await readFile(path.join(wikiPath, "learning-candidates.jsonl"), "utf-8");
  assert.ok(raw.includes("能力路由"));
  assert.ok(raw.includes("capability-routing"));
});

test.skip("promoteLearningCandidates: should refresh learningState during batch publish and skip duplicate fingerprints", async () => {
  const wikiPath = await createTempWikiPath();

  class MockEmbeddings {
    async embedQuery(text) {
      return [String(text || "").length || 1, 0.1, 0.2];
    }

    async embedDocuments(texts) {
      return texts.map((text) => [String(text || "").length || 1, 0.1, 0.2]);
    }
  }

  const mockLlm = {
    async invoke() {
      return {
        content: JSON.stringify({
          concepts: [
            {
              title: "能力路由",
              summary: "能力路由负责根据用户意图选择合适的工具和技能。",
              related: ["执行层"],
              keywords: ["路由", "能力选择"],
            },
          ],
        }),
      };
    },
  };

  await buildLLMWiki({
    knowledgeBasePath: path.join(process.cwd(), "knowledge_base"),
    wikiPath,
    llm: mockLlm,
    embeddings: new MockEmbeddings(),
    maxChunks: 1,
    maxConceptsPerChunk: 1,
  });

  const duplicateCandidate = {
    ts: new Date().toISOString(),
    question: "什么是能力路由？",
    answer: "能力路由负责根据用户意图动态选择工具和技能，从而减少无关能力暴露，并提升整体执行准确率与路径命中率。",
    references: [{ title: "能力路由", slug: "capability-routing" }],
    concept: {
      title: "能力路由",
      summary: "能力路由负责根据用户意图动态选择工具和技能。",
      related: ["能力路由"],
      keywords: ["能力路由", "路由"],
    },
    fingerprint: "fp-duplicate-batch",
  };

  await writeFile(
    path.join(wikiPath, "learning-candidates.jsonl"),
    `${JSON.stringify(duplicateCandidate)}\n${JSON.stringify(duplicateCandidate)}\n`,
    "utf-8"
  );

  await writeFile(
    path.join(wikiPath, "learning-state.json"),
    JSON.stringify({
      version: 1,
      events: [],
      fingerprints: [],
      writeStats: {
        date: "",
        count: 0,
        lastWriteAt: "",
      },
    }, null, 2),
    "utf-8"
  );

  const result = await promoteLearningCandidates({
    wikiPath,
    embeddings: new MockEmbeddings(),
    approveAll: true,
    dryRun: false,
    learningConfig: {
      minSecondsBetweenWrites: 0,
      extractor: {
        useHeuristicFirst: true,
        enableLLMExtractor: false,
      },
    },
  });

  assert.equal(result.selected, 2);
  assert.equal(result.written, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.results[1].status, "skipped");
  assert.equal(result.results[1].reason, "duplicate-fingerprint");
});
