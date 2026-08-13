// Guards for migrations that touch schema they do not themselves create.
//
// Several content-DB migrations build indexes over graph.db tables (created by graphMigrations) or over
// columns added by other migration sets. On a database where that schema is not present yet, the raw
// CREATE INDEX throws and the runner aborts the WHOLE remaining run — migration 82 taking down 56 tests
// was the visible half; the invisible half is a production DB stopping mid-upgrade at an optional index.
//
// An index is an OPTIMIZATION. Missing one must never block a schema upgrade. Missing one must also never
// be invisible, so every skip is logged with the reason — never a bare catch. Anything that is NOT a
// missing table/column still throws, because that is a real migration failure.
// Deps: api/lib/logger.js

import { logger } from '../logger.js';

const rowsOf = (r) => (Array.isArray(r) ? r : r?.rows ?? []);

export async function tableExists(runner, table) {
  const r = await runner(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table]);
  return rowsOf(r).length > 0;
}

export async function columnsExist(runner, table, columns) {
  const cols = new Set(rowsOf(await runner(`PRAGMA table_info(${table})`)).map((c) => c.name));
  return columns.every((c) => cols.has(c));
}

/**
 * Create an index only if its table and every indexed column exist; otherwise log WHY it was skipped and
 * carry on. `runner` is query (content DB) or graphQuery (graph DB) — the guard is the same either way.
 */
export async function ensureIndex(runner, { label, table, columns = [], sql }) {
  if (!(await tableExists(runner, table))) {
    logger.warn(`${label}: skipped — table '${table}' does not exist in this database`);
    return false;
  }
  if (columns.length && !(await columnsExist(runner, table, columns))) {
    logger.warn(`${label}: skipped — table '${table}' lacks one of [${columns.join(', ')}]`);
    return false;
  }
  await runner(sql);
  logger.info(`${label}: applied`);
  return true;
}

/** Run `fn` only when `table` is present; log the skip otherwise. For data fixes, not just indexes. */
export async function onTable(runner, table, label, fn) {
  if (!(await tableExists(runner, table))) {
    logger.warn(`${label}: skipped — table '${table}' does not exist in this database`);
    return false;
  }
  await fn();
  return true;
}
