// Ops reports — the named, server-side answers to "is the library healthy?". Each runs inside siftersearch-reports (never
// the API: they scan whole tables), one at a time, and returns plain JSON stored in ops_report_runs. Add a report here,
// not a script. Deps: integrity-repo, language-repo, phrase-store-repo, language-codes.
import { sectionIndexJob } from './section-index-job.js';
import { keywordFillJob } from './keyword-fill-job.js';
import { episodeExtractJob } from './episode-extract-job.js';
import { refsAssignJob } from './refs-assign-job.js';
import { structureInferJob } from './structure-infer-job.js';
import { coverageRefreshJob } from './coverage-job.js';
import { vocabBuildJob } from './vocab-job.js';
import { deletionsByDay, hollowDocs, liveParagraphsByScope } from '../repos/integrity-repo.js';
import { docLanguageCounts } from '../repos/language-repo.js';
import { coverageByScope, monthSpend } from '../repos/phrase-store-repo.js';
import { normLang } from '../language-codes.js';
import { spendSince } from '../repos/ai-usage-repo.js';
import { blockAttrsJob, blockMismatchReport, reingestImpactReport } from './block-attrs-job.js';
import { ctaiOriginalsJob, ingestFilesJob, ctaiLinkJob } from './ctai-jobs.js';
import { phraseIndexJob } from './phrase-index-job.js';
import { retireDuplicatesJob } from './library-jobs.js';
import { sectionAuthorJob } from './section-author.js';
import { slowQueriesByHour } from '../repos/query-health-repo.js';
import { translatorCoverage } from '../repos/translator-repo.js';
import { auditsSince } from '../repos/audit-store-repo.js';
import { strategyGaps } from '../assistant/admin-threads.js';
import { reingestCarryJob, carryVerifyReport, carryRepairJob } from './carry-job.js';
import { translationAudit, originalAudit } from '../repos/alignment-repo.js';
import { CTAI_DOC_BY_WORK } from '../rag/concepts/ctai.js';

export const REPORTS = {
  /** The Anís audits as a ranked strategy work queue (also /admin/anis#threads). params: { days } */
  async 'strategy-gaps'({ days = 30 } = {}) { return { days, ...strategyGaps(auditsSince(days)) }; },
  /** Who-translated-what coverage (content.translator by basis, translation_by, docs.translators). */
  async 'translator-coverage'() {
    const r = await translatorCoverage();
    return { paragraphs_with_translator: r.byTranslator.reduce((n, x) => n + x.paragraphs, 0), ...r };
  },
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
REPORTS['section-author'] = sectionAuthorJob;       // params: { docId, from, to, name, apply? } — dry run by default
REPORTS['retire-duplicates'] = retireDuplicatesJob;   // params: { pairs:[{dup,keep,reason}], batch?, apply? } — dry run by default
REPORTS['phrase-index'] = phraseIndexJob;       // params: { docs? | scope?, maxUsd (required), budgetKey } — one indexer at a time   // enrichment on drifted rows a re-ingest would replace
// HyPE questions and concept claims each have their OWN vector store + collection, so they index beside the phrase build
REPORTS['hype-index'] = (p = {}) => phraseIndexJob({ ...p, field: 'hype' });
REPORTS['concept-index'] = (p = {}) => phraseIndexJob({ ...p, field: 'concepts' });
// HyPE coverage of a tradition (params { religion? }): paragraphs none / older version / current, by scope × language
REPORTS['hype-coverage'] = async ({ religion = "Baha'i" } = {}) => {
  const [{ hypeCoverage }, { HYPE_VERSION }] = await Promise.all([import('../repos/enrichment-repo.js'), import('../rag/enrich/retrieval.js')]);
  const rows = await hypeCoverage({ religion, current: HYPE_VERSION });
  const tot = (state) => rows.filter((r) => r.state === state).reduce((n, r) => n + r.paragraphs, 0);
  return { religion, version: HYPE_VERSION, totals: { none: tot('none'), older: tot('older'), current: tot('current') }, rows };
};
// KNOWN-ITEM test (priority 1, Chad 10-16): can each retrieval layer find a real paragraph from its own fragment?
// params { perBucket?, words?, religions? } — ~2 searches/s; costs a few cents of query embeddings.
REPORTS['known-item'] = async ({ perBucket = 5, coreWeight = 3, depth = 30, variants, religions } = {}) => {
  const [{ knownItemTest }, repo, search, q, { roleCreate }] = await Promise.all([import('./known-item.js'), import('../repos/retrieval-eval-repo.js'),
    import('../search.js'), import('../search/qdrant-layers.js'), import('../role-client.js')]);
  const ids = (hits) => (hits || []).map((h) => h.paragraph_id ?? h.id);
  const { plannedSearch, qdrantOption } = await import('../planned-search.js');
  const qd = qdrantOption(undefined);
  const all = ["Baha'i", 'Islam', 'Christian', 'Judaism', 'Buddhist', 'Hindu', 'Zoroastrian', 'Tao', 'Confucian', 'Sikh', 'Jain'];
  // a reader's half-memory of the passage (Chad: "two or three, often misspelled, often one semantically correct and two
  // literally correct") — written by Haiku from the passage itself
  const recall = async (text) => {
    // Haiku 5.5 reasons before it answers on this endpoint: 40 tokens returned '' (finish 'length') for 161 of 166 passages
    const r = await roleCreate('eval-recall', { max_tokens: 600, temperature: 0.9, messages: [
      { role: 'system', content: 'You simulate a reader who half-remembers a passage and types it into a search box. Reply with ONLY the search words: 2 to 4 words in the passage\'s own language — two copied literally from the passage, one replaced by a word of similar meaning that is NOT in the passage; one may be misspelled. No quotes, no explanation.' },
      { role: 'user', content: text }] });
    return String(r.choices?.[0]?.message?.content || '').replace(/["“”«»]/g, '').trim().split('\n')[0].slice(0, 80) || null;
  };
  const { logActivity } = await import('../repos/activity-repo.js');
  return knownItemTest({ perBucket, coreWeight, depth, ...(variants ? { variants } : {}) }, { religions: religions || all, ...repo, recall,
    log: (line) => logActivity('probe', line), layers: {
    meili_keyword: async (t, n) => ids((await search.keywordSearch(t, { limit: n })).hits),
    qdrant_keyword: async (t, n) => ids((await q.searchKeywordQdrant(t, { limit: n })).hits),
    qdrant_phrase: async (t, n) => ids((await q.searchPhrases(t, { limit: n })).hits),
    engine: async (t, n) => ids((await search.multiIndexSearch(t, { limit: n, includeMatchedHype: true, phraseLayer: qd.phrase, qdrantKeyword: qd.keyword,
      qdrantHype: qd.hype, ...(qd.only ? { meili: false } : {}) })).hits),
    production: async (t, n) => ids((await plannedSearch(t, { limit: n, qdrant: qd })).hits),
  } });
};
REPORTS['vocab-build'] = vocabBuildJob;   // params { minFreq?, maxWords? } — the library vocabulary for query spell-correction
REPORTS['coverage-refresh'] = coverageRefreshJob;   // params: { ids? | limit? } — re-measure docs into index_coverage
REPORTS['keyword-fill'] = keywordFillJob;     // params: { ids?, limit?, scope?, significant? } — BM25 gaps from the ledger, core first (Chad 10-16)
REPORTS['keyword-fill-sites'] = (params = {}) => keywordFillJob({ ...params, scope: 'supplemental' });   // heavy lane: it scans for site page chrome
REPORTS['episode-extract'] = episodeExtractJob;   // params: { doc, titles?, limit? } — a predigested history's episodes (Chad 10-17)
REPORTS['refs-assign'] = refsAssignJob;   // params: { doc, scheme, dry? } — traditional numbering, checked against the work's totals (Chad 10-17)
REPORTS['structure-infer'] = structureInferJob;   // params: { ids? | candidates?, limit?, dry? } — structure for books that do not mark it (Chad 10-17)
REPORTS['section-index'] = sectionIndexJob;
// Can a section be found by its own title? A fixed sample (same sections every run) searched on BM25 alone; a hit is a
// paragraph inside the section (Chad 10-17: structure before BM25 "so that sections get indexed") — before/after measure.
REPORTS['section-findability'] = async ({ n = 300, k = 10 } = {}) => {
  const { sectionSample, paragraphPlaces } = await import('../repos/sections-repo.js');
  const { searchKeywordQdrant } = await import('../search/qdrant-layers.js');
  const sample = await sectionSample(n);
  let at1 = 0, atK = 0;
  const misses = [];
  for (const s of sample) {
    const hits = (await searchKeywordQdrant(s.title, { limit: k }).catch(() => ({ hits: [] }))).hits || [];
    const places = new Map((await paragraphPlaces(hits.map((h) => h.paragraph_id ?? h.id))).map((p) => [p.id, p]));
    const rank = hits.findIndex((h) => { const p = places.get(Number(h.paragraph_id ?? h.id)); return p && p.doc_id === s.doc_id && p.paragraph_index >= s.start_index && p.paragraph_index <= s.end_index; });
    if (rank === 0) at1++;
    if (rank >= 0) atK++; else if (misses.length < 15) misses.push(`${s.doc_id} · ${s.title}`);
  }
  return { sections: sample.length, at1, atK, pct_at1: +(100 * at1 / Math.max(1, sample.length)).toFixed(1), pct_atK: +(100 * atK / Math.max(1, sample.length)).toFixed(1), k, misses };
};
REPORTS['toc-candidates'] = async (p = {}) => (await import('../repos/sections-repo.js')).tocCandidates(p);   // books whose own Contents page is not yet structure
REPORTS['structure-summary'] = async () => (await import('../repos/sections-repo.js')).structureSummary();   // where structure was found vs must be inferred (Chad 10-17)     // params: { ids?, limit? } — sub-documents from stored headings (Chad 10-15)

/** LANES run side by side, each one job at a time. NO TIME-OF-DAY GATE (Chad 10-14: "If we are feeding out to the world,
 *  there is no day or night. The rule is to ingest correctly so as to not block queries"): heavy work is kept from
 *  blocking queries by PACING (paged reads, paced writes, low OS priority) and by never running two at once — the
 *  `heavy` lane — not by waiting for 22:00. Heavy scans also no longer wait behind multi-day ingest in the main lane. */
export const LANES = { index: ['phrase-index'], index2: ['hype-index', 'concept-index', 'section-index', 'episode-extract', 'structure-infer'],
  heavy: ['hollow', 'deletions', 'phrase-coverage', 'hype-coverage', 'vocab-build', 'block-attrs', 'reingest-impact', 'keyword-fill-sites', 'toc-candidates'],
  coverage: ['coverage-refresh'],
  keyword: ['keyword-fill'],   // its own lane: BM25 writes Qdrant on /fast, so it does not queue behind phrase indexing on /crutch
  quick: ['spend', 'languages', 'ctai-audit', 'carry-verify', 'carry-repair', 'block-mismatch', 'retire-duplicates', 'section-author', 'slow-queries', 'translator-coverage', 'strategy-gaps', 'structure-summary', 'refs-assign', 'section-findability'] };
export const HEAVY = new Set(LANES.heavy);
// How many jobs a lane runs AT ONCE (default 1). Phrase indexing was tried at 3 (10-16) and MEASURED WORSE: ~91K
// phrases/h for all three vs ~142K/h for one, because the interim /crutch SSD (Kingston A400, no TRIM) saturated —
// 82% util, 667 ms write latency. Revisit on the 4TB NVMe. Override with OPS_LANE_WORKERS='{"index":2}'.
export const LANE_WORKERS = { index: 1, ...(() => { try { return JSON.parse(process.env.OPS_LANE_WORKERS || '{}'); } catch { return {}; } })() };

export const reportNames = () => Object.keys(REPORTS);
