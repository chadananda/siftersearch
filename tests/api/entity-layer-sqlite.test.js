// 10-20 (Chad: retire Meilisearch): the entity layer reads mentions from SQLite, ranks by the paragraph author's
// authority, and never touches Meilisearch.
import { describe, it, expect } from 'vitest';
import { searchByEntity } from '../../api/lib/search/entity.js';

describe('entity layer without Meilisearch', () => {
  it('ranks mentions by authority and passes filters through', async () => {
    let got = null;
    const mentions = async (ids, f) => { got = { ids, f }; return [
      { mention_id: 1, entity_id: 7, paragraph_id: 10, role: 'subject', entity_canonical_name: 'Quddús', doc_id: 1, religion: "Baha'i", author: 'Nabíl', title: 'The Dawn-Breakers', encumbered: 0 },
      { mention_id: 2, entity_id: 7, paragraph_id: 11, role: 'subject', entity_canonical_name: 'Quddús', doc_id: 2, religion: "Baha'i", author: 'Shoghi Effendi', title: 'God Passes By', encumbered: 0 },
    ]; };
    const r = await searchByEntity({ mentions, getAuthority: ({ author }) => (author === 'Shoghi Effendi' ? 9 : 6) }, [7], { limit: 5, filters: { religion: "Baha'i", encumbered: false } });
    expect(r.hits.map((h) => h.paragraph_id)).toEqual([11, 10]);
    expect(got.f).toMatchObject({ religion: "Baha'i", notEncumbered: true });
  });
});
