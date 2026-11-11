import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/repos/integrity-repo.js', () => ({
  hollowDocs: async () => [{ id: 1, source: 'library', rows: 0, with_text: null, empty_rows: 0 }, { id: 2, source: 'library', rows: 10, with_text: 9, empty_rows: 1 }],
  deletionsByDay: async () => [{ day: '2026-10-10', source: 'bahai-library.com', paragraphs: 300 }],
  liveParagraphsByDocAuthors: async () => [
    { doc_id: 1, religion: "Baha'i", collection: 'Books', title: 'Lights of Guidance', doc_author: 'Helen Hornby', scope: 'primary', authors: JSON.stringify([{ name: 'Shoghi Effendi', role: 'author' }]), paragraphs: 60 },
    { doc_id: 1, religion: "Baha'i", collection: 'Books', title: 'Lights of Guidance', doc_author: 'Helen Hornby', scope: 'primary', authors: null, paragraphs: 40 },
    { doc_id: 2, religion: 'Islam', collection: 'Books', title: 'Sahih Bukhari', doc_author: 'Bukhari', scope: 'supplemental', authors: null, paragraphs: 20 }],
  liveParagraphsOfDoc: async () => [{ id: 7, len: 40, preview: 'a', authors: null }, { id: 8, len: 3, preview: '۱۲', authors: null }, { id: 9, len: 50, preview: 'b', authors: null }],
}));
vi.mock('../../api/lib/repos/query-health-repo.js', () => ({ slowQueriesByHour: async () => [
  { hour: '2026-10-12 14:00', proc: 'reports', kind: 'write', name: 'ingest', n: 3, worst_ms: 9000 },
  { hour: '2026-10-11 21:00', proc: 'hollow-report.mjs', kind: 'read', name: '', n: 1, worst_ms: 292800 }] }));
vi.mock('../../api/lib/repos/translator-repo.js', () => ({ translatorCoverage: async () => ({ byTranslator: [{ translator: 'Shoghi Effendi', basis: 'book', paragraphs: 5 }], translationBy: [], books: { with_translators: 1, docs: 9 } }) }));
vi.mock('../../api/lib/repos/language-repo.js', () => ({ docLanguageCounts: async () => [{ language: 'en', docs: 5 }, { language: 'En', docs: 2 }] }));
vi.mock('../../api/lib/repos/phrase-store-repo.js', () => ({
  coveredByDocAuthor: () => [{ doc_id: 1, author: 'Shoghi Effendi', paragraphs: 50 }, { doc_id: 1, author: 'Helen Hornby', paragraphs: 30 }, { doc_id: 2, author: 'Bukhari', paragraphs: 25 }], monthSpend: () => [{ month: '2026-10', usd: 8 }], skippedByDocAuthor: () => [{ doc_id: 1, author: 'Shoghi Effendi', paragraphs: 4 }],
  unitsForParagraphs: (ids) => ids.map((id) => ({ id, ...{ 7: { n: 3, docs: '5', fields: 'text', upserted: 3 }, 8: { n: 0, docs: null, fields: null, upserted: null }, 9: { n: 2, docs: '9', fields: 'text', upserted: 0 } }[id] })),
}));
vi.mock('../../api/lib/repos/schema-repo.js', () => ({
  tableSchema: async (table) => ({ table, nrow: '9 3', triggers: [], indexes: [{ name: 'idx_content_doc', columns: ['doc_id'] }, { name: 'idx_content_doc_deleted', columns: ['deleted_at', 'doc_id'] }] }),
  recordedPlans: async () => [{ proc: 'api', name: 'x', sql_sample: 'SELECT … FROM content WHERE doc_id = ?', query_plan: 'SEARCH content USING INDEX idx_content_doc (doc_id=?)' }],
  btreeSize: async (name) => ({ name, bytes: name === 'content' ? 100 : 10 }),
  allTriggers: async () => [{ name: 'trg_docs_count', tbl: 'docs', sql: 'CREATE TRIGGER trg_docs_count AFTER INSERT ON docs BEGIN UPDATE table_counts SET n = n + 1 WHERE t = \'docs\'; INSERT OR REPLACE INTO doc_meta (id) VALUES (NEW.id); END' }],
}));
vi.mock('../../api/lib/repos/ai-usage-repo.js', async (orig) => ({ ...(await orig()), spendByModel: async (days) => [
  { model: 'claude-sonnet-5-5', provider: 'anthropic', calls: 40, usd: 3.5, days }, { model: 'claude-haiku-5-5', provider: 'anthropic', calls: 900, usd: 1.25, days }] }));
const { REPORTS, reportNames } = await import('../../api/lib/ops/reports.js');

describe('ops reports (server-side)', () => {
  // the SET of names (the indexing jobs register as one group from ops/index-reports.js — order carries no meaning)
  it('names', () => expect([...reportNames()].sort()).toEqual(['anis-jev-timeouts', 'anis-precache', 'archive-adopt', 'archive-collection-backfill', 'archive-copy', 'archive-import', 'archive-import-dryrun', 'archive-reprobe', 'archive-sample', 'archive-search', 'bahai-library-writings-authors', 'block-attrs', 'block-mismatch', 'book-author-photo-set', 'book-author-photos', 'book-hunt', 'book-hunt-apply', 'book-meta-coverage', 'carry-repair', 'carry-verify', 'compilation-authors', 'concept-index', 'coverage-refresh', 'ctai-audit', 'ctai-link', 'ctai-originals', 'deletions', 'dewey-archive', 'dewey-completeness', 'dewey-discard', 'dewey-ingest-folder', 'dewey-intake', 'dewey-jobs', 'dewey-ocr', 'dewey-offer-paths', 'dewey-quality', 'dewey-received', 'dewey-reimport', 'dewey-research', 'dewey-retitle', 'dewey-scout', 'dewey-title-check', 'doc-author-restamp', 'doc-corrections', 'doc-overlap', 'doc-twins', 'doctrinal-tier-docs', 'drive-wear', 'episode-extract', 'exclude-ruhi', 'excluded-points-purge', 'hollow', 'hype-bank-seed', 'hype-coverage', 'hype-hot-fold', 'hype-hot-reconcile', 'hype-index', 'hype-program', 'hype-quality', 'index-sizes', 'ingest-files', 'keyword-fill', 'keyword-fill-sites', 'known-item', 'languages', 'letters-index', 'media-archive-import', 'media-asr', 'media-biography-audit', 'media-cloud-capacity', 'media-cloud-order', 'media-cloud-remaster', 'media-compute', 'media-dedupe', 'media-descriptions', 'media-diar', 'media-exclude', 'media-fetch', 'media-find', 'media-gallery', 'media-grade', 'media-greetings', 'media-hint-review', 'media-identity', 'media-item', 'media-ledger-reconcile', 'media-light-backfill', 'media-llm', 'media-meta-fix', 'media-person-apply', 'media-person-review', 'media-playback', 'media-portrait-inventory', 'media-portraits-extend', 'media-preview', 'media-quiet-repair', 'media-quote-audit', 'media-rank', 'media-relink', 'media-remaster', 'media-remaster-decide', 'media-remaster-quality', 'media-remaster-rejudge', 'media-remaster-revert', 'media-remaster-review-pack', 'media-rerun', 'media-restore', 'media-safe-listening', 'media-scan', 'media-short', 'media-shorts-moments', 'media-speaker-merge', 'media-speaker-sketch', 'media-speakers', 'media-stages', 'media-stages-sync', 'media-supersede', 'media-tags-backfill', 'media-talk-identities', 'media-trim-audit', 'media-vocab', 'media-whole-input', 'media-worker-audit', 'metadata-gaps', 'oceanoflights-slug-authors', 'ol-refresh', 'paragraph-authors', 'phrase-coverage', 'phrase-f16-build', 'phrase-gap', 'phrase-hot-fold', 'phrase-hot-reconcile', 'phrase-index', 'pipeline-snapshot', 'premise-pilot', 'premise-reconcile', 'refs-assign', 'reingest-carry', 'reingest-impact', 'retire-duplicates', 'rights-isbn', 'rights-open-publisher', 'rights-publisher', 'section-author', 'section-findability', 'section-index', 'site-religion-default', 'slow-queries', 'slug-metadata', 'source-link-coverage', 'source-links-build', 'spend', 'spend-by-model', 'stale-trailer-authors', 'stamp-site', 'stamp-voices', 'strategy-gaps', 'structure-infer', 'structure-summary', 'table-schema', 'toc-candidates', 'tradition-readiness', 'translator-coverage', 'triggers', 'unsegmented-docs', 'vectors-backup', 'vocab-build', 'work-families', 'write-stats']));
  it('spend-by-model: rows per model with a total; days clamped to 1..365 (model-review.mjs reads it, never ai_usage)', async () => {
    const r = await REPORTS['spend-by-model']({ days: 14 });
    expect(r).toMatchObject({ days: 14, total_usd: 4.75 });
    expect(r.rows.map((x) => [x.model, x.days])).toEqual([['claude-sonnet-5-5', 14], ['claude-haiku-5-5', 14]]);
    expect((await REPORTS['spend-by-model']({ days: 9999 })).days).toBe(365);
    expect((await REPORTS['spend-by-model']()).days).toBe(30);
  });
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
    // covered 50 (core) + 30 (supplemental) + 20 (gray, clamped to its 20 live) = 100 of 120 live; $8 / 100 ¶
    expect(c).toMatchObject({ missing_paragraphs: 16, usd_per_paragraph: 0.08, est_usd_to_finish: 1 });   // 4 core ¶ skipped on purpose (site chrome) = done
    expect(c.by_tier).toEqual({ core: { live: 60, covered: 50, skipped: 4, missing: 6 }, gray: { live: 20, covered: 20, skipped: 0, missing: 0 }, supplemental: { live: 40, covered: 30, skipped: 0, missing: 10 } });
    expect(c.rows[0]).toMatchObject({ religion: "Baha'i", tier: 'core', scope: 'primary' });
    expect(c.rows.find((r) => r.tier === 'gray')).toMatchObject({ religion: 'Islam', scope: 'supplemental' });   // scope = the doc's CURRENT scope
    // per-doc view (author stamp ignored) never reports less coverage than the per-author one; the worst docs carry ids
    expect(c.doc_only.covered).toBeGreaterThanOrEqual(c.covered_paragraphs);
    expect(c.missing_docs).toBe(c.missing_docs_top.length);
    for (const d of c.missing_docs_top) expect(d.live).toBeGreaterThan(d.covered);
  });
  it('phrase-gap: units looked up by point-id block, so a paragraph stamped with another doc is not "no units"', async () => {
    const [g] = (await REPORTS['phrase-gap']({ docs: [9] })).docs;
    expect(g).toMatchObject({ doc: 9, live: 3, with_units: 2, no_units: 1, stamped_other_doc: 1, never_upserted: 1, other_docs: ['5'] });
    expect(g.sample_no_units.map((p) => p.id)).toEqual([8]);
  });
});
