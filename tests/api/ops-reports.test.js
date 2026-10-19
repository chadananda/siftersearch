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
const { REPORTS, reportNames } = await import('../../api/lib/ops/reports.js');

describe('ops reports (server-side)', () => {
  it('names', () => expect(reportNames()).toEqual(['strategy-gaps', 'translator-coverage', 'slow-queries', 'hollow', 'deletions', 'languages', 'phrase-coverage', 'ctai-audit', 'spend', 'block-attrs', 'block-mismatch', 'reingest-impact', 'ctai-originals', 'ingest-files', 'ctai-link', 'carry-verify', 'carry-repair', 'reingest-carry', 'section-author', 'retire-duplicates', 'phrase-index', 'hype-index', 'concept-index', 'hype-coverage', 'known-item', 'vocab-build', 'coverage-refresh', 'keyword-fill', 'keyword-fill-sites', 'episode-extract', 'refs-assign', 'structure-infer', 'dewey-research', 'dewey-ingest-folder', 'dewey-reimport', 'dewey-offer-paths', 'dewey-title-check', 'dewey-retitle', 'dewey-scout', 'dewey-completeness', 'dewey-quality', 'dewey-archive', 'dewey-ocr', 'dewey-intake', 'section-index', 'section-findability', 'toc-candidates', 'structure-summary']));
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
