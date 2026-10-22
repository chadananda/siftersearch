// 10-22: GET /api/v1/people/1247562 (Bahá'u'lláh) built a 13 MB dossier — all 44,042 claims, 48k mention rows pulled into
// JS, 1,659 OceanLibrary links — 39.6 s cold, two 19.6 s gateway timeouts. The dossier now samples CLAIMS_MAX claims
// (evenly along the chronology), aggregates mentions in SQL, and is cached per id.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
const calls = [];
vi.mock('../../api/lib/db.js', () => {
  const run = (sql, params = []) => { calls.push(sql); return db.prepare(sql).all(...params); };
  return { queryAll: vi.fn(async (sql, params) => run(sql, params)), queryOne: vi.fn(async (sql, params) => run(sql, params)[0] ?? null),
    query: vi.fn(async (sql, params) => ({ rows: run(sql, params) })) };
});
const { getBioPerson, CLAIMS_MAX, _resetBioPersonCache } = await import('../../api/lib/bio.js');

const N_CLAIMS = 20000, N_MENTIONS = 30000;
db.exec(`CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, canonical_name TEXT, importance REAL, last_assessed_version TEXT, entity_type TEXT, religion TEXT);
  CREATE TABLE entity_research (canonical_name TEXT, side TEXT, summary TEXT, aliases TEXT, kinship TEXT, relations TEXT, research_notes TEXT, dates TEXT);
  CREATE TABLE entity_mentions_v2 (entity_id INTEGER, doc_id INTEGER, para_id TEXT);
  CREATE INDEX idx_m ON entity_mentions_v2(entity_id, doc_id);
  CREATE TABLE entity_claims (id INTEGER PRIMARY KEY, entity_id INTEGER, relation TEXT, statement TEXT, proof_verbatim TEXT, doc_id INTEGER,
    para_id TEXT, time_value TEXT, time_basis TEXT, status TEXT);
  CREATE INDEX idx_ec_entity ON entity_claims(entity_id);
  CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, source_url TEXT);
  CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, external_para_id TEXT, paragraph_index INTEGER, text TEXT, heading TEXT);
  INSERT INTO graph_entities VALUES (7, 'Central Figure', 10, NULL, 'person', ''), (8, 'Minor Figure', 1, NULL, 'person', '');`);
db.transaction(() => {
  const d = db.prepare('INSERT INTO docs (id, title, source_url) VALUES (?, ?, ?)');
  for (let i = 1; i <= 50; i++) d.run(i, `Book ${i}`, `https://oceanlibrary.com/book-${i}`);
  const m = db.prepare('INSERT INTO entity_mentions_v2 VALUES (?, ?, ?)');
  for (let i = 0; i < N_MENTIONS; i++) m.run(7, (i % 50) + 1, `para_${i}`);
  const c = db.prepare('INSERT INTO entity_claims (entity_id, relation, statement, proof_verbatim, doc_id, para_id, time_value, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < N_CLAIMS; i++) c.run(7, 'did', `claim ${i}`, 'proof '.repeat(20), (i % 50) + 1, `para_${i}`, String(1817 + (i % 75)), 'supported');
  for (let i = 0; i < 5; i++) c.run(8, 'did', `minor ${i}`, null, 1, `para_${i}`, String(1850 + i), null);
})();

describe('people dossier budget', () => {
  beforeEach(() => { _resetBioPersonCache(); calls.length = 0; });
  it('samples at most CLAIMS_MAX claims, spread across the whole life, and reports the total', async () => {
    const p = await getBioPerson(7);
    expect(p.characterizations).toHaveLength(CLAIMS_MAX);
    expect(p.characterizationsTotal).toBe(N_CLAIMS);
    const years = p.characterizations.map((c) => parseInt(c.when, 10));
    expect(Math.min(...years)).toBe(1817);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(1885);
    expect(p.mentionCount).toBe(N_MENTIONS);
    expect(p.books).toHaveLength(50);
    expect(JSON.stringify(p).length).toBeLessThan(250000);
  });
  it('returns every claim for a small dossier, and all of them to the offline timeline builder', async () => {
    expect((await getBioPerson(8)).characterizations).toHaveLength(5);
    expect((await getBioPerson(7, { allClaims: true })).characterizations).toHaveLength(N_CLAIMS);
  });
  it('never pulls every mention row into JS', async () => {
    await getBioPerson(7);
    expect(calls.some((s) => /SELECT doc_id, para_id FROM entity_mentions_v2 WHERE entity_id = \?$/.test(s.trim()))).toBe(false);
  });
  it('is cached per id (a repeat costs no reads)', async () => {
    await getBioPerson(7);
    const n = calls.length;
    const t0 = Date.now();
    await getBioPerson(7);
    expect(calls.length).toBe(n);
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
