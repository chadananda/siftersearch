// write-stats-repo — reads of db_write_stats (migration 145: the single writer's batches per minute × caller × name) for the
// 'write-stats' ops report (db-write-path-20261023). Range read on the primary key's leading column. Deps: db.js.
import { queryAll } from '../db.js';

/** Every per-minute row of the last `hours` (≈ minutes × active callers; tens of thousands at most). */
export const writeStatsRows = ({ hours = 24 } = {}) => queryAll(`SELECT minute, caller, name, batches, statements, changes, errors, ms_total, ms_max
  FROM db_write_stats WHERE minute >= ? ORDER BY minute`, [new Date(Date.now() - Number(hours) * 3600000).toISOString().slice(0, 16)], 'write-stats:rows');
