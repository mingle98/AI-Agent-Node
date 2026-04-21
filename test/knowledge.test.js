import assert from "node:assert/strict";
import test from "node:test";

import { CONFIG } from "../config.js";
import { searchKnowledgeBase } from "../tools/knowledge.js";

function withKnowledgeProvider(t, provider) {
  const originalProvider = CONFIG.knowledgeSearchProvider;
  CONFIG.knowledgeSearchProvider = provider;
  t.after(() => {
    CONFIG.knowledgeSearchProvider = originalProvider;
  });
}

test("searchKnowledgeBase: should return formatted results", async (t) => {
  withKnowledgeProvider(t, "rag");
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

  const result = await searchKnowledgeBase({ vectorStore: mockVectorStore }, "AI Agent");
  assert.ok(result.includes("[1]"));
  assert.ok(result.includes("doc.md"));
  assert.ok(result.includes("AI Agent"));
});

test("searchKnowledgeBase: should remain compatible with legacy vectorStore argument", async (t) => {
  withKnowledgeProvider(t, "rag");
  const mockVectorStore = {
    similaritySearch: async () => [
      {
        pageContent: "Legacy vector store result",
        metadata: { source: "/legacy/doc.md" },
      },
    ],
  };

  const result = await searchKnowledgeBase(mockVectorStore, "legacy query");
  assert.ok(result.includes("Legacy vector store result"));
  assert.ok(result.includes("doc.md"));
});

test("searchKnowledgeBase: should handle empty results", async (t) => {
  withKnowledgeProvider(t, "rag");
  const mockVectorStore = {
    similaritySearch: async () => [],
  };

  const result = await searchKnowledgeBase({ vectorStore: mockVectorStore }, "query");
  assert.equal(result, "知识库中未找到相关信息");
});

test("searchKnowledgeBase: should preserve long content when returned by vector search", async (t) => {
  withKnowledgeProvider(t, "rag");
  const longContent = "a".repeat(200);
  const mockVectorStore = {
    similaritySearch: async () => [
      {
        pageContent: longContent,
        metadata: { source: "/long/doc.md" },
      },
    ],
  };

  const result = await searchKnowledgeBase({ vectorStore: mockVectorStore }, "query");
  assert.ok(result.includes(longContent));
  assert.ok(result.includes("doc.md"));
  assert.ok(!result.includes("..."));
});

test("searchKnowledgeBase: should support llm wiki backend with unified output", async (t) => {
  withKnowledgeProvider(t, "llm_wiki");

  const result = await searchKnowledgeBase(
    {
      knowledgeRetriever: {
        retrieve: async () => ({
          docs: [
            {
              pageContent: "Wiki summary content",
              metadata: { title: "Wiki Title", slug: "wiki-title" },
            },
          ],
        }),
      },
    },
    "wiki query"
  );

  assert.ok(result.includes("Wiki summary content"));
  assert.ok(result.includes("Wiki Title"));
});
