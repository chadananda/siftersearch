import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/repos/integrity-repo.js', () => ({
  hollowDocs: async () => [{ id: 1, source: 'library', rows: 0, with_text: null, empty_rows: 0 }, { id: 2, source: 'library', rows: 10, with_text: 9, empty_rows: 1 }],
  deletionsByDay: async () => [{ day: '2026-10-10', source: 'bahai-library.com', paragraphs: 300 }],
  liveParagraphsByScope: async () => [{ scope: 'primary', religion: "Baha'i", paragraphs: 100 }],
}));
vi.mock('../../api/lib/repos/language-repo.js', () => ({ docLanguageCounts: async () => [{ language: 'en', docs: 5 }, { language: 'En', docs: 2 }] }));
vi.mock('../../api/lib/repos/phrase-store-repo.js', () => ({
  coverageByScope: () => [{ scope: 'primary', religion: "Baha'i", paragraphs: 80 }], monthSpend: () => [{ month: '2026-10', usd: 8 }],
}));
const { REPORTS, reportNames } = await import('../../api/lib/ops/reports.js');

describe('ops reports (server-side)', () => {
  it('names', () => expect(reportNames()).toEqual(['hollow', 'deletions', 'languages', 'phrase-coverage', 'block-attrs']));
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
