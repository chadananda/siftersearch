// Search hydration runs OFF the event loop (api/lib/search/hydrate-thread.js; 11-04: the synchronous hydrate read ran while
// sibling Qdrant fetches were in flight and inflated qdrant_by ~10x over Qdrant's own time). On a production-sized synthetic
// library (150 stub paragraphs of ~180 words per engine call): the thread returns exactly what the in-process path returns,
// the in-process CPU fits its budget, and while the threads hydrate the serving loop stays free.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';

const PARAS = 20000, DOCS = 400, STUBS = 150;
const WORDS = ('the of and to in that is for his he it with as was on be by this which are not from god soul spirit light world love unity '
  + 'faith truth justice divine heaven earth knowledge revelation covenant prophet manifestation station glory peace humanity').split(' ');
let dir, mod;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'hydrate-thread-'));
  const file = join(dir, 'sifter.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT, year TEXT,
      filename TEXT, slug TEXT, source_site TEXT, source_url TEXT, deleted_at TEXT, duplicate_of INTEGER);
    CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraph_index INTEGER, text TEXT, heading TEXT, blocktype TEXT,
      translation TEXT, translation_segments TEXT, context TEXT, external_para_id TEXT, pdf_page INTEGER, text_grounded TEXT,
      authors TEXT, block_attrs TEXT, deleted_at TEXT, is_duplicate INTEGER);`);
  const r = rng(7);
  const text = () => Array.from({ length: 180 }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ');
  const insDoc = db.prepare('INSERT INTO docs (id, title, author, religion, collection, language, year, filename, slug) VALUES (?,?,?,?,?,?,?,?,?)');
  const insPara = db.prepare('INSERT INTO content (id, doc_id, paragraph_index, text, heading, blocktype, context) VALUES (?,?,?,?,?,?,?)');
  db.transaction(() => {
    for (let d = 1; d <= DOCS; d++) insDoc.run(d, `Doc ${d}`, `Author ${d % 37}`, "Baha'i", 'c', 'en', '1990', `d${d}.md`, `d${d}`);
    for (let p = 1; p <= PARAS; p++) insPara.run(p, 1 + (p % DOCS), p % 50, text(), '', 'paragraph', text().slice(0, 300));
  })();
  db.close();
  process.env.TURSO_DATABASE_URL = `file:${file}`;
  process.env.SIFTER_WRITER_URL = '';
  process.env.SIFTER_HYDRATE_THREADS = '2';
  mod = await import('../../api/lib/search/hydrate-thread.js');
});
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const QUERY = 'the unity of revelation and the station of the prophet';
const ids = (seed) => { const r = rng(seed); return Array.from({ length: STUBS }, () => 1 + Math.floor(r() * PARAS)); };

describe('search hydration off the event loop', () => {
  it('the thread returns what the in-process path returns (documents + highlighting)', async () => {
    const want = ids(1);
    const viaThread = await mod.hydrateParagraphs(want, QUERY);
    const inProc = await mod.hydrateInProcess(want, QUERY);
    expect(viaThread.length).toBeGreaterThan(100);
    expect(viaThread).toEqual(inProc);
    expect(viaThread[0]._formatted.text).toContain('<mark>');
    expect(mod.hydrateThreadStats().thread).toBeGreaterThan(0);
  }, 30_000);

  it('in-process hydrate CPU (read + highlight, 150 paragraphs) fits the hydrate budget', async () => {
    await mod.hydrateInProcess(ids(2), QUERY);   // warm (JIT, statement cache)
    const ms = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); await mod.hydrateInProcess(ids(10 + i), QUERY); ms.push(performance.now() - t); }
    const { ENGINE_BUDGETS } = await import('../../api/lib/search/latency-budget.js');
    expect(ms.sort((a, b) => a - b)[2]).toBeLessThan(ENGINE_BUDGETS.hydrate.ms);
  });

  it('highlighting 150 paragraphs (~180 words, accented names) costs ≤ 10 ms — the ASCII fast path in foldWithMap', async () => {
    const { highlightText } = await import('../../api/lib/search/highlighting.js');
    const r = rng(5), W = [...WORDS, "Bahá'u'lláh", '‘Abdu’l-Bahá', 'Ṭáhirih'];
    const paras = Array.from({ length: STUBS }, () => Array.from({ length: 180 }, () => W[Math.floor(r() * W.length)]).join(' '));
    const q = "the station of the Bab and Bahá'u'lláh's revelation";
    paras.forEach((t) => highlightText(t, q));   // warm
    const ms = [];
    for (let i = 0; i < 5; i++) { const t = performance.now(); for (const p of paras) highlightText(p, q); ms.push(performance.now() - t); }
    expect(highlightText(paras[0], q)).toContain('<mark>');
    expect(ms.sort((a, b) => a - b)[2]).toBeLessThan(10);   // was ~13 ms on an M-series laptop, ~25 ms per call on tower
  });

  it('while 12 hydrations run on the threads, the serving loop is never blocked past 10 ms (the Qdrant budget)', async () => {
    await mod.hydrateParagraphs(ids(3), QUERY);   // threads up and warm
    const h = monitorEventLoopDelay({ resolution: 1 }); h.enable();
    const docs = await Promise.all(Array.from({ length: 12 }, (_, i) => mod.hydrateParagraphs(ids(100 + i), QUERY)));
    h.disable();
    expect(docs.every((d) => d.length > 100)).toBe(true);
    // the main thread only receives ~150 docs per call (structured clone); the reads and highlighting are elsewhere
    expect(h.max / 1e6).toBeLessThan(10);
  }, 30_000);

  it('hydrateBodies: bodies only (no highlight), the split {ids, cached, read, wait}, and a repeat served from the id cache (#167)', async () => {
    const want = ids(7);
    process.env.SIFTER_HYDRATE_CACHE_MS = '60000';
    try {
      mod.clearHydrateCache();
      const by1 = {}, first = await mod.hydrateBodies(want, by1);
      expect(first.length).toBeGreaterThan(100);
      expect(first[0]._formatted).toBeUndefined();
      expect(by1).toMatchObject({ ids: want.length, cached: 0 });
      expect(by1.read).toBeGreaterThanOrEqual(0); expect(by1.wait).toBeGreaterThanOrEqual(0);
      const by2 = {}, again = await mod.hydrateBodies(want, by2);
      expect(by2).toMatchObject({ ids: want.length, cached: want.length, read: 0, wait: 0 });
      const byId = (a) => Object.fromEntries(a.map((d) => [d.id, d]));
      expect(byId(again)).toEqual(byId(first));
      const hl = mod.highlightDoc(first[0], QUERY);
      expect(hl._formatted.text).toContain('<mark>');
      expect(first[0]._formatted).toBeUndefined();   // the cached copy is never marked
    } finally { delete process.env.SIFTER_HYDRATE_CACHE_MS; mod.clearHydrateCache(); }
  }, 30_000);

  it('the id cache is off under test by default (every call reads)', async () => {
    const by = {}; await mod.hydrateBodies(ids(8), by); const by2 = {}; await mod.hydrateBodies(ids(8), by2);
    expect(by2.cached).toBe(0);
  }, 30_000);

  it('multiIndexSearch hydrates through the thread pool, never with a main-thread paragraphsByIds', () => {
    const src = readFileSync(join(import.meta.dirname, '../../api/lib/search.js'), 'utf8');
    expect(src).toMatch(/hydrateBodies\(stubIds, hydrateBy\)/);
    expect(src).toMatch(/e\.hydrated \? highlightDoc\(e\.paragraph, query\)/);   // highlight only the returned top-k
    expect(src).not.toMatch(/paragraphsByIds\(stubIds/);
  });
});
