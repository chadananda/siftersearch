// 10-19: entitySearch scanned and folded entity_claims on every call, ON the serving thread — 10–13 s each, 121× in one
// hour in the search API (docs/architecture/blocking-queries.md). A person search must ask the claim-search worker and
// issue no claims SQL of its own. Fails on the old code (its MATERIALIZED scan ran through db.queryAll).
import { describe, it, expect, vi } from 'vitest';

describe('people search runs off the serving thread', () => {
  it('entitySearch issues no entity_claims SQL — the worker answers', async () => {
    const queries = [];
    vi.doMock('../../api/lib/db.js', () => ({
      queryOne: async (sql) => { queries.push(sql); return null; },
      queryAll: async (sql) => { queries.push(sql); return /FROM docs/.test(sql) ? [{ id: 1, title: 'God Passes By', source_url: null }] : []; },
    }));
    const claimRows = vi.fn(async () => [{ id: 7, name: 'Quddús', imp: 90, statement: 'Quddús — participated-in Badasht conference', relation: 'participated-in', doc_id: 1, para_id: 'p1', rank: 11 }]);
    vi.doMock('../../api/lib/claim-search.js', () => ({ claimRows, warmClaimSearch: () => {} }));
    vi.resetModules();
    const { entitySearch } = await import('../../api/lib/entity-api.js');
    const r = await entitySearch('Badasht conference');
    expect(claimRows).toHaveBeenCalledOnce();
    expect(queries.filter((q) => /entity_claims/.test(q))).toEqual([]);
    expect(r.results[0].name).toBe('Quddús');
  });
});

describe('rankClaims', () => {
  it('any term matches; the whole phrase ranks 10 above scattered terms', async () => {
    const { rankClaims, foldText } = await import('../../api/lib/entity-api.js');
    const rows = ['Quddús — participated-in Badasht conference', 'Ṭáhirih — conference of Badasht', 'Mullá Ḥusayn — visited Mashhad']
      .map((statement, i) => ({ id: i, statement, f: foldText(statement) }));
    const out = rankClaims(rows, ['badasht', 'conference'], 'badasht conference');
    expect(out.map((r) => r.id)).toEqual([0, 1]);
    expect(out[0].rank).toBe(12);
    expect(out[0].f).toBeUndefined();
  });
});
