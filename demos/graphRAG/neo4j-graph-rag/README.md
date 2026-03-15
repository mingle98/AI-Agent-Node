# Neo4j GraphRAG (learning demo)

## What it does

- Ingest a PDF into Neo4j as:

  - `(:Document {id})-[:HAS_CHUNK]->(:Chunk {id, docId, chunkIndex, text})`
  - `(:Entity {name})-[:MENTIONED_IN]->(:Chunk)`
  - `(:Entity)-[:REL {type, count}]->(:Entity)`

- Query with GraphRAG:

  - Extract entities from the question (LLM)
  - Find matching entities in Neo4j
  - Expand a small subgraph (multi-hop) + collect mentioned chunks
  - Use graph triples + chunks as grounding context to answer (LLM)

## Setup

1. Install deps (repo root)

```bash
npm i
```

2. Prepare env

Copy `.env.example` to repo root `.env` (or export env vars in shell):

- `NEO4J_URI`
- `NEO4J_USER`
- `NEO4J_PASSWORD`
- `NEO4J_DATABASE` (optional)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional)

3. Start Neo4j

Make sure Neo4j is running and reachable at `NEO4J_URI`.

## Ingest the provided whitepaper PDF

From repo root:

```bash
node demos/graphRAG/neo4j-graph-rag/run_ingest_whitepaper.js
```

Tips:

- If you want a faster trial, edit `run_ingest_whitepaper.js` to pass `--limitChunks 10`, or run:

```bash
node demos/graphRAG/neo4j-graph-rag/ingest.js --pdf "./knowledge_base/[译] AI Agent（智能体）技术白皮书（Google，2024）.pdf" --limitChunks 10
```

## Query

From repo root:

```bash
node demos/graphRAG/neo4j-graph-rag/run_query.js "这份白皮书里 AI Agent 的核心组件有哪些？"
```

## Notes

- This is a minimal learning demo; extraction quality depends on the LLM.
- For production:

  - Replace `REL {type}` modeling with typed relationships (dynamic Cypher) or a curated ontology.
  - Add chunk embeddings + hybrid retrieval.
  - Add provenance edges (`REL` -> `Chunk`) to trace which text supports which triple.
