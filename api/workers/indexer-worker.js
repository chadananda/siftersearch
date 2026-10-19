// siftersearch-indexer — the INDEXING macro-service (docs/architecture/continuous-deploy.md; Chad 10-19: "split off the
// ingesting and indexing services so that updates normally do not interfere with indexing"). Phrase / HyPE / concept /
// section vectors, BM25 keyword fill and the coverage ledger, from its OWN small import graph (ops/index-reports.js): a
// deploy that changes Dewey, Anís or any other ops job never touches it. Drains like every ops service. Deps: service-worker.
import dotenv from 'dotenv';
import { logger } from '../lib/logger.js';
import { INDEX_REPORTS, INDEX_LANES } from '../lib/ops/index-reports.js';
import { LANE_WORKERS } from '../lib/ops/lane-workers.js';
import { logActivity } from '../lib/repos/activity-repo.js';
import { isDraining, nap } from '../lib/drain.js';
import { runService } from '../lib/ops/service-worker.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });

// Rolling coverage refresh (planning/index-coverage-plan.md): the 300 stalest documents re-measured every minute, so the
// ledger converges even when a producer forgets to ask. Cheap per document (doc_id indexes + Qdrant counts).
async function rollingCoverage() {
  const { coverageRefreshJob } = await import('../lib/ops/coverage-job.js');
  const totals = await import('../lib/repos/coverage-repo.js');
  let rebuilt = 0;
  while (!isDraining()) {
    // the totals move by deltas; a full rebuild when empty and once a day corrects drift (retired docs, tradition changes)
    if (Date.now() - rebuilt > 86400000 || await totals.coverageTotalsEmpty().catch(() => false)) {
      await totals.rebuildCoverageTotals().then(() => { rebuilt = Date.now(); logActivity('ledger', 'coverage totals rebuilt from the full ledger (daily)'); })
        .catch((err) => logger.warn({ err: err.message }, 'coverage: totals rebuild failed'));
    }
    const r = await coverageRefreshJob({ limit: 300 }).catch((err) => { logger.warn({ err: err.message }, 'coverage: rolling refresh failed'); return null; });
    if (r?.measured) logActivity('ledger', `re-measured ${r.measured} documents × 11 layers · index coverage ledger`);
    await nap(60_000);
  }
}


// BM25 and document structure right behind ingestion (Chad 10-16: "the first thing to be completed after initial paragraph ingestion"): every
// 10 minutes, if the ledger shows a real keyword gap, queue keyword-fill (enqueue dedupes a queued/running twin).
async function keywordLoop() {
  const { keywordGapDocs } = await import('../lib/repos/keyword-repo.js');
  const { enqueue } = await import('../lib/repos/ops-report-repo.js');
  const last = {};
  while (!isDraining()) {
    // only when the gap CHANGED since the last queued run: a gap a fill cannot close (10-17: the same 197 documents
    // re-sent every 10 minutes) must not become a write loop on the NVMe
    for (const [scope, job] of [['primary', 'keyword-fill'], ['supplemental', 'keyword-fill-sites']]) {
      const gap = await keywordGapDocs({ scope, significant: true }).catch(() => []);
      const sig = gap.map((d) => `${d.id}:${d.total}:${d.indexed}`).join(',');
      if (gap.length && sig !== last[scope]) {
        last[scope] = sig;
        await enqueue(job, { significant: true }, 'keyword-loop').catch((err) => logger.warn({ err: err.message }, 'keyword loop: enqueue failed'));
      }
    }
    // document structure (sub-documents, TOC) right after ingestion (Chad 10-17): read every live document not yet read
    const unread = await (await import('../lib/repos/sections-repo.js')).docsWithoutStructure(1).catch(() => []);
    if (unread.length) await enqueue('section-index', { unread: true }, 'structure-loop').catch((err) => logger.warn({ err: err.message }, 'structure loop: enqueue failed'));
    // a NEW long book whose own headings gave no structure → inference (its Contents page / the work's standard structure)
    const infer = await (await import('../lib/repos/sections-repo.js')).autoInferCandidates().catch(() => []);
    if (infer.length) await enqueue('structure-infer', { ids: infer }, 'structure-loop').catch((err) => logger.warn({ err: err.message }, 'structure loop: infer enqueue failed'));
    // PAID follow-through (phrase vectors for new books) runs only under a standing daily cap — AUTO_INDEX_USD_DAY,
    // 0/unset = off (Chad sets it); each run carries its own maxUsd and the shared budget key
    const cap = Number(process.env.AUTO_INDEX_USD_DAY || 0);
    if (cap > 0) {
      const phraseless = await (await import('../lib/repos/coverage-repo.js')).newDocsMissingLayer('phrase').catch(() => []);
      if (phraseless.length) await enqueue('phrase-index', { docs: phraseless, maxUsd: cap, budgetKey: 'auto-ingest' }, 'follow-through').catch((err) => logger.warn({ err: err.message }, 'follow-through: phrase enqueue failed'));
    }
    await nap(600_000);
  }
}

await runService({ name: process.env.name || 'siftersearch-indexer', registry: INDEX_REPORTS, lanes: INDEX_LANES, laneWorkers: LANE_WORKERS,
  loops: [rollingCoverage, keywordLoop] });
