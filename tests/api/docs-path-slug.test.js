// Library-page slug fallback (10-20): it read EVERY docs row on the API main thread when a stale URL missed (31.9 s
// cold, gateway timeouts). docsForPathSlugs narrows by collection name first and never selects the whole table.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const seen = [];
const DOCS = [
  { id: 1, religion: "Bahá'í", collection: 'Foundational Texts' },
  { id: 2, religion: 'Islam', collection: 'Foundational Texts' },
  { id: 3, religion: "Bahá'í", collection: 'Pilgrim Notes' },
];
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(), queryOne: vi.fn(),
  queryAll: vi.fn(async (sql, params) => {
    seen.push(sql);
    if (/SELECT DISTINCT collection FROM docs/.test(sql)) return [...new Set(DOCS.map((d) => d.collection))].map((collection) => ({ collection }));
    if (/collection IN \(/.test(sql)) return DOCS.filter((d) => params.includes(d.collection));
    return DOCS;
  }),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { docsForPathSlugs, _resetCollectionNames } = await import('../../api/lib/docs-repo.js');
const { slugifyPath } = await import('../../api/lib/slug.js');

describe('docsForPathSlugs', () => {
  beforeEach(() => { seen.length = 0; _resetCollectionNames(); });
  it('returns only docs whose religion and collection slugify to the URL', async () => {
    const r = await docsForPathSlugs(slugifyPath("Bahá'í"), slugifyPath('Foundational Texts'), slugifyPath);
    expect(r.map((d) => d.id)).toEqual([1]);
  });
  it('never reads the whole docs table', async () => {
    await docsForPathSlugs(slugifyPath("Bahá'í"), slugifyPath('Foundational Texts'), slugifyPath);
    for (const sql of seen) expect(/collection IN \(|DISTINCT collection/.test(sql)).toBe(true);
  });
  it('unknown collection → no row read at all', async () => {
    expect(await docsForPathSlugs('bahai', 'no-such-shelf', slugifyPath)).toEqual([]);
    expect(seen.filter((s) => /collection IN/.test(s))).toHaveLength(0);
  });
});

describe('canonicalForPage', () => {
  it('a duplicate that holds the slug yields to its canonical; a canonical stays', async () => {
    const { canonicalForPage } = await import('../../api/lib/docs-repo.js');
    const get = async (id, { follow }) => (follow && id === 16278 ? { id: 20880, title: 'Bahá’í Administration' } : null);
    expect((await canonicalForPage({ id: 16278, duplicate_of: 20880 }, ['id'], { get })).id).toBe(20880);
    expect((await canonicalForPage({ id: 20880, duplicate_of: null }, ['id'], { get })).id).toBe(20880);
  });
});
