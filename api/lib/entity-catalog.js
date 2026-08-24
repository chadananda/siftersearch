// Entity catalog — the external-consumer surface over graph_entities (R1–R7).
//
// Built for clients matching outside text against SifterSearch people, who need to enumerate the graph
// and keep their mapping working across rebuilds. The governing fact: `graph_entities.id` is
// AUTOINCREMENT and a rebuild renumbers — ids currently run 1,247,551–1,302,536 over ~52,765 rows, which
// is itself proof a wholesale renumber already happened. So every record carries a NATURAL KEY, and
// resolve() maps keys back to current ids after any renumber.
//
// Liveness comes from entity-live.js — the ONE definition (2026-08-24: a second definition let 6,668
// merged rows be served as live people). Deps: db.js, entity-live.js.
import { queryAll, queryOne } from './db.js';
import { LIVE_SQL } from './entity-live.js';

export const ENTITY_FIELDS = Object.freeze([
  'id', 'key', 'name', 'type', 'religion', 'importance', 'mentionCount', 'docCount', 'era', 'description',
]);
const DEFAULT_FIELDS = ['id', 'key', 'name', 'type', 'importance', 'mentionCount'];

// ── R2. Natural key = the table's own UNIQUE(canonical_name, entity_type, religion), percent-encoded so
// the delimiter can never occur inside a component (encodeURIComponent escapes '|' as %7C).
// religion is normalised NULL→'' because SQLite compares NULLs distinct, so the column's UNIQUE
// constraint does NOT actually enforce this key — 16,318 rows are NULL. Treat the key as the identity
// and the constraint as incidental.
export function naturalKey({ canonical_name, entity_type, religion } = {}) {
  const enc = (v) => encodeURIComponent(String(v ?? '').normalize('NFC'));
  return `${enc(entity_type)}|${enc(canonical_name)}|${enc(religion ?? '')}`;
}

export function parseNaturalKey(key) {
  const parts = String(key ?? '').split('|');
  if (parts.length !== 3) return null;
  const [type, name, religion] = parts.map((p) => { try { return decodeURIComponent(p); } catch { return null; } });
  if (type == null || name == null || religion == null || !type || !name) return null;
  return { entity_type: type, canonical_name: name, religion };
}

// ── R4. Field selection. Unknown names are ignored rather than erroring: a consumer adding a field we
// do not have yet should degrade, not break.
export function parseFields(spec) {
  if (!spec) return DEFAULT_FIELDS;
  const want = String(spec).split(',').map((f) => f.trim()).filter(Boolean);
  const picked = want.filter((f) => ENTITY_FIELDS.includes(f));
  return picked.length ? [...new Set(['id', 'key', ...picked])] : DEFAULT_FIELDS;
}

const shape = (row) => ({
  id: row.id,
  key: naturalKey(row),
  name: row.canonical_name,
  type: row.entity_type,
  religion: row.religion ?? '',
  importance: row.importance ?? 0,
  mentionCount: row.mention_count ?? 0,
  docCount: row.doc_count ?? 0,
  era: row.era ?? null,
  description: row.description ?? null,
});

export const pickFields = (row, fields) =>
  Object.fromEntries(Object.entries(shape(row)).filter(([k]) => fields.includes(k)));

const ORDERS = {
  importance: 'importance DESC, id',
  mentions: 'mention_count DESC, id',
  name: 'canonical_name, id',
  id: 'id',
};

/**
 * R1 — enumerate live entities. Supports offset paging and, for deep traversal, keyset paging via
 * `after` (an id). Keyset is O(1) per page where OFFSET is O(offset), so bulk consumers should use it.
 */
export async function listEntities({
  type = null, religion = null, minImportance = null, q = null,
  order = 'importance', limit = 100, offset = 0, after = null, fields = null, deps = {},
} = {}) {
  const qAll = deps.queryAll || queryAll;
  const qOne = deps.queryOne || queryOne;
  const cols = parseFields(fields);
  const lim = Math.min(1000, Math.max(1, Number(limit) || 100));
  const off = Math.max(0, Number(offset) || 0);
  const orderBy = ORDERS[order] || ORDERS.importance;

  const where = [LIVE_SQL()];
  const args = [];
  if (type) { where.push('entity_type = ?'); args.push(type); }
  if (religion != null) { where.push("COALESCE(religion,'') = ?"); args.push(religion); }
  if (minImportance != null) { where.push('COALESCE(importance,0) >= ?'); args.push(Number(minImportance)); }
  if (q) { where.push('LOWER(canonical_name) LIKE ?'); args.push(`%${String(q).toLowerCase()}%`); }
  if (after != null) { where.push('id > ?'); args.push(Number(after)); }
  const whereSql = where.join(' AND ');

  const rows = await qAll(
    `SELECT id, canonical_name, entity_type, religion, importance, mention_count, doc_count, era, description
       FROM graph_entities WHERE ${whereSql}
      ORDER BY ${after != null ? 'id' : orderBy} LIMIT ? OFFSET ?`,
    [...args, lim, after != null ? 0 : off]);

  // COUNT over the same predicate. Skipped when keyset-paging, where a running total is meaningless.
  let total = null;
  if (after == null) {
    const c = await qOne(`SELECT COUNT(*) n FROM graph_entities WHERE ${whereSql}`, args);
    total = c?.n ?? null;
  }

  return {
    total, limit: lim, offset: after != null ? null : off,
    nextAfter: rows.length === lim ? rows[rows.length - 1].id : null,
    entities: rows.map((r) => pickFields(r, cols)),
  };
}

/**
 * R3 — bulk export. An async generator over keyset pages so the route can stream NDJSON without ever
 * holding the whole graph in memory.
 */
export async function* exportEntities({ type = null, fields = null, batchSize = 1000, deps = {} } = {}) {
  const cols = parseFields(fields);
  let after = null;
  for (;;) {
    const page = await listEntities({ type, after, limit: batchSize, fields: cols.join(','), deps });
    if (!page.entities.length) return;
    for (const e of page.entities) yield e;
    if (page.nextAfter == null) return;
    after = page.nextAfter;
  }
}

/**
 * R2 — resolve natural keys back to current ids. This is the repair path after a renumber, so it takes
 * a batch: a consumer re-resolving 50k keys one HTTP call at a time is not a real option.
 * Unresolvable keys come back explicitly as null rather than being dropped.
 */
export async function resolveKeys(keys = [], { deps = {} } = {}) {
  const qAll = deps.queryAll || queryAll;
  const parsed = keys.map((k) => ({ key: k, parts: parseNaturalKey(k) }));
  const valid = parsed.filter((p) => p.parts);
  const out = Object.fromEntries(parsed.map((p) => [p.key, null]));
  if (!valid.length) return { resolved: out, found: 0, missing: parsed.length };

  // Chunked IN-list on (canonical_name, entity_type, religion) — covered by idx_ge_canonical_lower.
  for (let i = 0; i < valid.length; i += 300) {
    const chunk = valid.slice(i, i + 300);
    const clause = chunk.map(() => "(canonical_name = ? AND entity_type = ? AND COALESCE(religion,'') = ?)").join(' OR ');
    const args = chunk.flatMap((c) => [c.parts.canonical_name, c.parts.entity_type, c.parts.religion]);
    const rows = await qAll(
      `SELECT id, canonical_name, entity_type, religion FROM graph_entities
        WHERE (${clause}) AND ${LIVE_SQL()}`, args);
    for (const r of rows) out[naturalKey(r)] = r.id;
  }
  const found = Object.values(out).filter((v) => v != null).length;
  return { resolved: out, found, missing: parsed.length - found };
}

/**
 * R5 — change feed. `since` is a seq cursor; poll with the returned latestSeq.
 * Honest about its own history: the feed starts when migration 118 installed the triggers, so a
 * consumer that has never synced must do a full export first rather than replaying from 0.
 */
export async function changesSince(since = 0, { limit = 1000, deps = {} } = {}) {
  const qAll = deps.queryAll || queryAll;
  const qOne = deps.queryOne || queryOne;
  const lim = Math.min(5000, Math.max(1, Number(limit) || 1000));
  const rows = await qAll(
    `SELECT seq, entity_id, op, canonical_name, entity_type, religion, merged_into, changed_at
       FROM graph_entity_changes WHERE seq > ? ORDER BY seq LIMIT ?`, [Number(since) || 0, lim]);
  const head = await qOne(`SELECT COALESCE(MAX(seq),0) s, COALESCE(MIN(seq),0) minSeq FROM graph_entity_changes`);
  return {
    since: Number(since) || 0,
    latestSeq: head?.s ?? 0,
    earliestSeq: head?.minSeq ?? 0,
    truncated: (Number(since) || 0) > 0 && (head?.minSeq ?? 0) > (Number(since) || 0) + 1,
    changes: rows.map((r) => ({
      seq: r.seq, entityId: r.entity_id, op: r.op,
      key: naturalKey(r), name: r.canonical_name, type: r.entity_type,
      mergedInto: r.merged_into ?? null,
      changedAt: r.changed_at ? new Date(r.changed_at * 1000).toISOString() : null,
    })),
    more: rows.length === lim,
  };
}

/**
 * Graph generation fingerprint. `minId` is the renumber detector: ids are AUTOINCREMENT and never
 * reused, so the floor only moves when the graph was rebuilt from scratch. A consumer that stores this
 * and sees minId change knows every id it holds is stale and must be re-resolved by natural key.
 */
export async function graphVersion({ deps = {} } = {}) {
  const qOne = deps.queryOne || queryOne;
  const g = await qOne(
    `SELECT COUNT(*) total, MIN(id) minId, MAX(id) maxId,
            SUM(CASE WHEN ${LIVE_SQL()} THEN 1 ELSE 0 END) live FROM graph_entities`);
  const seq = await qOne(`SELECT seq FROM sqlite_sequence WHERE name='graph_entities'`).catch(() => null);
  const feed = await qOne(`SELECT COALESCE(MAX(seq),0) s FROM graph_entity_changes`).catch(() => null);
  return {
    generation: `${g?.minId ?? 0}-${g?.total ?? 0}`,
    entityCount: g?.total ?? 0,
    liveCount: g?.live ?? 0,
    minId: g?.minId ?? null,
    maxId: g?.maxId ?? null,
    sequence: seq?.seq ?? null,
    changeSeq: feed?.s ?? 0,
    idsAreStable: false,
    note: 'ids are AUTOINCREMENT and renumber on a full rebuild — store `key` (the natural key) as your durable identity and re-resolve via POST /entities/resolve when `minId` changes',
  };
}
