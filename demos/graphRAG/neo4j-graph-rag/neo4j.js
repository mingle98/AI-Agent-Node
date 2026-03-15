import neo4j from "neo4j-driver";
import { config } from "./config.js";

// 这个文件封装了 Neo4j 的连接、会话，以及本 demo 用到的 schema 初始化。
//
// 你只需要记住：
// - createDriver()：创建 driver（底层连接池）
// - withSession(fn)：创建 session（一次逻辑操作），执行 fn(session)，然后自动关闭
// - initSchema()：创建约束/索引，保证 MERGE 性能和唯一性

export function createDriver() {
  return neo4j.driver(
    config.neo4j.uri,
    neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
  );
}

// withSession 让调用方不用重复写 try/finally。
//
// 注意：
// - driver 是重对象，生产环境通常会复用单例；
// - 这个学习 demo 为了简单，每次调用都会创建/关闭 driver。
//   如果你后面要做成服务端 API，再优化为单例即可。
export async function withSession(fn) {
  const driver = createDriver();
  const session = driver.session({ database: config.neo4j.database });
  try {
    return await fn(session);
  } finally {
    await session.close();
    await driver.close();
  }
}

// 初始化图数据库 schema（约束 + 索引）。
//
// 我们的节点设计：
// - Entity(name)   ：实体节点，name 唯一
// - Chunk(id)      ：文本分块节点，id 唯一
// - Document(id)   ：文档节点，id 唯一
//
// 约束/索引的价值：
// - MERGE 能更快命中
// - 避免重复写入导致图谱膨胀
export async function initSchema() {
  await withSession(async (session) => {
    await session.run(
      `CREATE CONSTRAINT entity_name_unique IF NOT EXISTS
       FOR (e:Entity) REQUIRE e.name IS UNIQUE`
    );
    await session.run(
      `CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
       FOR (c:Chunk) REQUIRE c.id IS UNIQUE`
    );
    await session.run(
      `CREATE CONSTRAINT document_id_unique IF NOT EXISTS
       FOR (d:Document) REQUIRE d.id IS UNIQUE`
    );
    await session.run(
      `CREATE INDEX chunk_doc_id IF NOT EXISTS
       FOR (c:Chunk) ON (c.docId)`
    );
  });
}
