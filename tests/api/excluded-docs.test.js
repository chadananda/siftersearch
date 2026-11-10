// The search exclusion list sends only the excluded docs that still have Qdrant points; none → no filter at all.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import Database from 'better-sqlite3';
import { computeExclusion, isTagIndex, TAG_INDEX_SQL, INDEXABLE_DOC_SQL, refresh, excludedDocIds, _resetShared } from '../../api/lib/search/excluded-docs.js';
import { mkdtempSync, writeFileSync as wf, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.QDRANT_HOT_URL; delete process.env.QDRANT_HOT_HYPE; });
  it('facets doc_id in every searched collection + hot; a missing hot collection is empty', async () => {
    process.env.QDRANT_HOT_URL = 'http://hot:6335'; process.env.QDRANT_HOT_HYPE = 'hype_hot';
    const fetch = vi.fn(async (url, init) => {
      if (url.startsWith('http://hot')) return { ok: false, status: 404, text: async () => 'nf' };
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ key: 'doc_id', exact: true, filter: { must: [{ key: 'doc_id', match: { any: [7, 9] } }] } });
      return { ok: true, json: async () => ({ result: { hits: url.includes('/phrases/') ? [{ value: 7, count: 12 }] : [] } }) };
    });
    vi.stubGlobal('fetch', fetch);
    const { docPointCounts } = await import('../../api/lib/search/qdrant-layers.js');
    const r = await docPointCounts([7, 9, 7]);
    expect(Object.keys(r)).toEqual(['phrases', 'hype', 'concepts', 'paragraphs_kw', 'phrases_hot', 'hype_hot']);
    expect(r.phrases.get(7)).toBe(12);
    expect(r.phrases_hot.size).toBe(0);
    expect(r.hype_hot.size).toBe(0);
    expect(fetch.mock.calls.map(([u]) => u.replace(/^http:\/\/[^/]+/, ''))).toContain('/collections/concepts/facet');
  });
});

// Indexers skip what search excludes (11-04): otherwise purged points come back on the next build.
describe('indexers skip excluded docs', () => {
  const TITLES = ['Tag: Ahmad of Yazd', 'TAG: x', 'tag:x', 'All tags', 'All tags: A–C', 'all tags (2)', 'All tagsets', 'The Price Tag', 'Tags of the Dawn', '', null];
  const db = () => {
    const d = new Database(':memory:');
    d.exec('CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, source_site TEXT, duplicate_of INTEGER, doc_role TEXT)');
    return d;
  };
  it('TAG_INDEX_SQL answers exactly as isTagIndex', () => {
    const d = db(), ins = d.prepare('INSERT INTO docs (id, title, source_site) VALUES (?, ?, ?)');
    let id = 0; const rows = [];
    for (const site of ['bahai-library.com', 'oceanlibrary.com', null]) for (const title of TITLES) { ins.run(++id, title, site); rows.push({ id, title, source_site: site }); }
    const sql = new Set(d.prepare(`SELECT d.id FROM docs d WHERE ${TAG_INDEX_SQL}`).all().map((r) => r.id));
    for (const r of rows) expect([r.title, r.source_site, sql.has(r.id)]).toEqual([r.title, r.source_site, isTagIndex(r)]);
    expect(sql.size).toBe(5);   // 'Tag: …', 'TAG: x', 'All tags', 'All tags: A–C', 'all tags (2)' — on bahai-library.com only
  });
  it('INDEXABLE_DOC_SQL drops retired duplicates and tag pages; keeps the metadata doc and ordinary docs', () => {
    const d = db();
    d.exec(`INSERT INTO docs VALUES (1, 'A book', NULL, NULL, NULL), (2, 'A copy', NULL, 1, NULL), (3, 'Tag: Ahmad of Yazd', 'bahai-library.com', NULL, NULL),
      (8746, 'Partial Inventory', NULL, NULL, 'metadata'), (5, 'An essay', 'bahai-library.com', NULL, NULL)`);
    expect(d.prepare(`SELECT d.id FROM docs d WHERE ${INDEXABLE_DOC_SQL} ORDER BY d.id`).all().map((r) => r.id)).toEqual([1, 5, 8746]);
  });
  it('every Qdrant indexer reads its rows through INDEXABLE_DOC_SQL', () => {
    for (const f of ['scripts/phrase-index/indexer.mjs', 'scripts/phrase-index/keyword-index.mjs', 'api/lib/repos/keyword-repo.js']) {
      const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
      expect([f, /AND \$\{INDEXABLE_DOC_SQL\}/.test(src)]).toEqual([f, true]);
    }
    // the phrase indexer's upsert also withholds stored units of those docs (units stored before the doc was retired)
    expect(readFileSync(new URL('../../scripts/phrase-index/indexer.mjs', import.meta.url), 'utf8')).toMatch(/duplicate_of IS NOT NULL OR \$\{TAG_INDEX_SQL\}/);
  });
});

describe('shared refresh (one process computes; the rest adopt the file)', () => {
  const pts = () => vi.fn(async () => ({ phrases: new Map([[8746, 10]]) }));
  it('computes once, writes the file; a second process adopts it with no Qdrant call', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'excl-')), 'x.json');
    _resetShared(f);
    const a = pts();
    await refresh({ listDocs, docPointCounts: a });
    expect(a).toHaveBeenCalledTimes(1);
    expect(existsSync(f)).toBe(true);
    expect(existsSync(`${f}.lock`)).toBe(false);
    _resetShared(f);
    const b = pts();
    await refresh({ listDocs, docPointCounts: b });
    expect(b).not.toHaveBeenCalled();
    expect(excludedDocIds()).toEqual([8746]);
  });
  it('lock held by another process -> no Qdrant call, keeps a stale shared list', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'excl-')), 'x.json');
    wf(f, JSON.stringify({ refreshed_at: new Date(Date.now() - 3600e3).toISOString(), all: [1, 8746], sent: [8746] }));
    wf(`${f}.lock`, '');
    _resetShared(f);
    const c = pts();
    await refresh({ listDocs, docPointCounts: c });
    expect(c).not.toHaveBeenCalled();
    expect(excludedDocIds()).toEqual([8746]);
  });
});
