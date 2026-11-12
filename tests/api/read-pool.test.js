// Entity-name reads run OFF the event loop (api/lib/search/read-pool.js, 11-04). Standalone repro on tower: one search-target
// surface count (entity_mentions_v2 GROUP BY surface for the lookup's candidates) blocked the API's loop 998 ms in ONE
// statement; entity:lookup 20-107 ms per call, docs:find 15-118 ms. On a production-shaped synthetic library (a few entities
// carry tens of thousands of mentions, like the Central Figures): the thread returns what the in-process read returns, the
// in-process read really is a long block (so the test can see one), and on the pool the serving loop stays inside the Qdrant
// budget. Names are also shared across the API processes through one data/run file (O_EXCL lock, stampede-safe).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const ENTITIES = 60;
// mentions per entity: two "Central Figures" with 60k / 40k, a long tail — ~150k rows, the shape behind the 998 ms statement
const mentionsOf = (e) => (e === 1 ? 60000 : e === 2 ? 40000 : e <= 10 ? 4000 : 300);
const SURFACES = ['Bahá’u’lláh', 'Baha’u’llah', 'Bahaullah', 'the Blessed Beauty', 'He', 'Him', 'بهاءالله', 'Mírzá Ḥusayn-‘Alí', 'Jamál-i-Mubárak'];
let dir, pool, target, entityApi;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'read-pool-'));
  const file = join(dir, 'sifter.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, canonical_name TEXT, entity_type TEXT, importance REAL, last_assessed_version TEXT);
    CREATE TABLE entity_research (canonical_name TEXT, entity_type TEXT, aliases TEXT);
    CREATE TABLE entity_lookup_keys (entity_id INTEGER, skeleton_key TEXT, surface TEXT, surface_norm TEXT, is_canonical INTEGER);
    CREATE INDEX idx_elk_key ON entity_lookup_keys(skeleton_key);
    CREATE TABLE entity_mentions_v2 (id INTEGER PRIMARY KEY, entity_id INTEGER, doc_id INTEGER, para_id INTEGER, surface TEXT, context TEXT);
    CREATE INDEX idx_emv2_entity ON entity_mentions_v2(entity_id);
    CREATE TABLE entity_claims (id INTEGER PRIMARY KEY, entity_id INTEGER, target_entity_id INTEGER, relation TEXT);`);
  const r = rng(11);
  const insE = db.prepare('INSERT INTO graph_entities VALUES (?,?,?,?,NULL)');
  const insR = db.prepare('INSERT INTO entity_research VALUES (?,?,?)');
  const insK = db.prepare('INSERT INTO entity_lookup_keys VALUES (?,?,?,?,?)');
  const insM = db.prepare('INSERT INTO entity_mentions_v2 (entity_id, doc_id, para_id, surface, context) VALUES (?,?,?,?,?)');
  const insC = db.prepare('INSERT INTO entity_claims (entity_id, target_entity_id, relation) VALUES (?,?,?)');
  db.transaction(() => {
    for (let e = 1; e <= ENTITIES; e++) {
      const name = e <= 2 ? `Edirne ${e}` : `Person ${e}`;
      insE.run(e, name, e % 3 ? 'person' : 'place', e <= 2 ? 1 : r());
      insR.run(name, e % 3 ? 'person' : 'place', JSON.stringify([`Alias ${e}`]));
      // every entity shares the key 'drn' so one lookup returns all of them (a common name's candidate set)
      insK.run(e, 'drn', name, name.toLowerCase(), 1);
      for (let m = 0; m < mentionsOf(e); m++) insM.run(e, 1 + Math.floor(r() * 400), m, SURFACES[Math.floor(r() * SURFACES.length)], 'x'.repeat(200));
      for (let c = 0; c < 20; c++) insC.run(1 + Math.floor(r() * ENTITIES), e, 'located_in');
    }
  })();
  db.close();
  process.env.TURSO_DATABASE_URL = `file:${file}`;
  process.env.SIFTER_WRITER_URL = '';
  process.env.SIFTER_READ_THREADS = '2';
  pool = await import('../../api/lib/search/read-pool.js');
  target = await import('../../api/lib/search-target.js');
  entityApi = await import('../../api/lib/entity-api.js');
  target._setSharedPath(join(dir, 'run', 'entity-names.json'));
});
afterAll(() => { delete process.env.SIFTER_READ_THREADS; if (dir) rmSync(dir, { recursive: true, force: true }); });

const ALL = Array.from({ length: 30 }, (_, i) => i + 1);

describe('entity-name reads on the read pool', () => {
  it('a thread returns exactly what the in-process repo read returns', async () => {
    const { entityNameRows, entityLookupKeyRows } = await import('../../api/lib/repos/entity-names-repo.js');
    expect(await pool.runRead('entity:names', ALL)).toEqual(await entityNameRows(ALL));
    const q = { exact: ['edirne 1'], keys: ['drn'], type: null, limit: 30 };
    const viaThread = await pool.runRead('entity:lookup', q);
    expect(viaThread.length).toBe(30);
    expect(viaThread).toEqual(await entityLookupKeyRows(q));
    expect(pool.readPoolStats().tasks['entity:names'].thread).toBeGreaterThan(0);
  }, 60_000);

  it('a thread reports how long the task queued behind its earlier tasks (timing.queued, inside the call wall)', async () => {
    const t0 = performance.now();
    const { timing } = await pool.runReadTimed('entity:names', ALL);
    const wall = performance.now() - t0;
    expect(typeof timing.queued).toBe('number');
    expect(timing.queued).toBeGreaterThanOrEqual(0);
    expect(timing.queued + timing.total).toBeLessThanOrEqual(wall + 2);
  }, 60_000);

  it('the surface count is a real block in-process, and the serving loop stays inside the Qdrant budget on the pool', async () => {
    const { entityNameRows } = await import('../../api/lib/repos/entity-names-repo.js');
    const { QDRANT_CALL_MS } = await import('../../api/lib/search/latency-budget.js');
    await pool.runRead('entity:names', ALL);   // threads warm
    const t = performance.now(); await entityNameRows(ALL); const inProc = performance.now() - t;
    if (process.env.READ_POOL_DEBUG) process.stderr.write(`in-process surface count ${Math.round(inProc)} ms\n`);
    expect(inProc).toBeGreaterThan(QDRANT_CALL_MS);   // ~100k-row GROUP BY: what blocked the API for ~1 s on prod
    const h = monitorEventLoopDelay({ resolution: 1 }); h.enable();
    const out = await Promise.all([
      ...Array.from({ length: 4 }, () => pool.runRead('entity:names', ALL)),
      ...Array.from({ length: 4 }, () => pool.runRead('entity:lookup', { exact: ['edirne 1'], keys: ['drn'], limit: 30 })),
    ]);
    h.disable();
    if (process.env.READ_POOL_DEBUG) process.stderr.write(`loop max on pool ${(h.max / 1e6).toFixed(1)} ms\n`);
    expect(out[0].surfaces.length).toBeGreaterThan(30);
    expect(h.max / 1e6).toBeLessThan(QDRANT_CALL_MS);
  }, 60_000);

  it('resolveTarget and entityLookup go through the pool; names are shared through data/run, a hit needs no read', async () => {
    target.clearTargetCache(); entityApi._resetLookupMemo();
    const before = pool.readPoolStats().tasks['entity:names'];
    const n0 = (before?.thread || 0) + (before?.inProcess || 0);
    const t = await target.resolveTarget('edirne 1', { countText: async () => 0 });
    expect(t?.id).toBe(1);
    const after = pool.readPoolStats().tasks;
    expect(after['entity:names'].thread + after['entity:names'].inProcess).toBe(n0 + 1);
    expect(after['entity:lookup'].thread).toBeGreaterThan(0);
    const shared = JSON.parse(readFileSync(join(dir, 'run', 'entity-names.json'), 'utf8'));
    expect(shared['1'].v.mentions).toBeGreaterThanOrEqual(60000);   // mentions + claims pointing at it
    expect(shared['1'].v.names).toContain('Alias 1');
    // another process (a cleared per-process cache) adopts the shared names: no surface count
    target.clearTargetCache();
    const t2 = await target.resolveTarget('edirne 1', { countText: async () => 0 });
    expect(t2?.id).toBe(1);
    const again = pool.readPoolStats().tasks['entity:names'];
    expect(again.thread + again.inProcess).toBe(n0 + 1);
  }, 60_000);

  it('stampede: a held lock skips the shared write (never waits); a stale lock is broken', () => {
    const lock = join(dir, 'run', 'entity-names.json.lock');
    writeFileSync(lock, '');
    expect(target.writeShared({ 999: { at: Date.now(), v: { names: [], mentions: 0 } } })).toBe(false);
    const old = (Date.now() - 120_000) / 1000; utimesSync(lock, old, old);
    expect(target.writeShared({ 999: { at: Date.now(), v: { names: [], mentions: 0 } } })).toBe(true);
    expect(existsSync(lock)).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'run', 'entity-names.json'), 'utf8'))['999']).toBeTruthy();
  });

  it('serving code reaches these reads only through runRead', () => {
    const src = (p) => readFileSync(join(import.meta.dirname, '../../api/lib', p), 'utf8');
    expect(src('search-target.js')).toMatch(/runRead\('entity:names'/);
    expect(src('search-target.js')).not.toMatch(/from '\.\/db\.js'/);
    expect(src('entity-api.js')).toMatch(/runRead\('entity:lookup'/);
    expect(src('entity-api.js')).not.toMatch(/FROM entity_lookup_keys/);
    expect(src('search/named-scope.js')).toMatch(/runRead\('docs:find'/);
    expect(src('search/hydrate-thread.js')).toMatch(/runRead\('hydrate'/);
    expect(src('bio.js')).toMatch(/runRead\('bio:persons'/);
    expect(src('bio.js')).not.toMatch(/function computeBookSources/);
    // whole-document reads of a turn (reference lookup, prayer shelf): 4–5 s on the serving thread stalled Jev's calls (11-12)
    expect(src('paragraphs-repo.js')).toMatch(/offThread\('paragraphs:in-range'/);
    expect(src('paragraphs-repo.js')).toMatch(/offThread\('paragraphs:heading-starts'/);
    expect(src('docs-repo.js')).toMatch(/runRead\('docs:in-folder'/);
    expect(src('assistant/quote-search.js')).toMatch(/runRead\('quote:literal-scan'/);
  });
});
