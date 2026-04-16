import { LocalVectorStore } from "./ragBuilder.js";

class MockEmbeddings {
  _tokenize(text = "") {
    return String(text)
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter(Boolean);
  }

  async embedDocuments(texts = []) {
    const tokenCounts = {};
    texts.forEach((t) => {
      const tokens = this._tokenize(t || "");
      tokens.forEach((tok) => {
        tokenCounts[tok] = (tokenCounts[tok] || 0) + 1;
      });
    });
    this.vocab = Object.keys(tokenCounts).sort((a, b) => tokenCounts[b] - tokenCounts[a]).slice(0, 200);
    return texts.map((t) => {
      const tokens = this._tokenize(t || "");
      return this.vocab.map((tok) => tokens.filter((x) => x === tok).length);
    });
  }

  async embedQuery(text = "") {
    const tokens = this._tokenize(text);
    return this.vocab.map((tok) => tokens.filter((x) => x === tok).length);
  }
}

async function evaluateAlpha(alpha, docs, queries, expectedMap) {
  const emb = new MockEmbeddings();
  const store = await LocalVectorStore.fromDocuments(docs, emb);
  store.alpha = alpha;

  let top1 = 0;
  let mrr = 0;

  for (const q of queries) {
    const results = await store.similaritySearch(q.text, 10);
    const foundIndex = results.findIndex((r) => r.metadata.id === expectedMap[q.text]);
    if (foundIndex === 0) top1 += 1;
    if (foundIndex >= 0) mrr += 1 / (foundIndex + 1);
  }

  const n = queries.length;
  return { alpha, top1Acc: top1 / n, mrr: mrr / n };
}

(async () => {
  const docs = [
    { pageContent: "Node.js 服务部署与性能优化", metadata: { id: 1 } },
    { pageContent: "JavaScript 异步编程和 Promise 使用", metadata: { id: 2 } },
    { pageContent: "猫的饲养与健康注意事项", metadata: { id: 3 } },
    { pageContent: "如何训练狗狗基本命令", metadata: { id: 4 } },
    { pageContent: "服务器资源监控与报警配置", metadata: { id: 5 } },
  ];

  const queries = [
    { text: "如何优化 Node.js 服务" },
    { text: "猫的健康问题" },
    { text: "JavaScript Promise 用法" },
    { text: "服务器报警配置" },
  ];

  const expectedMap = {
    "如何优化 Node.js 服务": 1,
    "猫的健康问题": 3,
    "JavaScript Promise 用法": 2,
    "服务器报警配置": 5,
  };

  const alphas = [];
  for (let a = 0; a <= 1.0 + 1e-9; a += 0.05) alphas.push(Number(a.toFixed(2)));

  const results = [];
  for (const a of alphas) {
    const res = await evaluateAlpha(a, docs, queries, expectedMap);
    results.push(res);
    console.log(`alpha=${a.toFixed(2)}  top1=${(res.top1Acc*100).toFixed(1)}%  mrr=${res.mrr.toFixed(3)}`);
  }

  results.sort((x, y) => (y.mrr - x.mrr) || (y.top1Acc - x.top1Acc));
  const best = results[0];
  console.log("\nBest result:", best);
})();
