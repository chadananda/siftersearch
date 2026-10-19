// THE INDEXING SERVICE'S JOBS (docs/architecture/continuous-deploy.md; Chad 10-19: "split off the ingesting and indexing
// services so that updates normally do not interfere with indexing"). siftersearch-indexer runs ONLY these, from its own
// small import graph — a change to Dewey, Anís or any other ops job never reaches it, so a deploy leaves indexing running.
// reports.js includes them too (one registry for queueing), but the reports worker never claims them.
import { phraseIndexJob } from './phrase-index-job.js';
import { sectionIndexJob } from './section-index-job.js';
import { keywordFillJob } from './keyword-fill-job.js';
import { coverageRefreshJob } from './coverage-job.js';

export const INDEX_REPORTS = {
  'phrase-index': phraseIndexJob,       // params: { docs? | scope?, maxUsd (required), budgetKey } — one indexer at a time
  // HyPE questions and concept claims each have their OWN vector store + collection, so they index beside the phrase build
  'hype-index': (p = {}) => phraseIndexJob({ ...p, field: 'hype' }),
  'concept-index': (p = {}) => phraseIndexJob({ ...p, field: 'concepts' }),
  'section-index': sectionIndexJob,
  'keyword-fill': keywordFillJob,       // params: { ids?, limit?, scope?, significant? } — BM25 gaps from the ledger, core first (Chad 10-16)
  'coverage-refresh': coverageRefreshJob,   // params: { ids? | limit? } — re-measure docs into index_coverage
};
// lanes: phrase indexing alone (measured: one at a time is fastest on the interim SSD); HyPE/concepts/sections beside it;
// BM25 on /fast in its own lane; coverage re-measures
export const INDEX_LANES = { index: ['phrase-index'], index2: ['hype-index', 'concept-index', 'section-index'], keyword: ['keyword-fill'], coverage: ['coverage-refresh'] };
export const INDEX_JOB_NAMES = Object.keys(INDEX_REPORTS);
