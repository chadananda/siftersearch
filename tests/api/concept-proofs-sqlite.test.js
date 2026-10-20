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
