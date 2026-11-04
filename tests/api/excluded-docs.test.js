// The search exclusion list sends only the excluded docs that still have Qdrant points; none → no filter at all.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeExclusion } from '../../api/lib/search/excluded-docs.js';

// listDocs fake: metadata [5, 8746]; duplicates 1..2500 in pages of 1000 (paged by afterId)
// tag pages: 9001 'Tag: Ahmad of Yazd' (kept), 9002 'The Price Tag' (a book, not kept), 9003 'All tags' (kept)
const TAGS = [{ id: 9001, title: 'Tag: Ahmad of Yazd' }, { id: 9002, title: 'Tag: x' , source_site: 'oceanlibrary.com' }, { id: 9003, title: 'All tags' }];
const listDocs = async ({ role, scope, title, afterId = 0, limit }) => {
  const src = role === 'metadata' ? [5, 8746] : scope === 'duplicates' ? Array.from({ length: 2500 }, (_, i) => i + 1) : [];
  const rows = title ? TAGS.filter((d) => d.title.toLowerCase().startsWith(title.toLowerCase())).map((d) => ({ source_site: 'bahai-library.com', ...d }))
    : src.map((id) => ({ id }));
  const docs = rows.filter((d) => d.id > afterId).slice(0, limit);
  return { docs, next_after_id: docs.length >= limit ? docs[docs.length - 1].id : null };
};

describe('computeExclusion', () => {
  it('reads every page (no silent cut at 1000) and keeps only ids with points', async () => {
    const docPointCounts = vi.fn(async () => ({ phrases: new Map([[8746, 169164]]), hype: new Map(), paragraphs_kw: new Map([[8746, 900], [2400, 3]]) }));
    const r = await computeExclusion({ listDocs, docPointCounts });
    expect(r.excluded).toEqual({ metadata: 2, duplicates: 2500, tag_index: 2, total: 2503 });   // 5 is in both lists
    expect(docPointCounts.mock.calls[0][0]).toHaveLength(2503);
    expect(r.all).toEqual(expect.arrayContaining([9001, 9003]));
    expect(r.all).not.toContain(9002);
    expect(r.sent).toEqual([8746, 2400]);
    expect(r.with_points.by_collection).toEqual({ phrases: { docs: 1, points: 169164 }, hype: { docs: 0, points: 0 }, paragraphs_kw: { docs: 2, points: 903 } });
    expect(r.check).toBe('ok');
  });
  it('no points anywhere → nothing sent', async () => {
    const r = await computeExclusion({ listDocs, docPointCounts: async () => ({ phrases: new Map() }) });
    expect(r.sent).toEqual([]);
    expect(r.all).toHaveLength(2503);
  });
  it('point check failing → the whole list is sent (correct, only slower)', async () => {
    const r = await computeExclusion({ listDocs, docPointCounts: async () => { throw new Error('qdrant down'); } });
    expect(r.sent).toHaveLength(2503);
    expect(r.check).toMatch(/failed: qdrant down/);
  });
});

describe('docPointCounts', () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.QDRANT_HOT_URL; });
  it('facets doc_id in every searched collection + hot; a missing hot collection is empty', async () => {
    process.env.QDRANT_HOT_URL = 'http://hot:6335';
    const fetch = vi.fn(async (url, init) => {
      if (url.startsWith('http://hot')) return { ok: false, status: 404, text: async () => 'nf' };
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ key: 'doc_id', exact: true, filter: { must: [{ key: 'doc_id', match: { any: [7, 9] } }] } });
      return { ok: true, json: async () => ({ result: { hits: url.includes('/phrases/') ? [{ value: 7, count: 12 }] : [] } }) };
    });
    vi.stubGlobal('fetch', fetch);
    const { docPointCounts } = await import('../../api/lib/search/qdrant-layers.js');
    const r = await docPointCounts([7, 9, 7]);
    expect(Object.keys(r)).toEqual(['phrases', 'hype', 'concepts', 'paragraphs_kw', 'phrases_hot']);
    expect(r.phrases.get(7)).toBe(12);
    expect(r.phrases_hot.size).toBe(0);
    expect(fetch.mock.calls.map(([u]) => u.replace(/^http:\/\/[^/]+/, ''))).toContain('/collections/concepts/facet');
  });
});
