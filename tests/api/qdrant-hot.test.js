// Phase 0 hot layer (storage plan §6.6, Chad 10-21): new phrase points go to `phrases_hot` on the RAM-disk Qdrant; search
// merges main + hot and degrades to main; writes to `phrases` are mirrored; coverage counts both; after a qdrant-hot loss the
// indexer re-sends exactly the lost points from its stored vectors (crash test against a fake Qdrant).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { hotPath, mergePoints, mergeGroups, qdrantRequest, searchPhrases } from '../../api/lib/search/qdrant-layers.js';
import { qdrantCount } from '../../api/lib/repos/coverage-repo.js';
import { indexerArgs, hotArgs, reconcileArgs } from '../../api/lib/ops/phrase-index-job.js';
import { INDEX_LANES, INDEX_REPORTS } from '../../api/lib/ops/index-reports.js';

const ROOT = join(import.meta.dirname, '..', '..');
const MAIN = 'http://main.test', HOT = 'http://hot.test';
const json = (result, status = 200) => ({ ok: status < 400, status, json: async () => ({ result }), text: async () => JSON.stringify({ result }) });

beforeEach(() => { process.env.QDRANT_URL = MAIN; process.env.QDRANT_HOT_URL = HOT; delete process.env.QDRANT_HOT_PHRASES; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.QDRANT_HOT_URL; delete process.env.QDRANT_URL; });

describe('hot layer: pure merge', () => {
  it('maps only phrases paths to the hot collection', () => {
    expect(hotPath('/collections/phrases/points/query')).toBe('/collections/phrases_hot/points/query');
    expect(hotPath('/collections/hype/points/query')).toBeNull();
    expect(hotPath('/collections/phrases_kw/points')).toBeNull();
  });
  it('merges points by score, one per id, hot copy wins', () => {
    const m = mergePoints([{ id: 1, score: 0.9, src: 'main' }, { id: 2, score: 0.5 }], [{ id: 1, score: 0.9, src: 'hot' }, { id: 3, score: 0.7 }]);
    expect(m.map((p) => p.id)).toEqual([1, 3, 2]);
    expect(m[0].src).toBe('hot');
  });
  it('merges groups: best hit per paragraph, limited', () => {
    const g = (id, score) => ({ id, hits: [{ score }] });
    expect(mergeGroups([g(1, 0.4), g(2, 0.8)], [g(1, 0.9), g(3, 0.1)], 2).map((x) => [x.id, x.hits[0].score])).toEqual([[1, 0.9], [2, 0.8]]);
  });
});

describe('hot layer: search and writes', () => {
  const gemini = (url) => url.includes('generativelanguage') && { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
  it('search reads main + hot and merges', async () => {
    const seen = [];
    vi.stubGlobal('fetch', async (url) => {
      if (gemini(url)) return gemini(url);
      seen.push(url);
      if (url.startsWith(HOT)) return json({ points: [{ id: 9001, score: 0.95, payload: { paragraph_id: 9, doc_id: 1, start: 0, end: 5 } }] });
      return json({ points: [{ id: 1001, score: 0.8, payload: { paragraph_id: 1, doc_id: 1, start: 0, end: 4 } }] });
    });
    const r = await searchPhrases('hot merge test query', { limit: 1 });
    expect(seen).toEqual([`${MAIN}/collections/phrases/points/query`, `${HOT}/collections/phrases_hot/points/query`]);
    expect(r.hits.map((h) => h.paragraph_id)).toEqual([9]);
  });
  it('search degrades to main when qdrant-hot is down; main down still fails the layer', async () => {
    vi.stubGlobal('fetch', async (url) => {
      if (gemini(url)) return gemini(url);
      if (url.startsWith(HOT)) throw new Error('ECONNREFUSED');
      return json({ points: [{ id: 1001, score: 0.8, payload: { paragraph_id: 1, doc_id: 1 } }] });
    });
    expect((await searchPhrases('hot down query', { limit: 1 })).hits.map((h) => h.paragraph_id)).toEqual([1]);
    vi.stubGlobal('fetch', async (url) => (gemini(url) || (url.startsWith(HOT) ? json({ points: [] }) : json(null, 500))));
    await expect(searchPhrases('main down query', { limit: 1 })).rejects.toThrow(/500/);
  });
  it('a write to phrases is mirrored to hot; a hot 404 or failure never fails it', async () => {
    const seen = [];
    vi.stubGlobal('fetch', async (url) => { seen.push(url); return url.startsWith(HOT) ? json(null, 404) : json({ status: 'ok' }); });
    expect(await qdrantRequest('/collections/phrases/points/delete?wait=false', { filter: {} })).toEqual({ status: 'ok' });
    expect(seen).toContain(`${HOT}/collections/phrases_hot/points/delete?wait=false`);
    seen.length = 0;
    await qdrantRequest('/collections/hype/points/delete?wait=false', { filter: {} });
    expect(seen).toEqual([`${MAIN}/collections/hype/points/delete?wait=false`]);
  });
  it('coverage counts phrases in main + hot; hot absent = 0, hot unreachable = unknown', async () => {
    const f = (hot) => async (url) => (url.startsWith(HOT) ? hot() : json({ count: 10 }));
    expect(await qdrantCount('phrases', 5, { fetchImpl: f(() => json({ count: 3 })) })).toBe(13);
    expect(await qdrantCount('phrases', 5, { fetchImpl: f(() => json(null, 404)) })).toBe(10);
    expect(await qdrantCount('phrases', 5, { fetchImpl: f(() => { throw new Error('down'); }) })).toBeNull();
    expect(await qdrantCount('hype', 5, { fetchImpl: f(() => { throw new Error('never asked'); }) })).toBe(10);
  });
});

describe('hot layer: indexer jobs', () => {
  it('phrase builds go to hot; hype/concepts stay on main; reconcile is spend-free', () => {
    expect(indexerArgs({ docs: [1], maxUsd: 1 })).toEqual(expect.arrayContaining(['--hot-url', HOT, '--hot-collection', 'phrases_hot']));
    expect(indexerArgs({ docs: [1], maxUsd: 1, field: 'hype' })).not.toContain('--hot-url');
    expect(hotArgs({})).toEqual([]);
    expect(reconcileArgs({ QDRANT_HOT_URL: HOT })).toEqual(['scripts/phrase-index/indexer.mjs', '--qdrant', '--reconcile-hot', '--hot-url', HOT, '--hot-collection', 'phrases_hot']);
    expect(() => reconcileArgs({})).toThrow(/QDRANT_HOT_URL/);
    expect(INDEX_REPORTS['phrase-hot-reconcile']).toBeTypeOf('function');
    expect(INDEX_LANES.index).toEqual(expect.arrayContaining(['phrase-index', 'phrase-hot-reconcile']));
  });
});

// A fake Qdrant (both instances on one port, told apart by collection): records upserts, answers id lookups.
function fakeQdrant() {
  const hot = new Map(), main = new Map(), calls = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b = body ? JSON.parse(body) : {};
      calls.push(`${req.method} ${req.url}`);
      const send = (result) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result, status: 'ok' })); };
      const m = req.url.match(/^\/collections\/([^/?]+)(\/[^?]*)?/);
      const store = m?.[1] === 'phrases_hot' ? hot : main;
      if (m?.[2] === '/exists') return send({ exists: true });
      if (req.method === 'PUT' && m?.[2] === '/points') { for (const p of b.points) store.set(p.id, p); return send({ status: 'completed' }); }
      if (req.method === 'POST' && m?.[2] === '/points') return send(b.ids.filter((id) => store.has(id)).map((id) => ({ id })));
      return send(true);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, hot, main, calls, url: `http://127.0.0.1:${server.address().port}` })));
}

function seedStore(dir, n) {
  const f = join(dir, 'vectors.db');
  const db = new Database(f);
  db.exec(`CREATE TABLE vec (key TEXT PRIMARY KEY, model TEXT, dims INTEGER, v BLOB, at INTEGER);
    CREATE TABLE units (point_id INTEGER PRIMARY KEY, paragraph_id TEXT, doc_id TEXT, k INTEGER, start INTEGER, "end" INTEGER, seg_v TEXT, key TEXT,
      fa_share REAL, religion TEXT, author TEXT, lang_label TEXT, upserted INTEGER DEFAULT 0, field TEXT DEFAULT 'text', lang_group TEXT, collection TEXT, scope TEXT);`);
  const v = Buffer.alloc(8);   // two float16 zeros
  for (let i = 0; i < n; i++) {
    db.prepare('INSERT INTO vec VALUES (?, ?, ?, ?, ?)').run(`k${i}`, 'gemini-embedding-2', 2, v, 0);
    db.prepare('INSERT INTO units (point_id, paragraph_id, doc_id, k, start, "end", key) VALUES (?, ?, ?, 0, 0, 1, ?)').run(1000 * (i + 1), i + 1, 1, `k${i}`);
  }
  db.close();
  return f;
}
const run = (args) => new Promise((resolve) => {
  const c = spawn(process.execPath, ['scripts/phrase-index/indexer.mjs', ...args], { cwd: ROOT, env: { ...process.env, QDRANT_KEY: 'x' } });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (code) => resolve({ code, lines: out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)) }));
});

describe('hot layer: crash recovery (indexer against a fake Qdrant)', () => {
  it('sends new points to hot only (marked 2); after a hot loss, reconcile re-sends exactly the lost ones', async () => {
    const q = await fakeQdrant();
    try {
      const dir = mkdtempSync(join(tmpdir(), 'hot-'));
      const store = seedStore(dir, 5);
      const base = ['--store', store, '--ledger', join(dir, 'spend.db'), '--qdrant-url', q.url, '--hot-url', q.url, '--hot-path', dir, '--hot-min-free-gb', '0'];
      const a = await run(['--qdrant', ...base]);
      expect(a.code).toBe(0);
      expect(q.hot.size).toBe(5);
      expect(q.main.size).toBe(0);   // nothing new lands on /fast
      const db = new Database(store, { readonly: true });
      expect(db.prepare('SELECT COUNT(*) n FROM units WHERE upserted = 2').get().n).toBe(5);
      db.close();
      // crash: the RAM disk loses the two points written after its last snapshot
      q.hot.delete(4000); q.hot.delete(5000);
      const b = await run(['--qdrant', '--reconcile-hot', ...base]);
      expect(b.code).toBe(0);
      expect(b.lines.find((l) => l.phase === 'reconcile-hot')).toMatchObject({ checked: 5, missing: 2 });
      expect(b.lines.find((l) => l.phase === 'upsert-done')).toMatchObject({ sent: 2 });
      expect([...q.hot.keys()].sort()).toEqual([1000, 2000, 3000, 4000, 5000]);
    } finally { q.server.close(); }
  }, 60000);
  it('stops cleanly (no upsert) when the RAM disk is nearly full', async () => {
    const q = await fakeQdrant();
    try {
      const dir = mkdtempSync(join(tmpdir(), 'hot-'));
      const store = seedStore(dir, 2);
      const r = await run(['--qdrant', '--store', store, '--ledger', join(dir, 'spend.db'), '--qdrant-url', q.url, '--hot-url', q.url, '--hot-path', dir, '--hot-min-free-gb', '1000000']);
      expect(r.lines.find((l) => l.phase === 'stopped')?.reason).toMatch(/hot RAM disk/);
      expect(q.hot.size).toBe(0);
    } finally { q.server.close(); }
  }, 60000);
});
