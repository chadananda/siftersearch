// coverage-refresh ops job: re-measures documents into the index coverage ledger (coverage-repo; planning/index-coverage-
// plan.md). params { ids } after a producer touched them, or { limit } for the stalest. The reports worker also runs
// refreshStalest() every minute, so the whole library re-measures every few hours with no long query anywhere.
import { measureDoc, saveCoverage, stalestDocs, touchCoverage } from '../repos/coverage-repo.js';

export const hypeVersion = async () => (await import('../rag/enrich/retrieval.js')).HYPE_VERSION;

export async function coverageRefreshJob({ ids = null, limit = 300 } = {}) {
  const v = await hypeVersion();
  const list = ids?.length ? ids.map(Number) : await stalestDocs(limit);
  let measured = 0, changed = 0;
  const same = [];
  for (const id of list) {
    const rows = await measureDoc(id, { hypeVersion: v });
    if (!rows.length) continue;
    measured++;
    if (await saveCoverage(id, rows)) changed++; else same.push(id);
  }
  if (same.length) await touchCoverage(same);   // unchanged: only their age moves, in one write
  return { measured, changed, of: list.length };
}
