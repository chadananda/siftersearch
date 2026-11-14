// THE INDEXING SERVICE'S JOBS (docs/architecture/continuous-deploy.md; Chad 10-19: "split off the ingesting and indexing
// services so that updates normally do not interfere with indexing"). siftersearch-indexer runs ONLY these, from its own
// small import graph — a change to Dewey, Anís or any other ops job never reaches it, so a deploy leaves indexing running.
// reports.js includes them too (one registry for queueing), but the reports worker never claims them.
import { phraseIndexJob, phraseHotReconcileJob, hypeHotReconcileJob } from './phrase-index-job.js';
import { qdrantHotFoldJob } from './qdrant-hot-fold.js';
import { followedIndexJob } from './index-follow.js';
import { sectionIndexJob } from './section-index-job.js';
import { keywordFillJob } from './keyword-fill-job.js';
import { coverageRefreshJob } from './coverage-job.js';
import { stampVoicesJob } from './stamp-voices-job.js';
import { stampSiteJob } from './stamp-site-job.js';
import { docAuthorRestampJob } from './doc-author-restamp-job.js';
import { stampDocsJob } from './stamp-docs-job.js';
import { vectorsBackupJob } from './vectors-backup-job.js';
import { phraseF16BuildJob } from './phrase-f16-build.js';

export const INDEX_REPORTS = {
  'phrase-index': phraseIndexJob,       // params: { docs? | scope?, maxUsd (required), budgetKey } — one indexer at a time
  'phrase-hot-reconcile': phraseHotReconcileJob,   // RAM tier: re-send phrase units qdrant-hot lost (no spend); folded ones re-marked main; queued at indexer start
  'hype-hot-reconcile': hypeHotReconcileJob,       // the same for HyPE points (QDRANT_HOT_HYPE)
  // RAM write tier → main in bulk (Chad 11-10): params { mode: fold | clean, batch, chunkPoints, settleMin, limit }. Queued by the
  // indexer's fold loop (fill of the RAM-derived capacity, quiet hours), by a hot-full stop, and by hand. Same lane as its writer.
  'phrase-hot-fold': (p = {}) => qdrantHotFoldJob('phrases', p),
  'hype-hot-fold': (p = {}) => qdrantHotFoldJob('hype', p),
  // HyPE questions and concept claims each have their OWN vector store + collection, so they index beside the phrase build.
  // A clean run marks its docs for the follow loop (ops/index-follow.js); { scanOnly: true } is the dry run (est_usd, no spend)
  'hype-index': (p = {}) => followedIndexJob('hype', p),
  'concept-index': (p = {}) => followedIndexJob('concepts', p),
  'phrase-f16-build': phraseF16BuildJob,   // storage plan R12: phrases (main+hot) → float16 collection on qdrant-main (/faster); params { mode: setup|copy|reconcile|finish }
  'section-index': sectionIndexJob,
  'keyword-fill': keywordFillJob,       // params: { ids?, limit?, scope?, significant? } — BM25 gaps from the ledger, core first (Chad 10-16)
  'coverage-refresh': coverageRefreshJob,   // params: { ids? | limit? } — re-measure docs into index_coverage
  'stamp-voices': stampVoicesJob,   // every quoted voice findable by author (Chad 10-19) — after each paragraph-authors run
  'stamp-site': stampSiteJob,
  'doc-author-restamp': docAuthorRestampJob,   // params { ids } — Qdrant author/author_fold/religion from the CURRENT doc rows (payload only)
  'stamp-docs': stampDocsJob,   // params { docs: [ids] } — restamp author/voices/collection after a section-author fix or a collection move
  'vectors-backup': (p = {}) => vectorsBackupJob(p),   // paid vectors.db stores → /tank/sifter/backups/vectors (storage plan R1); own lane — never blocks indexing   // `site` on every scraped-site point (planning/site-databases-plan.md, Chad 10-20)
};
// lanes: phrase indexing alone (measured: one at a time is fastest on the interim SSD); HyPE/concepts/sections beside it;
// BM25 on /fast in its own lane; coverage re-measures
export const INDEX_LANES = { index: ['phrase-index', 'phrase-hot-reconcile', 'phrase-hot-fold'], backup: ['vectors-backup'], f16: ['phrase-f16-build'], index2: ['hype-index', 'concept-index', 'section-index', 'hype-hot-reconcile', 'hype-hot-fold'], keyword: ['keyword-fill'], coverage: ['coverage-refresh', 'stamp-voices', 'stamp-site', 'doc-author-restamp', 'stamp-docs'] };
export const INDEX_JOB_NAMES = Object.keys(INDEX_REPORTS);
