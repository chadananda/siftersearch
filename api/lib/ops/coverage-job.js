// coverage-refresh ops job: re-measures documents into the index coverage ledger (coverage-repo; planning/index-coverage-
// plan.md). params { ids } after a producer touched them, or { limit } for the stalest. The reports worker also runs
// refreshStalest() every minute, so the whole library re-measures every few hours with no long query anywhere.
import { measureDoc, saveCoverage, stalestDocs } from '../repos/coverage-repo.js';

const hypeVersion = async () => (await import('../rag/enrich/retrieval.js')).HYPE_VERSION;

export async function coverageRefreshJob({ ids = null, limit = 300 } = {}) {
  const v = await hypeVersion();
  const list = ids?.length ? ids.map(Number) : await stalestDocs(limit);
  let measured = 0;
  for (const id of list) { const rows = await measureDoc(id, { hypeVersion: v }); if (rows.length) { await saveCoverage(id, rows); measured++; } }
  return { measured, of: list.length };
}
