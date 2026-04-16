import fs from 'fs';
import path from 'path';
import { LocalVectorStore } from './ragBuilder.js';

const VECTOR_DB = path.join(process.cwd(), 'vector_db', 'vector-store.json');

function loadVectorStoreItems(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

function genQueriesFromDocs(items, maxQueries = 200) {
  const queries = [];
  for (let i = 0; i < items.length && queries.length < maxQueries; i++) {
    const it = items[i];
    const text = String(it.pageContent || '');
    // split into sentences by punctuation
    const parts = text.split(/[。！？.!?\n]+/).map(s => s.trim()).filter(Boolean);
    const take = Math.min(2, parts.length || 1);
    for (let j = 0; j < take && queries.length < maxQueries; j++) {
      const qtext = parts[j];
      if (!qtext) continue;
      queries.push({ text: qtext, expectedId: it.metadata && it.metadata.id, expectedSource: it.metadata && it.metadata.source });
    }
  }
  return queries;
}

function makeAlphaFunction(cfg) {
  // cfg: {t1,t2,as,am,al}
  return (queryTokens) => {
    const qlen = queryTokens.length || 0;
    if (qlen <= cfg.t1) return cfg.as;
    if (qlen <= cfg.t2) return cfg.am;
    return cfg.al;
  };
}

async function evaluateConfig(store, queries, cfg) {
  store.alpha = makeAlphaFunction(cfg);
  let top1 = 0, mrr = 0;
  for (const q of queries) {
    const docs = await store.similaritySearch(q.text, 10);
    let found = -1;
    for (let i = 0; i < docs.length; i++) {
      const meta = docs[i].metadata || {};
      if (q.expectedId != null && meta.id != null && String(meta.id) === String(q.expectedId)) { found = i; break; }
      if (q.expectedSource && meta.source && String(meta.source).includes(String(q.expectedSource))) { found = i; break; }
    }
    if (found === 0) top1 += 1;
    if (found >= 0) mrr += 1 / (found + 1);
  }
  const n = queries.length || 1;
  return { top1: top1 / n, mrr: mrr / n };
}

(async () => {
  if (!fs.existsSync(VECTOR_DB)) {
    console.error('vector-store.json not found at', VECTOR_DB);
    process.exit(1);
  }

  const rawItems = loadVectorStoreItems(VECTOR_DB);
  if (rawItems.length === 0) {
    console.error('no items found in vector-store.json');
    process.exit(1);
  }

  // load store without embeddings (offline)
  const store = await LocalVectorStore.load(path.dirname(VECTOR_DB), null);

  const queries = genQueriesFromDocs(rawItems, 200);
  console.log('Generated', queries.length, 'queries from', rawItems.length, 'documents');

  // grid: thresholds and alphas
  const t1Options = [1,2,3];
  const t2Options = [4,5,7];
  const asOptions = [0.0, 0.05, 0.1, 0.15, 0.2];
  const amOptions = [0.1, 0.2, 0.3, 0.4];
  const alOptions = [0.3, 0.5, 0.7, 0.9];

  const results = [];
  for (const t1 of t1Options) {
    for (const t2 of t2Options) {
      if (t2 <= t1) continue;
      for (const as of asOptions) {
        for (const am of amOptions) {
          for (const al of alOptions) {
            const cfg = { t1, t2, as, am, al };
            // evaluate
            // copy store items to avoid mutating global index state
            const res = await evaluateConfig(store, queries, cfg);
            results.push({ cfg, ...res });
            console.log('cfg', cfg, '=> top1', (res.top1*100).toFixed(1)+'%', 'mrr', res.mrr.toFixed(3));
          }
        }
      }
    }
  }

  results.sort((a,b) => (b.mrr - a.mrr) || (b.top1 - a.top1));
  const best = results[0];
  console.log('\nBest config:', best);
  fs.writeFileSync('utils/auto_tune_offline_results.json', JSON.stringify({ best, results }, null, 2), 'utf-8');
  console.log('Results saved to utils/auto_tune_offline_results.json');
})();
