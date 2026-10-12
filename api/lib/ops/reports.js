// Ops reports — the named, server-side answers to "is the library healthy?". Each runs inside siftersearch-reports (never
// the API: they scan whole tables), one at a time, and returns plain JSON stored in ops_report_runs. Add a report here,
// not a script. Deps: integrity-repo, language-repo, phrase-store-repo, language-codes.
import { deletionsByDay, hollowDocs, liveParagraphsByScope } from '../repos/integrity-repo.js';
import { docLanguageCounts } from '../repos/language-repo.js';
import { coverageByScope, monthSpend } from '../repos/phrase-store-repo.js';
import { normLang } from '../language-codes.js';
import { spendSince } from '../repos/ai-usage-repo.js';
import { blockAttrsJob, blockMismatchReport, reingestImpactReport } from './block-attrs-job.js';
import { ctaiOriginalsJob, ingestFilesJob, ctaiLinkJob } from './ctai-jobs.js';
import { phraseIndexJob } from './phrase-index-job.js';
import { retireDuplicatesJob } from './library-jobs.js';
import { slowQueriesByHour } from '../repos/query-health-repo.js';
import { reingestCarryJob, carryVerifyReport, carryRepairJob } from './carry-job.js';
import { translationAudit, originalAudit } from '../repos/alignment-repo.js';
import { CTAI_DOC_BY_WORK } from '../rag/concepts/ctai.js';

export const REPORTS = {
  /** Slow statements per hour × process × caller — is a 'Blocking queries' alert live or a stale entry? params: { hours, minMs } */
  async 'slow-queries'({ hours = 24, minMs = 5000 } = {}) {
    const rows = await slowQueriesByHour({ hours, minMs });
    const byProc = {};
    for (const r of rows) { const k = `${r.proc}/${r.kind}${r.name ? ' ' + r.name : ''}`; byProc[k] = (byProc[k] || 0) + r.n; }
    return { hours, minMs, total: rows.reduce((n, r) => n + r.n, 0), by_proc: byProc, rows };
  },
  /** Live books with no text, or with empty rows — per source, with sample ids. */
  async hollow() {
    const rows = await hollowDocs();
    const by = {};
    for (const r of rows) {
      const s = (by[r.source] ||= { hollow_no_rows: 0, hollow_empty_rows: 0, docs_with_some_empty_rows: 0, empty_rows: 0, ids: [] });
      if (!r.rows) s.hollow_no_rows++; else if (!r.with_text) s.hollow_empty_rows++; else s.docs_with_some_empty_rows++;
      s.empty_rows += r.empty_rows || 0;
      if (s.ids.length < 50) s.ids.push(r.id);
    }
    return { affected_docs: rows.length, by_source: by };
  },
  /** Soft-deleted paragraphs per day × source — explains a content-drop alert. params: { days } */
  async deletions({ days = 14 } = {}) {
    const rows = await deletionsByDay(days);
    return { days, total: rows.reduce((n, r) => n + r.paragraphs, 0), rows };
  },
  /** Doc language labels, flagging any that are not normalised. */
  async languages() {
    const rows = await docLanguageCounts();
    return { labels: rows.sort((a, b) => b.docs - a.docs), not_normalised: rows.filter((r) => r.language && normLang(r.language) !== r.language) };
  },
  /** Phrase-index coverage vs live paragraphs, per scope × religion, and the $ to finish at the measured cost per paragraph. */
  async 'phrase-coverage'() {
    const months = monthSpend();
    const covered = coverageByScope();
    const live = await liveParagraphsByScope();
    const key = (r) => `${r.scope}|${r.religion}`;
    const cov = new Map(covered.map((r) => [key(r), r.paragraphs]));
    const spent = months.reduce((n, m) => n + (m.usd || 0), 0);
    const coveredTotal = covered.reduce((n, r) => n + r.paragraphs, 0);
    const perPara = coveredTotal ? spent / coveredTotal : 0;
    const rows = live.map((r) => { const c = cov.get(key(r)) || 0; return { scope: r.scope, religion: r.religion, live: r.paragraphs, covered: c, missing: Math.max(0, r.paragraphs - c) }; })
      .sort((a, b) => b.missing - a.missing);
    const missing = rows.reduce((n, r) => n + r.missing, 0);
    return { months, spent_usd: +spent.toFixed(2), covered_paragraphs: coveredTotal, usd_per_paragraph: +perPara.toFixed(6), missing_paragraphs: missing,
      est_usd_to_finish: +(missing * perPara).toFixed(0), note: 'upper bound: identical phrase text is embedded once', rows };
  },
};

/** CTAI works (Chad 10-11: originals "properly paragraphed FROM THE ENGLISH … aligned … matching display ids … ingested
 *  with links between aligned paragraphs"): per English host doc, alignment health; per original, coverage + pn match. */
REPORTS['ctai-audit'] = async () => {
  const hosts = {};
  for (const [work, doc] of Object.entries(CTAI_DOC_BY_WORK)) (hosts[doc] ||= []).push(work);
  const out = [];
  for (const [doc, works] of Object.entries(hosts)) {
    const t = await translationAudit(Number(doc));
    const originals = [];
    for (const o of t.origDocs) originals.push({ doc_id: o.doc_id, links: o.links, ...(await originalAudit(o.doc_id, Number(doc))) });
    out.push({ english_doc: Number(doc), works, english: t.paras, alignment: t.links, originals });
  }
  return { hosts: out };
};

/** AI spend by model × caller over the last N hours (params: { hours }). */
REPORTS.spend = async ({ hours = 6 } = {}) => { const rows = await spendSince(hours); return { hours, total_usd: +rows.reduce((n, r) => n + (r.usd || 0), 0).toFixed(2), rows }; };

// JOBS that write (through the single writer) — same queue, same one-at-a-time worker, same API.
REPORTS['block-attrs'] = blockAttrsJob;   // params: { ids?, limit? } — copy file ids/pn onto rows
REPORTS['block-mismatch'] = blockMismatchReport;   // params: { ids } — why rows don't match file blocks
REPORTS['reingest-impact'] = reingestImpactReport;
REPORTS['ctai-originals'] = ctaiOriginalsJob;   // write original-language files paragraphed from the English
REPORTS['ingest-files'] = ingestFilesJob;       // params: { paths?, ids? } — ingest in the ops worker
REPORTS['ctai-link'] = ctaiLinkJob;             // 1:1 content_alignment by align
REPORTS['carry-verify'] = carryVerifyReport;     // params: { ids, backup? } — enrichment before vs after
REPORTS['carry-repair'] = carryRepairJob;       // params: { ids } — re-apply the carry from the backup
REPORTS['reingest-carry'] = reingestCarryJob;   // params: { ids } — re-ingest + carry enrichment to the new rows (backup first)
REPORTS['retire-duplicates'] = retireDuplicatesJob;   // params: { pairs:[{dup,keep,reason}], batch?, apply? } — dry run by default
REPORTS['phrase-index'] = phraseIndexJob;       // params: { docs? | scope?, maxUsd (required), budgetKey } — one indexer at a time   // enrichment on drifted rows a re-ingest would replace

/** Whole-table scans + long index builds: only in the overnight quiet window (Chad 10-11). LANES run side by side, each one
 *  job at a time: phrase indexing never touches the writer, so it need not wait behind a paced re-ingest. */
export const LANES = { index: ['phrase-index'], quick: ['spend', 'languages', 'ctai-audit', 'carry-verify', 'carry-repair', 'block-mismatch', 'retire-duplicates', 'slow-queries'] };
export const HEAVY = new Set(['hollow', 'deletions', 'phrase-coverage', 'block-attrs', 'reingest-impact', 'phrase-index']);
export const inQuietWindow = (d = new Date()) => { const h = d.getHours(); return h >= 22 || h < 7; };   // overnight, 22:00–07:00

export const reportNames = () => Object.keys(REPORTS);
