// Worker thread for claim-search.js: every supported claim about a live person, read once on this thread's own SQLite
// connection (tagged '<proc>/thread', never counted as blocking), folded in JS, refreshed every 30 min; answers
// { id, terms, foldedQuery } with rankClaims' rows. Deps: entity-api (claimCorpusRows, foldText, rankClaims).
import { parentPort } from 'worker_threads';
import { claimCorpusRows, foldText, rankClaims } from './entity-api.js';

const REFRESH_MS = 30 * 60 * 1000;
let corpus = null, loadedAt = 0, loading = null;

async function load() {
  const rows = await claimCorpusRows();
  for (const r of rows) r.f = foldText(r.statement);
  corpus = rows; loadedAt = Date.now();
}
const ready = () => {
  if (!loading && (!corpus || Date.now() - loadedAt > REFRESH_MS)) loading = load().finally(() => { loading = null; });
  return corpus ? null : loading;   // a refresh in progress never makes a query wait when a copy is in hand
};

parentPort.on('message', async ({ id, terms, foldedQuery, warm }) => {
  try {
    await ready();
    if (warm) return;
    parentPort.postMessage({ id, rows: rankClaims(corpus, terms, foldedQuery) });
  } catch (err) {
    if (!warm) parentPort.postMessage({ id, error: String(err?.message || err) });
  }
});
