// qdrantPhraseSearch: the copy check without Meili — BM25 ids from Qdrant, bodies from SQLite, rank order kept.
import { describe, it, expect, vi } from 'vitest';

const calls = [];
vi.mock('../../api/lib/search/qdrant-layers.js', () => ({
  searchKeywordQdrant: vi.fn(async (q, opts) => { calls.push(opts.filters); return q === 'boom' ? Promise.reject(new Error('down')) : { hits: [{ paragraph_id: 9 }, { paragraph_id: 4 }, { paragraph_id: 7 }] }; }),
}));
vi.mock('../../api/lib/paragraphs-repo.js', () => ({
  paragraphsByIds: vi.fn(async (ids) => ids.filter((id) => id !== 7).map((id) => ({ id, doc_id: 1, text: `p${id}` })).reverse()),
}));

describe('qdrantPhraseSearch', () => {
  it('returns SQLite bodies in Qdrant rank order, drops ids SQLite lacks, passes the religion filter', async () => {
    const { qdrantPhraseSearch } = await import('../../api/lib/source-resolve.js');
    expect((await qdrantPhraseSearch('the earth is but one country', { religion: "Baha'i" })).map((p) => p.id)).toEqual([9, 4]);
    expect(calls.at(-1)).toEqual({ religion: "Baha'i" });
    expect(await qdrantPhraseSearch('boom')).toEqual([]);
  });
});
