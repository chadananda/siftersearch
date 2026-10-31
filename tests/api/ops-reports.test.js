import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/repos/integrity-repo.js', () => ({
  hollowDocs: async () => [{ id: 1, source: 'library', rows: 0, with_text: null, empty_rows: 0 }, { id: 2, source: 'library', rows: 10, with_text: 9, empty_rows: 1 }],
  deletionsByDay: async () => [{ day: '2026-10-10', source: 'bahai-library.com', paragraphs: 300 }],
  liveParagraphsByScope: async () => [{ scope: 'primary', religion: "Baha'i", paragraphs: 100 }],
}));
vi.mock('../../api/lib/repos/query-health-repo.js', () => ({ slowQueriesByHour: async () => [
  { hour: '2026-10-12 14:00', proc: 'reports', kind: 'write', name: 'ingest', n: 3, worst_ms: 9000 },
  { hour: '2026-10-11 21:00', proc: 'hollow-report.mjs', kind: 'read', name: '', n: 1, worst_ms: 292800 }] }));
vi.mock('../../api/lib/repos/translator-repo.js', () => ({ translatorCoverage: async () => ({ byTranslator: [{ translator: 'Shoghi Effendi', basis: 'book', paragraphs: 5 }], translationBy: [], books: { with_translators: 1, docs: 9 } }) }));
vi.mock('../../api/lib/repos/language-repo.js', () => ({ docLanguageCounts: async () => [{ language: 'en', docs: 5 }, { language: 'En', docs: 2 }] }));
vi.mock('../../api/lib/repos/phrase-store-repo.js', () => ({
  coverageByScope: () => [{ scope: 'primary', religion: "Baha'i", paragraphs: 80 }], monthSpend: () => [{ month: '2026-10', usd: 8 }],
}));
vi.mock('../../api/lib/repos/schema-repo.js', () => ({
  tableSchema: async (table) => ({ table, nrow: '9 3', triggers: [], indexes: [{ name: 'idx_content_doc', columns: ['doc_id'] }, { name: 'idx_content_doc_deleted', columns: ['deleted_at', 'doc_id'] }] }),
  recordedPlans: async () => [{ proc: 'api', name: 'x', sql_sample: 'SELECT … FROM content WHERE doc_id = ?', query_plan: 'SEARCH content USING INDEX idx_content_doc (doc_id=?)' }],
  btreeSize: async (name) => ({ name, bytes: name === 'content' ? 100 : 10 }),
  allTriggers: async () => [{ name: 'trg_docs_count', tbl: 'docs', sql: 'CREATE TRIGGER trg_docs_count AFTER INSERT ON docs BEGIN UPDATE table_counts SET n = n + 1 WHERE t = \'docs\'; INSERT OR REPLACE INTO doc_meta (id) VALUES (NEW.id); END' }],
}));
const { REPORTS, reportNames } = await import('../../api/lib/ops/reports.js');

describe('ops reports (server-side)', () => {
  // the SET of names (the indexing jobs register as one group from ops/index-reports.js — order carries no meaning)
  it('names', () => expect([...reportNames()].sort()).toEqual(['archive-adopt', 'archive-sample', 'block-attrs', 'block-mismatch', 'book-author-photo-set', 'book-author-photos', 'book-hunt', 'book-hunt-apply', 'book-meta-coverage', 'carry-repair', 'carry-verify', 'compilation-authors', 'concept-index', 'coverage-refresh', 'ctai-audit', 'ctai-link', 'ctai-originals', 'deletions', 'dewey-archive', 'dewey-completeness', 'dewey-discard', 'dewey-ingest-folder', 'dewey-intake', 'dewey-jobs', 'dewey-ocr', 'dewey-offer-paths', 'dewey-quality', 'dewey-received', 'dewey-reimport', 'dewey-research', 'dewey-retitle', 'dewey-scout', 'dewey-title-check', 'doc-corrections', 'doc-overlap', 'episode-extract', 'exclude-ruhi', 'hollow', 'hype-coverage', 'hype-index', 'index-sizes', 'ingest-files', 'keyword-fill', 'keyword-fill-sites', 'known-item', 'languages', 'letters-index', 'media-archive-import', 'media-asr', 'media-biography-audit', 'media-cloud-capacity', 'media-cloud-order', 'media-cloud-remaster', 'media-compute', 'media-descriptions', 'media-diar', 'media-exclude', 'media-fetch', 'media-find', 'media-gallery', 'media-grade', 'media-greetings', 'media-hint-review', 'media-identity', 'media-item', 'media-ledger-reconcile', 'media-light-backfill', 'media-llm', 'media-meta-fix', 'media-person-apply', 'media-person-review', 'media-playback', 'media-portrait-inventory', 'media-portraits-extend', 'media-preview', 'media-quiet-repair', 'media-quote-audit', 'media-rank', 'media-relink', 'media-remaster', 'media-remaster-decide', 'media-remaster-quality', 'media-remaster-rejudge', 'media-remaster-revert', 'media-remaster-review-pack', 'media-restore', 'media-safe-listening', 'media-scan', 'media-short', 'media-shorts-moments', 'media-speaker-merge', 'media-speaker-sketch', 'media-speakers', 'media-stages', 'media-stages-sync', 'media-supersede', 'media-tags-backfill', 'media-talk-identities', 'media-trim-audit', 'media-vocab', 'media-whole-input', 'media-worker-audit', 'ol-refresh', 'paragraph-authors', 'phrase-coverage', 'phrase-f16-build', 'phrase-hot-reconcile', 'phrase-index', 'pipeline-snapshot', 'refs-assign', 'reingest-carry', 'reingest-impact', 'retire-duplicates', 'rights-isbn', 'rights-open-publisher', 'rights-publisher', 'section-author', 'section-findability', 'section-index', 'slow-queries', 'source-link-coverage', 'source-links-build', 'spend', 'stamp-site', 'stamp-voices', 'strategy-gaps', 'structure-infer', 'structure-summary', 'table-schema', 'toc-candidates', 'translator-coverage', 'triggers', 'unsegmented-docs', 'vectors-backup', 'vocab-build', 'write-stats']));
  it('table-schema counts plan hits per index by whole name (idx_content_doc is not idx_content_doc_deleted)', async () => {
    const r = await REPORTS['table-schema']();
    expect(r.indexes.map((i) => [i.name, i.plan_hits])).toEqual([['idx_content_doc', 1], ['idx_content_doc_deleted', 0]]);
    expect((await REPORTS['index-sizes']()).total_index_bytes).toBe(20);
  });
  it('triggers: grouped by table, with the tables each one writes', async () => {
    const r = await REPORTS.triggers();
    expect(r.by_table.docs[0]).toMatchObject({ name: 'trg_docs_count', event: 'AFTER INSERT ON', writes: ['UPDATE table_counts', 'INSERT doc_meta'] });
  });
  it('slow-queries totals per process and caller', async () => {
    const r = await REPORTS['slow-queries']();
    expect(r).toMatchObject({ total: 4, by_proc: { 'reports/write ingest': 3, 'hollow-report.mjs/read': 1 } });
  });
  it('hollow splits no-rows / partly-empty', async () => {
    const r = await REPORTS.hollow();
    expect(r.by_source.library).toMatchObject({ hollow_no_rows: 1, docs_with_some_empty_rows: 1, empty_rows: 1 });
  });
  it('languages flags non-normal labels; phrase coverage prices the gap', async () => {
    expect((await REPORTS.languages()).not_normalised.map((r) => r.language)).toEqual(['En']);
    const c = await REPORTS['phrase-coverage']();
    expect(c).toMatchObject({ missing_paragraphs: 20, usd_per_paragraph: 0.1, est_usd_to_finish: 2 });
  });
});
