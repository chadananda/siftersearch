// The by-language rollup stopped counting every paragraph, so the arithmetic — especially `synced`, which
// is now DERIVED rather than counted — has to be right without a database to lean on.
import { describe, it, expect } from 'vitest';
import { mergeByLanguage } from '../../api/lib/pipeline/snapshot-queries.js';

describe('mergeByLanguage', () => {
  const totals = [
    { language: 'en', doc_count: 130480, paragraph_count: 4828312 },
    { language: 'fa', doc_count: 17285, paragraph_count: 70416 },
  ];

  it('publishes the same shape the snapshot always published', () => {
    const [en] = mergeByLanguage(totals, [{ language: 'en', n: 27197 }], []);
    expect(Object.keys(en).sort()).toEqual(
      ['doc_count', 'language', 'paragraph_count', 'pending_embedding', 'pending_sync', 'synced'].sort());
  });

  it('derives synced as total minus both backlogs', () => {
    const [en] = mergeByLanguage(totals, [{ language: 'en', n: 27197 }], [{ language: 'en', n: 3 }]);
    expect(en.pending_embedding).toBe(27197);
    expect(en.pending_sync).toBe(3);
    expect(en.synced).toBe(4828312 - 27197 - 3);
  });

  it('a language with no backlog rows reads zero, not undefined', () => {
    const [, fa] = mergeByLanguage(totals, [{ language: 'en', n: 5 }], []);
    expect(fa.pending_embedding).toBe(0);
    expect(fa.pending_sync).toBe(0);
    expect(fa.synced).toBe(70416);
  });

  it('CLAMPS synced at zero — a negative count would be nonsense presented as fact', () => {
    // docs.paragraph_count is denormalised; if it under-counts, the subtraction can go negative.
    const [x] = mergeByLanguage([{ language: 'xx', doc_count: 1, paragraph_count: 10 }],
      [{ language: 'xx', n: 40 }], []);
    expect(x.synced).toBe(0);
  });

  it('orders by paragraph_count descending, as before', () => {
    expect(mergeByLanguage(totals, [], []).map((r) => r.language)).toEqual(['en', 'fa']);
  });

  it('survives empty inputs (a failed probe returns [])', () => {
    expect(mergeByLanguage([], [], [])).toEqual([]);
  });
});
