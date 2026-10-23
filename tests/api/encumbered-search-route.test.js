// /api/search and /api/search/quick: a copyrighted (encumbered) book cannot be paged out through search (Chad 10-23).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';

const LONG = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
const hits = Array.from({ length: 50 }, (_, i) => ({ id: i, doc_id: 1, paragraph_index: i, text: LONG, title: 'Modern Book' }))
  .concat([{ id: 999, doc_id: 2, paragraph_index: 45, text: LONG, title: 'Gleanings' }]);
vi.mock('../../api/lib/search.js', () => {
  const res = async () => ({ hits: hits.map((h) => ({ ...h })), estimatedTotalHits: hits.length });
  return { getMeili: vi.fn(), hybridSearch: vi.fn(res), keywordSearch: vi.fn(res), semanticSearch: vi.fn(res), getStats: vi.fn(), healthCheck: vi.fn(),
    highlightBestSentence: (h) => ({ excerpt: h.text.slice(0, 50), highlightedExcerpt: h.text.slice(0, 50) }), multiIndexSearch: vi.fn(), getSearchSourceStats: vi.fn() };
});
vi.mock('../../api/lib/repos/rights-repo.js', () => ({ encumberedAmong: vi.fn(async (ids) => new Set(ids.filter((id) => id === 1))) }));
vi.mock('../../api/lib/search-target.js', () => ({ resolveTarget: async () => null, markTarget: () => null }));

let app;
beforeAll(async () => {
  app = Fastify();
  await app.register((await import('../../api/routes/search.js')).default, { prefix: '/api/search' });
  await app.ready();
}, 60_000);
afterAll(async () => { await app?.close(); });
const headers = { origin: 'https://siftersearch.com' };
const words = (s) => String(s).trim().split(/\s+/).length;

describe('search route guard', () => {
  it('scoped to one encumbered book: only hits inside the first 40 paragraphs', async () => {
    const r = (await app.inject({ method: 'POST', url: '/api/search', headers, payload: { query: 'x', limit: 100, filters: { documentId: '1' } } })).json();
    const mine = r.hits.filter((h) => h.doc_id === 1);
    expect(mine).toHaveLength(40);
    expect(Math.max(...mine.map((h) => h.paragraph_index))).toBe(39);
  });
  it('unscoped: past the preview, an encumbered hit is an excerpt; other books whole', async () => {
    const r = (await app.inject({ method: 'POST', url: '/api/search', headers, payload: { query: 'x', limit: 100 } })).json();
    const late = r.hits.find((h) => h.doc_id === 1 && h.paragraph_index === 45);
    expect(late.excerpt).toBe(true);
    expect(words(late.text)).toBeLessThanOrEqual(81);
    expect(r.hits.find((h) => h.doc_id === 2).text).toBe(LONG);
  });
  it('/quick clips the same way', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/search/quick?q=x&limit=50', headers })).json();
    const late = r.hits.find((h) => h.document_id === 1 && h.paragraph_index === 45);
    expect(words(late.text)).toBeLessThanOrEqual(81);
  });
});
