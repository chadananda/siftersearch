// Contract — a record the pipeline creates (or renames) is reachable by name at once. The lookup index used to be
// rebuilt only by the retired per-book shell flow, so every record minted since was unreachable (2026-09-28).
import { describe, it, expect, beforeAll, vi } from 'vitest';

let raw = null, HAVE_SQLITE = true;
try { const Database = (await import('better-sqlite3')).default; raw = new Database(':memory:'); }
catch { HAVE_SQLITE = false; }
const run = (sql, p = []) => { const s = raw.prepare(sql); return /^\s*(INSERT|CREATE|UPDATE|DELETE)/i.test(sql) ? s.run(...p) : s.all(...p); };

vi.mock('../../api/lib/db.js', () => ({
  queryAll: async (sql, p = []) => run(sql, p),
  queryOne: async (sql, p = []) => run(sql, p)[0] ?? null,
  query: async (sql, p = []) => { const r = run(sql, p); return { rows: r, lastInsertRowid: r.lastInsertRowid }; },
  transaction: async (stmts) => stmts.map(({ sql, args = [] }) => run(sql, args)),
}));
vi.mock('../../api/lib/content.js', () => ({ default: { updateContextOnly: async () => {} } }));

const { makeStore } = await import('../../api/lib/rag-adapter/store.js');
const { nameKeys } = await import('../../api/lib/translit-key.js');
const store = makeStore();

describe.skipIf(!HAVE_SQLITE)('lookup keys follow the record', () => {
  beforeAll(() => raw.exec(`
    CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, name TEXT, canonical_name TEXT, entity_type TEXT, importance INT, last_assessed_version TEXT);
    CREATE TABLE entity_research (canonical_name TEXT, entity_type TEXT, summary TEXT, aliases TEXT);
    CREATE TABLE entity_lookup_keys (skeleton_key TEXT, entity_id INT, surface TEXT, surface_norm TEXT, is_canonical INT, entity_type TEXT, importance INT);
    CREATE TABLE entity_decisions (id INTEGER PRIMARY KEY, kind TEXT, target_kind TEXT, target_ids TEXT, payload TEXT, evidence TEXT, rationale TEXT, actor TEXT, actor_tier INT, confidence REAL, status TEXT, method_version TEXT, supersedes INTEGER, valid_time TEXT);
  `));

  it('createEntity indexes the new name with the rebuild’s own keys', async () => {
    const id = await store.createEntity('Rúḥá Khánum', 'person');
    const keys = run(`SELECT skeleton_key k, is_canonical c FROM entity_lookup_keys WHERE entity_id = ?`, [id]);
    expect(keys.map((r) => r.k).sort()).toEqual([...new Set(nameKeys('Rúḥá Khánum'))].sort());
    expect(keys.every((r) => r.c === 1)).toBe(true);
  });

  it('renameEntity drops the old name’s keys and indexes the new one', async () => {
    const id = await store.createEntity('Mírzá Yaḥyá Núrí', 'person');
    await store.renameEntity(id, 'Bábí of Nayríz who fled to Ṭihrán', { rationale: 'label not in its passages' });
    const surfaces = new Set(run(`SELECT surface FROM entity_lookup_keys WHERE entity_id = ?`, [id]).map((r) => r.surface));
    expect([...surfaces]).toEqual(['Bábí of Nayríz who fled to Ṭihrán']);
  });
});
