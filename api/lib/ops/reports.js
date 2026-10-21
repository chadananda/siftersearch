// Ops reports — the named, server-side answers to "is the library healthy?". Each runs inside siftersearch-reports (never
// the API: they scan whole tables), one at a time, and returns plain JSON stored in ops_report_runs. Add a report here,
// not a script. Deps: integrity-repo, language-repo, phrase-store-repo, language-codes.
import { keywordFillJob } from './keyword-fill-job.js';
import { episodeExtractJob } from './episode-extract-job.js';
import { refsAssignJob } from './refs-assign-job.js';
import { structureInferJob } from './structure-infer-job.js';
import { deweyResearchJob } from './dewey-research-job.js';
import { deweyIntakeJob } from './dewey-intake-job.js';
import { deweyIngestFolderJob } from './dewey-ingest-folder-job.js';
import { deweyOcrJob } from './dewey-ocr-job.js';
import { deweyArchiveJob } from './dewey-archive-job.js';
import { deweyQualityJob } from './dewey-quality-job.js';
import { deweyCompletenessJob } from './dewey-completeness-job.js';
import { deweyScoutJob } from './dewey-scout-job.js';
import { deweyRetitleJob } from './dewey-retitle-job.js';
import { deweyTitleCheckJob } from './dewey-title-check-job.js';
import { deweyOfferPathsJob } from './dewey-offer-paths-job.js';
import { unsegmentedDocsJob } from './unsegmented-docs-job.js';
import { deweyReimportJob } from './dewey-reimport-job.js';
import { vocabBuildJob } from './vocab-job.js';
import { deletionsByDay, hollowDocs, liveParagraphsByScope } from '../repos/integrity-repo.js';
import { docLanguageCounts } from '../repos/language-repo.js';
import { coverageByScope, monthSpend } from '../repos/phrase-store-repo.js';
import { normLang } from '../language-codes.js';
import { spendSince } from '../repos/ai-usage-repo.js';
import { blockAttrsJob, blockMismatchReport, reingestImpactReport } from './block-attrs-job.js';
import { ctaiOriginalsJob, ingestFilesJob, ctaiLinkJob } from './ctai-jobs.js';
import { INDEX_REPORTS, INDEX_LANES, INDEX_JOB_NAMES } from './index-reports.js';
import { paragraphAuthorsJob } from './paragraph-authors-job.js';
import { compilationAuthorsJob } from './compilation-authors-job.js';
import { docCorrectionsJob } from './doc-corrections-job.js';
import { lettersIndexJob } from './letters-index-job.js';
import { sourceLinksBuildJob } from './source-links-build-job.js';
export { INDEX_LANES, INDEX_JOB_NAMES };
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
REPORTS['ingest-files'] = ingestFilesJob;       // params: { paths?, ids?, reparse? } — ingest in the ops worker
REPORTS['ctai-link'] = ctaiLinkJob;             // 1:1 content_alignment by align
REPORTS['carry-verify'] = carryVerifyReport;     // params: { ids, backup? } — enrichment before vs after
REPORTS['carry-repair'] = carryRepairJob;       // params: { ids } — re-apply the carry from the backup
REPORTS['reingest-carry'] = reingestCarryJob;   // params: { ids } — re-ingest + carry enrichment to the new rows (backup first)
REPORTS['section-author'] = sectionAuthorJob;       // params: { docId, from, to, name, apply? } — dry run by default
REPORTS['retire-duplicates'] = retireDuplicatesJob;   // params: { pairs:[{dup,keep,reason}], batch?, apply? } — dry run by default
// HyPE coverage of a tradition (params { religion? }): paragraphs none / older version / current, by scope × language
REPORTS['hype-coverage'] = async ({ religion = "Baha'i" } = {}) => {
  const [{ hypeCoverage }, { HYPE_VERSION }] = await Promise.all([import('../repos/enrichment-repo.js'), import('../rag/enrich/retrieval.js')]);
  const rows = await hypeCoverage({ religion, current: HYPE_VERSION });
  const tot = (state) => rows.filter((r) => r.state === state).reduce((n, r) => n + r.paragraphs, 0);
  return { religion, version: HYPE_VERSION, totals: { none: tot('none'), older: tot('older'), current: tot('current') }, rows };
};
// SOURCE-LINK COVERAGE (planning/citation-links-plan.md, Chad 10-21): per compilation, how many of the paragraphs voicing
// Bahá'u'lláh, the Báb, 'Abdu'l-Bahá and Shoghi Effendi already link to their source. params { collectionLike?, docIds? }
REPORTS['source-link-coverage'] = async (params = {}) => {
  const { sourceLinkCoverage, WRITER_LIKE } = await import('../repos/source-links-repo.js');
  const rows = await sourceLinkCoverage(params);
  const tot = Object.fromEntries(Object.keys(WRITER_LIKE).map((w) => [w, rows.reduce((a, r) => ({ paras: a.paras + r.writers[w].paras, linked: a.linked + r.writers[w].linked }), { paras: 0, linked: 0 })]));
  return { docs: rows.length, totals: tot, worst: rows.map((r) => ({ ...r, gap: Object.values(r.writers).reduce((n, w) => n + w.paras - w.linked, 0) })).sort((a, b) => b.gap - a.gap).slice(0, 60) };
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
REPORTS['keyword-fill-sites'] = (params = {}) => keywordFillJob({ ...params, scope: 'supplemental' });   // heavy lane: it scans for site page chrome
REPORTS['episode-extract'] = episodeExtractJob;   // params: { doc, titles?, limit? } — a predigested history's episodes (Chad 10-17)
REPORTS['refs-assign'] = refsAssignJob;   // params: { doc, scheme, dry? } — traditional numbering, checked against the work's totals (Chad 10-17)
REPORTS['structure-infer'] = structureInferJob;   // params: { ids? | candidates?, limit?, dry? } — structure for books that do not mark it (Chad 10-17)
REPORTS['dewey-research'] = deweyResearchJob;   // params: { id } — research a wanted work: ISBN, publisher, cover (Chad 10-17)
REPORTS['dewey-ingest-folder'] = deweyIngestFolderJob;   // params: { batch?, round? } — the ingest folder, a few at a time, easiest first
REPORTS['dewey-reimport'] = deweyReimportJob;   // params: { docs?, all?, limit? } — re-read from the archive with today's cleaner, same document
REPORTS['unsegmented-docs'] = unsegmentedDocsJob;   // params: { minChars? } — documents holding a whole-book 'paragraph': the re-ingest list (read-only)
REPORTS['dewey-offer-paths'] = deweyOfferPathsJob;   // params: { paths } — files a folder sweep found missing → offers on /dewey (never imported unasked)
REPORTS['dewey-title-check'] = deweyTitleCheckJob;   // params: { titles: [{ title, author? }] } — the title index against the real library (read-only)
REPORTS['dewey-retitle'] = deweyRetitleJob;   // params: { limit? } — real titles for imports titled from unreadable pages (read-only proposals)
REPORTS['dewey-scout'] = deweyScoutJob;   // params: { list, collections?, religion?, limit? } — find works the library lacks and a copy of each (planning/dewey-scouts-plan.md)
REPORTS['dewey-completeness'] = deweyCompletenessJob;   // params: { since? } — imported PDFs that are only the beginning (read-only)
REPORTS['dewey-quality'] = deweyQualityJob;     // params: { limit?, since? } — every Dewey import inspected, worst first, causes tallied
REPORTS['dewey-archive'] = deweyArchiveJob;     // one pass: every decided source onto the NAS archive, ingest copies out of Dropbox
REPORTS['dewey-ocr'] = deweyOcrJob;             // params: { id } — a scan's final text from SearchLayerPDF, checked
REPORTS['source-links-build'] = sourceLinksBuildJob;   // params { docIds?, limit, write } — compilation quotes of the Central Figures / Shoghi Effendi → their source (SourceHunt)
REPORTS['letters-index'] = lettersIndexJob;   // params { author, collection } — an author's letters (books, chapters, dated messages) for the letter lookup
REPORTS['doc-corrections'] = docCorrectionsJob;   // params { fixes: [{ id, author?, translators? }], write } — a person's record corrections
REPORTS['compilation-authors'] = compilationAuthorsJob;   // params { write } — library records crediting a compilation to its first contributor
REPORTS['paragraph-authors'] = paragraphAuthorsJob;   // params { religion, ids?, write, limit?, concurrency, outDir } — every paragraph its author (Chad 10-19)
REPORTS['dewey-intake'] = deweyIntakeJob;       // params: { id } — its attached source → library document → the automatic index chain
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
// the INDEXING jobs belong to siftersearch-indexer (index-reports.js): in this registry for queueing, never in these lanes
Object.assign(REPORTS, INDEX_REPORTS);
export const LANES = { extract: ['episode-extract', 'structure-infer'],
  heavy: ['hollow', 'deletions', 'phrase-coverage', 'hype-coverage', 'source-link-coverage', 'vocab-build', 'block-attrs', 'reingest-impact', 'keyword-fill-sites', 'toc-candidates'],
  intake: ['dewey-intake', 'dewey-ingest-folder', 'dewey-archive', 'dewey-reimport', 'dewey-offer-paths'],   // a book Chad is waiting on does not queue behind hours of indexing
  ocr: ['dewey-ocr'],   // SearchLayerPDF: hours of waiting on GPUs must not hold up text intake
  scout: ['dewey-scout'],
  authorship: ['paragraph-authors'],
  linking: ['source-links-build'],   // hours of hunting must not hold up the quick lane or intake   // hours of classification must not hold up intake or the quick lane   // hours of polite searching and downloading must not hold up intake or OCR
  quick: ['spend', 'languages', 'ctai-audit', 'carry-verify', 'carry-repair', 'block-mismatch', 'retire-duplicates', 'section-author', 'slow-queries', 'translator-coverage', 'strategy-gaps', 'structure-summary', 'refs-assign', 'section-findability', 'dewey-research', 'dewey-retitle', 'dewey-title-check'] };
export const HEAVY = new Set(LANES.heavy);
export { LANE_WORKERS } from './lane-workers.js';

export const reportNames = () => Object.keys(REPORTS);
