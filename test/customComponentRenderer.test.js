import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomComponents,
  ensureAnswerHasCustomComponentPlaceholders,
  renderCustomComponents,
} from "../utils/customComponentRenderer.js";

test("buildCustomComponents: should build sl-card-group from daily_news tool result", () => {
  const toolExcResults = [
    {
      toolName: "daily_news",
      result: JSON.stringify({
        platform: "tenxunwang",
        count: 2,
        items: [
          {
            title: "t1",
            url: "https://a.example",
            content: "c1",
          },
          {
            title: "t2",
            url: "https://b.example",
            content: "c2",
          },
        ],
      }),
    },
  ];

  const customComponents = buildCustomComponents(toolExcResults);
  assert.ok(customComponents);
  assert.ok(customComponents["1"]);
  assert.equal(customComponents["1"].type, "sl-card-group");
  assert.equal(customComponents["1"].data.id, "1");
  assert.ok(Array.isArray(customComponents["1"].data.items));
  assert.equal(customComponents["1"].data.items.length, 2);
  assert.deepEqual(customComponents["1"].data.items[0], {
    imageUrl: "https://picsum.photos/seed/t1/400/240",
    title: "t1",
    description: "c1",
    jumpLink: "https://a.example",
  });
});

test("buildCustomComponents: should return empty object when no supported tool results", () => {
  const customComponents = buildCustomComponents([{ toolName: "unknown", result: "{}" }]);
  assert.deepEqual(customComponents, {});
});

test("ensureAnswerHasCustomComponentPlaceholders: should append missing placeholders", () => {
  const answer = "这里是正文...";
  const customComponents = {
    "2": { type: "card", data: { id: "2" } },
    "1": { type: "card", data: { id: "1" } },
  };

  const updated = ensureAnswerHasCustomComponentPlaceholders(answer, customComponents);
  assert.ok(updated.includes("[[~1]]"));
  assert.ok(updated.includes("[[~2]]"));
  assert.ok(updated.startsWith("这里是正文..."));
});

test("ensureAnswerHasCustomComponentPlaceholders: should not duplicate existing placeholders", () => {
  const answer = "正文 [[~1]]";
  const customComponents = {
    "1": { type: "card", data: { id: "1" } },
  };

  const updated = ensureAnswerHasCustomComponentPlaceholders(answer, customComponents);
  const first = updated.indexOf("[[~1]]");
  const last = updated.lastIndexOf("[[~1]]");
  assert.equal(first, last);
});

test("renderCustomComponents: should send sse payloads for built components", async () => {
  const toolExcResults = [
    {
      toolName: "daily_news",
      result: JSON.stringify({
        platform: "tenxunwang",
        count: 1,
        items: [{ title: "t1", url: "https://a.example", content: "c1" }],
      }),
    },
  ];

  const sent = [];
  const sendChunk = (payload) => sent.push(payload);

  await renderCustomComponents(toolExcResults, sendChunk, { sleepMs: 0 });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].code, 0);
  assert.equal(sent[0].type, "custom-component");
  assert.equal(sent[0].result, "[[~1]]");
  assert.equal(sent[0].is_end, false);
  assert.equal(sent[0].props.type, "sl-card-group");
  assert.ok(Array.isArray(sent[0].props.data.items));
});
