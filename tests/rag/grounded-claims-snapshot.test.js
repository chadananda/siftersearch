// 10-21: searchGrounded re-scanned entity_claims with `lower(statement) LIKE '%tok%'` (no index can serve it) on EVERY
// reconcile cluster — 75×/hour in a grounding run, 3–7 s each (system-checks "Blocking queries"). The claims are now read
// once per process per TTL and matched in JS. Fails on the old code: each call issued its own LIKE scan.
import { describe, it, expect, vi, beforeAll } from 'vitest';

let raw = null, HAVE_SQLITE = true;
try { const Database = (await import('better-sqlite3')).default; raw = new Database(':memory:'); } catch { HAVE_SQLITE = false; }
const seen = [];
const run = (sql, p = []) => { seen.push(sql); const s = raw.prepare(sql); return /^\s*(INSERT|CREATE)/i.test(sql) ? s.run(...p) : s.all(...p); };
vi.mock('../../api/lib/db.js', () => ({ queryAll: async (sql, p = []) => run(sql, p), query: async (sql, p = []) => ({ rows: run(sql, p) }) }));
vi.mock('../../api/lib/content.js', () => ({ default: {} }));

const { makeStore, matchGrounded, _resetGroundedClaims } = await import('../../api/lib/rag-adapter/store.js');

describe.skipIf(!HAVE_SQLITE)('searchGrounded reads the grounded claims once', () => {
  beforeAll(() => {
    raw.exec(`CREATE TABLE entity_claims (id INTEGER PRIMARY KEY, entity_id INTEGER, statement TEXT, status TEXT, para_id TEXT, time_value TEXT);
      CREATE INDEX idx_ec_entity ON entity_claims(entity_id);
      CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, canonical_name TEXT);
      CREATE TABLE entity_lookup_keys (skeleton_key TEXT, entity_id INTEGER);
      INSERT INTO graph_entities VALUES (1, 'Mullá Ḥusayn'), (2, 'Qazvíní'), (3, 'Azghandí');
      INSERT INTO entity_claims (entity_id, statement, status, para_id) VALUES
        (1, 'Mullá Ḥusayn — first to believe in the Báb', 'supported', 'p1'),
        (2, 'Qazvíní — the Báb''s Amanuensis at Máh-Kú', 'supported', 'p2'),
        (3, 'Azghandí — amanuensis (disputed)', 'rejected', 'p3'),
        (NULL, 'unbound amanuensis claim', 'supported', 'p4');`);
    _resetGroundedClaims?.();
  });

  it('many reconcile lookups → one claims read, no per-call LIKE scan', async () => {
    const store = makeStore();
    const a = await store.searchGrounded('the amanuensis');
    const b = await store.searchGrounded('believer');
    await store.searchGrounded('amanuensis of the Báb');
    expect(a.map((r) => r.entityId)).toEqual([2]);          // case-insensitive, supported + bound only
    expect(b).toEqual([]);                                  // 'believer' ≠ 'believe' substring direction kept
    const claimScans = seen.filter((s) => /FROM entity_claims/.test(s) && !/entity_id IN/.test(s));
    expect(claimScans).toHaveLength(1);
    expect(seen.some((s) => /LIKE/.test(s))).toBe(false);
  });

  it('matchGrounded: distinct ids in snapshot order, capped', () => {
    const snap = { ids: Int32Array.from([5, 5, 6, 7]), text: ['a báb x', 'báb', 'the báb', 'none'] };
    expect(matchGrounded(snap, ['báb'], 40)).toEqual([5, 6]);
    expect(matchGrounded(snap, ['báb'], 1)).toEqual([5]);
  });
});
