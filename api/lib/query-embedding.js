// One embedding per search query: in-flight de-duplication + short LRU. The main and HyPE layers each embedded the
// same question (two OpenAI calls), and planned search can start it while Jev plans. Deps: ai.js (createEmbedding).
import { createEmbedding } from './ai.js';

const TTL_MS = 10 * 60 * 1000;
const MAX = 500;
const memo = new Map();   // text → { at, p }

/** Resolves to { embedding } exactly like createEmbedding; a failure is not cached. */
export function queryEmbedding(text, { caller = 'search' } = {}) {
  const key = String(text ?? '');
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = createEmbedding(key, { caller }).catch((err) => { memo.delete(key); throw err; });
  if (memo.size >= MAX) memo.delete(memo.keys().next().value);
  memo.set(key, { at: Date.now(), p });
  return p;
}

export function clearQueryEmbeddings() { memo.clear(); }
