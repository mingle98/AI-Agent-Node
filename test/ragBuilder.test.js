import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { LocalVectorStore, checkVectorDBExists, buildRAGKnowledgeBase, loadOrBuildVectorStore } from "../utils/ragBuilder.js";
import { searchKnowledgeBase } from "../tools/knowledge.js";

function createMockEmbeddings() {
  return {
    async embedDocuments(texts) {
      return texts.map((text) => this._vectorize(text));
    },
    async embedQuery(text) {
      return this._vectorize(text);
    },
    _vectorize(text) {
      const normalized = String(text || "").toLowerCase();
      return [
        normalized.includes("警") ? 3 : 0,
        normalized.includes("察") ? 3 : 0,
        normalized.includes("公安") ? 2 : 0,
        normalized.includes("民警") ? 2 : 0,
        normalized.includes("执法") ? 1 : 0,
        normalized.length / 100,
      ];
    },
  };
}

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("checkVectorDBExists: should return false for non-existent path", () => {
  const result = checkVectorDBExists("/non/existent/path");
  assert.equal(result, false);
});

test("checkVectorDBExists: should return false when only directory exists", () => {
  const result = checkVectorDBExists("/tmp");
  assert.equal(result, false);
});

test("buildRAGKnowledgeBase: should throw error for non-existent directory", async () => {
  await assert.rejects(
    buildRAGKnowledgeBase({
      knowledgeBasePath: "/non/existent/path",
      vectorDbPath: "/tmp/test-vectordb",
      embeddings: null,
    }),
    /知识库目录不存在/
  );
});

test("buildRAGKnowledgeBase: should throw error for empty directory", async () => {
  const tmpDir = createTempDir("test-empty-");

  try {
    await assert.rejects(
      buildRAGKnowledgeBase({
        knowledgeBasePath: tmpDir,
        vectorDbPath: "/tmp/test-vectordb",
        embeddings: null,
      }),
      /知识库目录为空/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("LocalVectorStore: should improve Chinese lexical recall and keep retriever compatibility", async () => {
  const embeddings = createMockEmbeddings();
  const documents = [
    {
      pageContent: "警方与警察联合巡逻，现场由民警负责处置。",
      metadata: { source: "/kb/police-procedure.md", title: "警务处置规范" },
    },
    {
      pageContent: "消防演练安排在周五下午进行。",
      metadata: { source: "/kb/fire-drill.md", title: "消防演练" },
    },
    {
      pageContent: "公安机关依法开展案件调查和取证。",
      metadata: { source: "/kb/public-security.md", title: "公安办案流程" },
    },
  ];

  const vectorStore = await LocalVectorStore.fromDocuments(documents, embeddings);
  const docs = await vectorStore.similaritySearch("警察", 2);

  assert.equal(docs.length, 2);
  assert.match(docs[0].pageContent, /警察|民警|警方/);
  assert.ok(docs[0].metadata._score > 0);
  assert.ok(docs[0].metadata._debug.lexicalScore > 0);

  const retriever = vectorStore.asRetriever({ k: 1, candidateMultiplier: 6 });
  const retrieverDocs = await retriever.invoke("警察");
  assert.equal(retrieverDocs.length, 1);
  assert.equal(retrieverDocs[0].pageContent, docs[0].pageContent);
});

test("LocalVectorStore: should use metadata scoring when body text is weak", async () => {
  const embeddings = createMockEmbeddings();
  const documents = [
    {
      pageContent: "处置流程详见附件说明。",
      metadata: { source: "/kb/guide.md", title: "警察现场处置手册" },
    },
    {
      pageContent: "园区访客登记流程。",
      metadata: { source: "/kb/visitor.md", title: "访客登记" },
    },
  ];

  const vectorStore = await LocalVectorStore.fromDocuments(documents, embeddings);
  const docs = await vectorStore.similaritySearch("警察", 1);

  assert.equal(docs.length, 1);
  assert.equal(docs[0].metadata.title, "警察现场处置手册");
  assert.ok(docs[0].metadata._debug.metadataScore > 0);
});

test("LocalVectorStore: should keep vector-only candidates through hybrid recall", async () => {
  const embeddings = {
    async embedDocuments(texts) {
      return texts.map((text) => this._vectorize(text));
    },
    async embedQuery(text) {
      return this._vectorize(text);
    },
    _vectorize(text) {
      const normalized = String(text || "").toLowerCase();
      if (normalized.includes("开启流式请求")) return [1, 0, 0];
      if (normalized.includes("enable-streaming")) return [1, 0, 0];
      if (normalized.includes("访客登记")) return [0, 1, 0];
      return [0, 0, 1];
    },
  };

  const vectorStore = await LocalVectorStore.fromDocuments(
    [
      {
        pageContent: "组件通过 :enable-streaming=\"true\" 开启 SSE 流式响应。",
        metadata: { source: "/kb/streaming.md", title: "流式响应模式" },
      },
      {
        pageContent: "访客登记需要核对手机号和身份证。",
        metadata: { source: "/kb/visitor.md", title: "访客登记" },
      },
    ],
    embeddings
  );

  const docs = await vectorStore.similaritySearch("开启流式请求", 1, {
    lexicalCandidateCount: 1,
    vectorCandidateCount: 1,
  });

  assert.equal(docs.length, 1);
  assert.match(docs[0].pageContent, /enable-streaming/);
  assert.ok(docs[0].metadata._debug.recallSources.includes("vector"));
});

test("LocalVectorStore: should persist and reload without breaking search behavior", async () => {
  const tmpDir = createTempDir("test-vectordb-");
  const embeddings = createMockEmbeddings();

  try {
    const vectorStore = await LocalVectorStore.fromDocuments(
      [
        {
          pageContent: "民警到场后立即控制现场并联系当事人。",
          metadata: { source: "/kb/case.md", title: "民警到场流程" },
        },
      ],
      embeddings
    );

    await vectorStore.save(tmpDir);
    assert.equal(checkVectorDBExists(tmpDir), true);

    const reloaded = await loadOrBuildVectorStore({
      vectorDbPath: tmpDir,
      embeddings,
      knowledgeBasePath: "/non/existent-but-unused",
      forceRebuild: false,
    });

    assert.ok(reloaded instanceof LocalVectorStore);
    const docs = await reloaded.similaritySearch("警察", 1);
    assert.equal(docs.length, 1);
    assert.match(docs[0].pageContent, /民警/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("searchKnowledgeBase: should work with updated similaritySearch metadata output", async () => {
  const embeddings = createMockEmbeddings();
  const vectorStore = await LocalVectorStore.fromDocuments(
    [
      {
        pageContent: "警察到场后先确认人员安全，再开展调查。",
        metadata: { source: "/kb/police.md", title: "警察到场流程" },
      },
    ],
    embeddings
  );

  const result = await searchKnowledgeBase(vectorStore, "警察");
  assert.ok(result.includes("[1]"));
  assert.ok(result.includes("police.md"));
  assert.ok(result.includes("警察到场后先确认人员安全"));
});

test("loadOrBuildVectorStore: should handle force rebuild", async () => {
  const tmpDir = createTempDir("test-vector-");
  const vectorDbPath = path.join(tmpDir, "vectordb");

  try {
    if (fs.existsSync(vectorDbPath)) {
      fs.rmSync(vectorDbPath, { recursive: true });
    }

    const result = await loadOrBuildVectorStore({
      vectorDbPath,
      embeddings: null,
      knowledgeBasePath: "/non/existent",
      forceRebuild: true,
    });

    assert.equal(result, null);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});

test("loadOrBuildVectorStore: should return null when error occurs", async () => {
  const result = await loadOrBuildVectorStore({
    vectorDbPath: `/tmp/test-vector-db-${Date.now()}`,
    embeddings: null,
    knowledgeBasePath: "/non/existent",
    forceRebuild: false,
  });

  assert.equal(result, null);
});
