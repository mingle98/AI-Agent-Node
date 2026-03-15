import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel, invokeJson } from "./llm.js";

// 这个文件负责“信息抽取（IE）”：
// - 从文本 chunk 抽取实体 + 关系三元组（用于构建知识图谱）
// - 从用户问题抽取实体（用于图检索的 seed）
//
// 这里采用最简单、最容易理解的方式：
// 直接让大模型输出 JSON。
// 优点：实现快、学习成本低。
// 缺点：质量受提示词与模型稳定性影响，生产场景通常会加上：
// - 实体规范化（同义词/别名）
// - 关系 schema 限制（白名单）
// - 置信度/溯源（每个 triple 对应到 chunk 证据）

export async function extractTriplesFromChunk(chunkText) {
  // 目的：把一段文本变成一个“小图谱”，用于写入 Neo4j。
  // 输出格式：
  // {
  //   entities: ["AI Agent", "Tool", ...],
  //   relations: [
  //     { source: "AI Agent", type: "USES", target: "Tool" },
  //     ...
  //   ]
  // }
  const llm = createChatModel({ temperature: 0 });
  const system = new SystemMessage(
    "You extract a small knowledge graph from text. Output strict JSON with keys: entities (array of strings), relations (array of {source, type, target}). Keep entity names short. Relation type should be UPPER_SNAKE_CASE. Only include relations explicitly supported by the text."
  );
  const user = new HumanMessage(
    `Text:\n${chunkText}\n\nReturn JSON only.`
  );
  const json = await invokeJson(llm, [system, user]);

  const entities = Array.isArray(json.entities) ? json.entities.filter(Boolean) : [];
  const relations = Array.isArray(json.relations) ? json.relations : [];

  // 去重 + trim
  const normalizedEntities = [...new Set(entities.map((e) => String(e).trim()).filter(Boolean))];

  // 关系字段做最小规范化：type 转大写，过滤掉空 source/target
  const normalizedRelations = relations
    .map((r) => ({
      source: r?.source ? String(r.source).trim() : "",
      type: r?.type ? String(r.type).trim().toUpperCase() : "RELATED_TO",
      target: r?.target ? String(r.target).trim() : "",
    }))
    .filter((r) => r.source && r.target);

  return { entities: normalizedEntities, relations: normalizedRelations };
}

export async function extractEntitiesFromQuestion(question) {
  // 目的：从用户问题中抽取“要在图里查的实体”。
  // 这些实体会作为 seed，去 Neo4j 里模糊匹配，再扩展子图。
  const llm = createChatModel({ temperature: 0 });
  const system = new SystemMessage(
    "Extract the key entities from the question for graph search. Output strict JSON with key: entities (array of strings). Keep names short."
  );
  const user = new HumanMessage(`Question:\n${question}\n\nReturn JSON only.`);
  const json = await invokeJson(llm, [system, user]);
  const entities = Array.isArray(json.entities) ? json.entities : [];
  return [...new Set(entities.map((e) => String(e).trim()).filter(Boolean))];
}
