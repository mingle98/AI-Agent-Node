import assert from "node:assert/strict";
import test from "node:test";

import { searchKnowledgeBase } from "../tools/knowledge.js";

test("searchKnowledgeBase: should return formatted results", async () => {
  const mockVectorStore = {
    similaritySearch: async (query, k) => [
      {
        pageContent: "This is a test document about AI Agent architecture and design patterns.",
        metadata: { source: "/path/to/doc.md" },
      },
      {
        pageContent: "Another document about implementation details.",
        metadata: { source: "/path/to/another.txt" },
      },
    ],
  };

  const result = await searchKnowledgeBase(mockVectorStore, "AI Agent");
  assert.ok(result.includes("[1]"));
  assert.ok(result.includes("doc.md"));
  assert.ok(result.includes("AI Agent"));
});

test("searchKnowledgeBase: should handle empty results", async () => {
  const mockVectorStore = {
    similaritySearch: async () => [],
  };

  const result = await searchKnowledgeBase(mockVectorStore, "query");
  assert.equal(result, "知识库中未找到相关信息");
});

test("searchKnowledgeBase: should preserve long content when returned by vector search", async () => {
  const longContent = "a".repeat(200);
  const mockVectorStore = {
    similaritySearch: async () => [
      {
        pageContent: longContent,
        metadata: { source: "/long/doc.md" },
      },
    ],
  };

  const result = await searchKnowledgeBase(mockVectorStore, "query");
  assert.ok(result.includes(longContent));
  assert.ok(result.includes("doc.md"));
});
