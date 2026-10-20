// 10-20 (Chad: retire Meilisearch): the concept layer reads the lexicon from SQLite into memory — no Meili. A named
// symbol returns its proof paragraph, authority tier first; an unnamed one returns nothing.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/search.js', () => ({ getMeili: () => { throw new Error('Meilisearch must not be called'); }, INDEXES: {} }));

describe('concept layer without Meilisearch', () => {
  it('loads the lexicon from rows and resolves proofs; search uses no Meili', async () => {
    const { loadLexicon, searchConceptProofs } = await import('../../api/lib/search/concepts.js');
    const entries = await loadLexicon({
      rows: [
        { id: 1, symbol: 'the sun', interpretation: 'the Manifestation', authority: "Bahá'u'lláh", authority_tier: 1, proof_doc_id: 9, proof_para_id: 'para_2', proof_verbatim: 'the sun of truth' },
        { id: 2, symbol: 'the clouds', interpretation: 'human limitations', authority: "Bahá'u'lláh", authority_tier: 1, proof_doc_id: 9, proof_para_id: 'para_3', proof_verbatim: 'the clouds' },
      ],
      rowsOf: async () => [{ id: 102, text: 'Behold the sun of truth', block_attrs: '{"id":"para_2"}' }, { id: 103, text: 'the clouds that obscure', block_attrs: '{"id":"para_3"}' }],
    });
    const r = await searchConceptProofs({}, 'what does the sun symbolise', { entries });
    expect(r.hits.map((h) => h.concept.symbol)).toEqual(['the sun']);
    expect(r.hits[0].paragraph_id).toBeTruthy();
    expect((await searchConceptProofs({}, 'what is love', { entries })).hits).toEqual([]);
  });
});

describe('lexicon load never blocks the event loop (10-20 outage)', () => {
  it('resolves 3,000 entries over a 3,000-row book quickly and yields', async () => {
    const { loadLexicon } = await import('../../api/lib/search/concepts.js');
    const book = Array.from({ length: 3000 }, (_, i) => ({ id: 1000 + i, text: `paragraph number ${i} about the sun and the moon ${i}`, block_attrs: `{"id":"para_${i}"}` }));
    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: i, symbol: `s${i}`, interpretation: 'x', authority: 'a', authority_tier: 1, proof_doc_id: 9, proof_para_id: `para_${i}`, proof_verbatim: `paragraph number ${i} about` }));
    let ticks = 0; const t = setInterval(() => { ticks++; }, 0);
    const t0 = Date.now();
    const out = await loadLexicon({ rows, rowsOf: async () => book });
    clearInterval(t);
    expect(out[2999].paragraph_id).toBe(3999);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(ticks).toBeGreaterThan(0);
  });
});
