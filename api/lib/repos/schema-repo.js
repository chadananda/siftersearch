// schema-repo — read-only schema introspection for the ops reports 'table-schema' + 'index-sizes' (10-23 content write
// cost: which indexes/triggers a row INSERT pays for, and which ones any plan uses). pragma_* table functions, not PRAGMA
// statements (those route to the writer). Sizes walk every page of an index via dbstat — heavy lane only. Deps: db.js.
import { queryAll } from '../db.js';

/** Every index + trigger on `table`: sql, partial/unique flags, key columns (expressions as '<expr>'), sqlite_stat1. */
export async function tableSchema(table) {
  const objects = await queryAll(`SELECT type, name, sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') ORDER BY type, name`,
    [table], 'schema:objects');
  const list = await queryAll(`SELECT name, "unique" AS uniq, origin, partial FROM pragma_index_list(?)`, [table], 'schema:index-list');
  const stat = await queryAll(`SELECT idx, stat FROM sqlite_stat1 WHERE tbl = ?`, [table], 'schema:stat1').catch(() => []);
  const statBy = new Map(stat.map((r) => [r.idx, r.stat]));
  const indexes = [];
  for (const ix of list) {
    const cols = await queryAll(`SELECT seqno, cid, name, "desc" AS dsc FROM pragma_index_xinfo(?) WHERE key = 1 ORDER BY seqno`, [ix.name], 'schema:index-xinfo');
    indexes.push({ name: ix.name, unique: !!ix.uniq, origin: ix.origin, partial: !!ix.partial,
      columns: cols.map((c) => (c.cid === -2 ? '<expr>' : c.cid === -1 ? 'rowid' : c.name) + (c.dsc ? ' DESC' : '')),
      sql: objects.find((o) => o.name === ix.name)?.sql || null, stat1: statBy.get(ix.name) ?? null });
  }
  const triggers = objects.filter((o) => o.type === 'trigger').map((o) => ({ name: o.name, sql: o.sql }));
  // tables whose FOREIGN KEY points here: with foreign_keys ON, every DELETE of a row here looks up each child by its key
  // column — a full scan of the child per deleted row when no index leads with that column
  const children = await queryAll(`SELECT m.name AS child, f."from" AS col, f.on_delete,
      EXISTS (SELECT 1 FROM pragma_index_list(m.name) il, pragma_index_info(il.name) ii WHERE ii.seqno = 0 AND ii.name = f."from") AS indexed
    FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type = 'table' AND f."table" = ?`, [table], 'schema:fk-children');
  for (const c of children) {
    c.indexed = !!c.indexed;
    c.max_rowid = (await queryAll(`SELECT MAX(rowid) AS n FROM "${c.child.replace(/"/g, '')}"`, [], 'schema:child-max-rowid').catch(() => [{}]))[0]?.n ?? null;
  }
  return { table, nrow: statBy.get(table) ?? stat.find((r) => r.idx == null)?.stat ?? null, indexes, triggers, fk_children: children };
}

/** Recorded query plans (slow_query_log, indexed on `at`) that name a table or one of its indexes, newest first. */
export async function recordedPlans({ like = '%content%', days = 14, limit = 2000 } = {}) {
  return queryAll(`SELECT proc, kind, name, duration_ms, sql_sample, query_plan FROM slow_query_log
    WHERE at > unixepoch() - ? * 86400 AND query_plan IS NOT NULL AND (query_plan LIKE ? OR sql_sample LIKE ?)
    ORDER BY at DESC LIMIT ?`, [Number(days), like, like, Number(limit)], 'schema:recorded-plans');
}

/** On-disk size of one b-tree (table or index) — walks all its pages. */
export async function btreeSize(name) {
  const [r] = await queryAll(`SELECT SUM(pgsize) AS bytes, SUM(pgsize - unused) AS used, SUM(ncell) AS cells, COUNT(*) AS pages
    FROM dbstat WHERE name = ?`, [name], 'schema:btree-size');
  return { name, bytes: r?.bytes || 0, used: r?.used || 0, pages: r?.pages || 0 };
}
