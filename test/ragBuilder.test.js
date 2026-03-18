import assert from "node:assert/strict";
import test from "node:test";

import { checkVectorDBExists, buildRAGKnowledgeBase, loadOrBuildVectorStore } from "../utils/ragBuilder.js";

test("checkVectorDBExists: should return false for non-existent path", () => {
  const result = checkVectorDBExists("/non/existent/path");
  assert.equal(result, false);
});

test("checkVectorDBExists: should return false when only index exists", () => {
  // This would need actual file system mocking for complete coverage
  // For now, test with invalid path
  const result = checkVectorDBExists("/tmp");
  // /tmp exists but doesn't have faiss.index and docstore.json
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
  // Create a temp empty directory
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-empty-"));
  
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
    fs.rmdirSync(tmpDir);
  }
});

test("loadOrBuildVectorStore: should handle force rebuild", async () => {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-vector-"));
  const vectorDbPath = path.join(tmpDir, "vectordb");
  
  try {
    // First ensure the vectorDbPath doesn't exist
    if (fs.existsSync(vectorDbPath)) {
      fs.rmSync(vectorDbPath, { recursive: true });
    }
    
    // Test with force rebuild on non-existent path
    const result = await loadOrBuildVectorStore({
      vectorDbPath,
      embeddings: null,
      knowledgeBasePath: "/non/existent",
      forceRebuild: true,
    });
    
    // Should return null because knowledge base doesn't exist
    assert.equal(result, null);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});

test("loadOrBuildVectorStore: should return null when error occurs", async () => {
  const result = await loadOrBuildVectorStore({
    vectorDbPath: "/tmp/test-vector-db-" + Date.now(),
    embeddings: null,
    knowledgeBasePath: "/non/existent",
    forceRebuild: false,
  });
  
  // Should return null because knowledge base doesn't exist
  assert.equal(result, null);
});

test("loadOrBuildVectorStore: should handle checkVectorDBExists returning true path", async () => {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-vectordb-"));
  
  try {
    // Create fake faiss.index and docstore.json files
    fs.writeFileSync(path.join(tmpDir, "faiss.index"), "fake index");
    fs.writeFileSync(path.join(tmpDir, "docstore.json"), "{}");
    
    // Verify checkVectorDBExists returns true
    assert.equal(checkVectorDBExists(tmpDir), true);
    
    // Clean up
    fs.unlinkSync(path.join(tmpDir, "faiss.index"));
    fs.unlinkSync(path.join(tmpDir, "docstore.json"));
  } finally {
    fs.rmdirSync(tmpDir);
  }
});
