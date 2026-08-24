// Entity catalog (R1–R7) — the external-consumer surface.
//
// The governing fact these tests protect: graph_entities.id is AUTOINCREMENT and renumbers on a full
// rebuild (ids run 1,247,551–1,302,536 over ~52,765 rows — a renumber already happened once). So the
// natural key, not the id, is identity, and every id-shaped promise must stay false.
import { describe, it, expect } from 'vitest';
import {
  naturalKey, parseNaturalKey, parseFields, pickFields, listEntities,
  resolveKeys, changesSince, graphVersion, exportEntities, ENTITY_FIELDS,
} from '../../api/lib/entity-catalog.js';

const row = (over = {}) => ({
  id: 1248015, canonical_name: 'Mullá Ḥusayn', entity_type: 'person', religion: '',
  importance: 90, mention_count: 412, doc_count: 7, era: null, description: null, ...over,
});

describe('natural key — identity that survives renumbering', () => {
  it('round-trips', () => {
    const k = naturalKey(row());
    expect(parseNaturalKey(k)).toEqual({ entity_type: 'person', canonical_name: 'Mullá Ḥusayn', religion: '' });
  });

  it('survives a name containing the delimiter — encodeURIComponent escapes it', () => {
    const k = naturalKey(row({ canonical_name: 'Odd|Name' }));
    expect(k.split('|')).toHaveLength(3);
    expect(parseNaturalKey(k).canonical_name).toBe('Odd|Name');
  });

  it('treats NULL and empty religion as the SAME key — SQLite compares NULLs distinct, so the table UNIQUE does not', () => {
    expect(naturalKey(row({ religion: null }))).toBe(naturalKey(row({ religion: '' })));
  });

  it('never encodes the id — an id-derived key would defeat the entire point', () => {
    expect(naturalKey(row())).not.toContain('1248015');
  });

  it('rejects malformed keys instead of guessing', () => {
    expect(parseNaturalKey('person|onlytwo')).toBeNull();
    expect(parseNaturalKey('')).toBeNull();
    expect(parseNaturalKey('person||')).toBeNull();   // empty name is not an identity
  });
});

describe('field selection (R4)', () => {
  it('defaults to a useful subset', () => expect(parseFields(null)).toContain('name'));
  it('always includes id and key so a row stays resolvable', () => {
    expect(parseFields('name')).toEqual(expect.arrayContaining(['id', 'key']));
  });
  it('ignores unknown fields rather than erroring — a client adding a field should degrade, not break', () => {
    expect(parseFields('name,notAField')).not.toContain('notAField');
  });
  it('falls back to defaults when nothing valid is asked for', () => {
    expect(parseFields('nope,alsoNope')).toEqual(parseFields(null));
  });
  it('projects only the requested fields', () => {
    expect(Object.keys(pickFields(row(), ['id', 'key', 'name']))).toEqual(['id', 'key', 'name']);
  });
});

describe('listEntities (R1)', () => {
  const deps = (captured) => ({
    queryAll: async (sql, args) => { captured.sql = sql; captured.args = args; return [row()]; },
    queryOne: async () => ({ n: 1 }),
  });

  it('excludes merged entities — the enumeration would otherwise have served 6,668 phantoms', async () => {
    const c = {};
    await listEntities({ deps: deps(c) });
    expect(c.sql).toMatch(/last_assessed_version/);
    expect(c.sql).toContain('⟨merged→');
  });

  it('filters on entity_type — the column is entity_type, never type', async () => {
    const c = {};
    await listEntities({ type: 'person', deps: deps(c) });
    expect(c.sql).toMatch(/entity_type = \?/);
    expect(c.args).toContain('person');
  });

  it('returns a natural key on every record', async () => {
    const r = await listEntities({ deps: deps({}) });
    expect(r.entities[0].key).toBe(naturalKey(row()));
  });

  it('keyset paging orders by id and skips the count — a running total is meaningless mid-scan', async () => {
    const c = {};
    const r = await listEntities({ after: 1248000, deps: deps(c) });
    expect(c.sql).toMatch(/id > \?/);
    expect(r.total).toBeNull();
    expect(r.offset).toBeNull();
  });

  it('caps limit so one request cannot ask for the whole graph', async () => {
    const r = await listEntities({ limit: 999999, deps: deps({}) });
    expect(r.limit).toBeLessThanOrEqual(1000);
  });
});

describe('resolveKeys (R2)', () => {
  it('maps keys to ids and reports unresolvable ones as null rather than dropping them', async () => {
    const deps = { queryAll: async () => [row()] };
    const k = naturalKey(row());
    const r = await resolveKeys([k, 'person|Nobody|'], { deps });
    expect(r.resolved[k]).toBe(1248015);
    expect(r.resolved['person|Nobody|']).toBeNull();
    expect(r.missing).toBe(1);
  });

  it('only resolves LIVE entities — a merged id is not a valid answer', async () => {
    let sql = '';
    await resolveKeys([naturalKey(row())], { deps: { queryAll: async (s) => { sql = s; return []; } } });
    expect(sql).toMatch(/last_assessed_version/);
  });

  it('handles a malformed key without throwing', async () => {
    const r = await resolveKeys(['garbage'], { deps: { queryAll: async () => [] } });
    expect(r.resolved.garbage).toBeNull();
  });
});

describe('change feed (R5)', () => {
  const deps = {
    queryAll: async () => [{ seq: 5, entity_id: 1248015, op: 'update', canonical_name: 'Mullá Ḥusayn',
      entity_type: 'person', religion: '', merged_into: null, changed_at: 1787341847 }],
    queryOne: async () => ({ s: 9, minSeq: 3 }),
  };

  it('returns a cursor the client can poll with', async () => {
    const r = await changesSince(4, { deps });
    expect(r.latestSeq).toBe(9);
    expect(r.changes[0].seq).toBe(5);
  });

  it('flags truncation — a cursor older than the feed means the client must re-export, not silently skip', async () => {
    const r = await changesSince(1, { deps });
    expect(r.truncated).toBe(true);
  });

  it('carries the natural key so a consumer can act without a second lookup', async () => {
    const r = await changesSince(4, { deps });
    expect(r.changes[0].key).toBe(naturalKey({ canonical_name: 'Mullá Ḥusayn', entity_type: 'person', religion: '' }));
  });
});

describe('graphVersion (R2)', () => {
  const deps = { queryOne: async (sql) =>
    /sqlite_sequence/.test(sql) ? { seq: 1302536 }
      : /graph_entity_changes/.test(sql) ? { s: 12 }
        : { total: 52765, minId: 1247551, maxId: 1302536, live: 46042 } };

  it('never claims ids are stable', async () => {
    expect((await graphVersion({ deps })).idsAreStable).toBe(false);
  });

  it('exposes minId — the only observable that reveals a renumber', async () => {
    const v = await graphVersion({ deps });
    expect(v.minId).toBe(1247551);
    expect(v.generation).toContain('1247551');
  });
});

describe('exportEntities (R3)', () => {
  it('walks by keyset and terminates', async () => {
    let call = 0;
    const deps = {
      queryAll: async () => (++call === 1 ? [row({ id: 1 }), row({ id: 2 })] : []),
      queryOne: async () => ({ n: 2 }),
    };
    const out = [];
    for await (const e of exportEntities({ batchSize: 2, deps })) out.push(e);
    expect(out).toHaveLength(2);
  });
});

describe('field contract', () => {
  it('advertises exactly the fields pickFields can produce', () => {
    expect(Object.keys(pickFields(row(), ENTITY_FIELDS)).sort()).toEqual([...ENTITY_FIELDS].sort());
  });
});
