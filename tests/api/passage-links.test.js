// passage-links: translation / quote→source→original resolution and English-text → original lookup (CTAI, 2026-09-30).
// Pattern: in-memory better-sqlite3 behind a mocked db.js.
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';

const rawDb = new Database(':memory:');
rawDb.exec(`
  CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT,
    source_url TEXT, metadata TEXT, slug TEXT, filename TEXT, deleted_at TEXT);
  CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraph_index INTEGER, text TEXT, heading TEXT,
    external_para_id TEXT, translation_text TEXT, translation_authority TEXT, language TEXT, deleted_at TEXT);
  CREATE TABLE content_alignment (trans_id INTEGER, orig_id INTEGER, trans_doc INTEGER, orig_doc INTEGER, basis TEXT,
    score REAL, method TEXT, retired_at INTEGER);
  CREATE TABLE content_source_links (quote_id INTEGER, source_id INTEGER, quote_doc INTEGER, source_doc INTEGER,
    coverage REAL, share REAL, basis TEXT, method TEXT);
  INSERT INTO docs VALUES (1,'Gleanings','Bahá''u''lláh','Baha''i','Core','en','https://oceanlibrary.com/gleanings',NULL,NULL,NULL,NULL),
                          (2,'Muntakhabát','Bahá''u''lláh','Baha''i','Core','ar',NULL,NULL,NULL,NULL,NULL),
                          (3,'God Passes By','Shoghi Effendi','Baha''i','Core','en',NULL,NULL,NULL,NULL,NULL);
  INSERT INTO content VALUES
    (10,1,0,'⁅s1⁆The Great Being saith: O ye children of men! The fundamental purpose animating the Faith of God is to safeguard the interests of the human race.⁅/s1⁆',NULL,'p1',NULL,NULL,NULL,NULL),
    (20,2,0,'قال الموجود الأعظم يا أبناء الإنسان إنّ المقصود من دين الله حفظ مصالح البشر',NULL,NULL,NULL,NULL,'ar',NULL),
    (30,3,4,'He declares: "O ye children of men! The fundamental purpose animating the Faith of God is to safeguard the interests of the human race." Thus the Revelation proclaims its aim.',NULL,NULL,NULL,NULL,NULL,NULL),
    (31,3,5,'An unlinked paragraph about the Heroic Age.',NULL,NULL,NULL,NULL,NULL,NULL);
  INSERT INTO content_alignment VALUES (10,20,1,2,'published',0.97,'anchor',NULL);
  INSERT INTO content_source_links VALUES (30,10,3,1,0.95,0.6,'exact','ngram');
`);

vi.mock('../../api/lib/db.js', () => ({
  queryAll: async (sql, params = []) => rawDb.prepare(sql).all(...params),
  queryOne: async (sql, params = []) => rawDb.prepare(sql).get(...params),
}));

const { resolveLinks, findOriginals, overlap, phraseWindows, matchWords } = await import('../../api/lib/passage-links.js');

describe('matching helpers', () => {
  it('ignores case, diacritics and apostrophes', () => {
    expect(matchWords("Bahá'u'lláh SAITH")).toEqual(matchWords('bahaullah saith'));
  });
  it('overlap = 1 when a verse sits verbatim inside a longer paragraph', () => {
    expect(overlap('O ye children of men! The fundamental purpose animating the Faith', 'He declares: "O ye children of men! The fundamental purpose animating the Faith of God"')).toBe(1);
    expect(overlap('an entirely different sentence here', 'O ye children of men')).toBe(0);
  });
  it('makes at most three phrase windows of ≤10 words (Meili reads only the first 10)', () => {
    const w = phraseWindows('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen');
    expect(w.length).toBe(3);
    for (const x of w) expect(x.split(' ').length).toBeLessThanOrEqual(10);
  });
});

describe('resolveLinks', () => {
  it('a translation reaches its original directly', async () => {
    const l = (await resolveLinks([10])).get(10);
    expect(l.original.id).toBe(20);
    expect(l.original.path).toBe('translation');
    expect(l.quotedBy.count).toBe(1);
    expect(l.quotedBy.passages[0].id).toBe(30);
  });
  it('a quotation reaches the original THROUGH the source it quotes, with references', async () => {
    const l = (await resolveLinks([30])).get(30);
    expect(l.sources[0].id).toBe(10);
    expect(l.sources[0].url).toMatch(/oceanlibrary\.com\/gleanings\?paraId=p1/);
    expect(l.original.id).toBe(20);
    expect(l.original.path).toBe('quote→source→original');
    expect(l.original.source.title).toBe('Gleanings');
  });
  it('sentence markers never reach the API text', async () => {
    const l = (await resolveLinks([30])).get(30);
    expect(l.sources[0].text).not.toMatch(/⁅/);
  });
  it('an original lists its translations; an unlinked paragraph has nothing', async () => {
    expect((await resolveLinks([20])).get(20).translations[0].id).toBe(10);
    const u = (await resolveLinks([31])).get(31);
    expect(u.original).toBeNull();
    expect(u.sources).toEqual([]);
  });
});

describe('findOriginals', () => {
  it('English verse → verbatim passages → the Arabic original, deduplicated', async () => {
    const search = vi.fn(async (q, o) => ({ hits: o.semanticRatio === 0 ? [{ id: 30 }, { id: 10 }, { id: 31 }] : [] }));
    const r = await findOriginals('The fundamental purpose animating the Faith of God is to safeguard the interests of the human race', { search });
    expect(r.method).toBe('phrase');
    expect(r.matches.map((m) => m.passage.id)).not.toContain(31);
    expect(r.originals.map((o) => o.id)).toEqual([20]);
    expect(search.mock.calls.every(([, o]) => o.semanticRatio === 0)).toBe(true);
  });
  it('falls back to semantic search only when no phrase matches', async () => {
    const search = vi.fn(async (q, o) => ({ hits: o.semanticRatio === 1 ? [{ id: 10 }] : [] }));
    const r = await findOriginals('The essential aim of the religion of God is to protect the welfare of humanity', { search });
    expect(r.method).toBe('semantic');
    expect(r.originals[0].id).toBe(20);
    expect(r.matches[0].overlap).toBeLessThan(0.5);
  });
});
