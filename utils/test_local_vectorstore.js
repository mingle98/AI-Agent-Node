import { LocalVectorStore } from "./ragBuilder.js";

class MockEmbeddings {
  constructor() {
    this.vocab = [];
  }

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
    // 选择出现频次最高的前 200 个 token 作为 vocab
    this.vocab = Object.keys(tokenCounts)
      .sort((a, b) => tokenCounts[b] - tokenCounts[a])
      .slice(0, 200);

    return texts.map((t) => {
      const tokens = this._tokenize(t || "");
      const vec = this.vocab.map((tok) => tokens.filter((x) => x === tok).length);
      return vec;
    });
  }

  async embedQuery(text = "") {
    const tokens = this._tokenize(text);
    return this.vocab.map((tok) => tokens.filter((x) => x === tok).length);
  }
}

(async () => {
  const docs = [
    { pageContent: "Node.js 服务部署与性能优化", metadata: { id: 1 } },
    { pageContent: "JavaScript 异步编程和 Promise 使用", metadata: { id: 2 } },
    { pageContent: "猫的饲养与健康注意事项", metadata: { id: 3 } },
    { pageContent: "如何训练狗狗基本命令", metadata: { id: 4 } },
    { pageContent: "服务器资源监控与报警配置", metadata: { id: 5 } },
  ];

  const emb = new MockEmbeddings();
  const store = await LocalVectorStore.fromDocuments(docs, emb);

  console.log("--- 检索测试 ---");
  const queries = [
    "如何优化 Node.js 服务",
    "猫的健康问题",
    "JavaScript Promise 用法",
    "服务器报警配置",
  ];

  for (const q of queries) {
    const results = await store.similaritySearch(q, 3);
    console.log(`\nQuery: ${q}`);
    results.forEach((r, i) =>
      console.log(i + 1, "id=", r.metadata.id, "-", r.pageContent)
    );
  }
})();
