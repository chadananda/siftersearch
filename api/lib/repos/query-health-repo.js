// query-health-repo — reads of slow_query_log (migration 109) and query_stats (111/113): which process/statement blocked,
// and WHEN, so a live cause can be told from a stale entry still inside the 24h alert window; where query time goes.
// Both live in the TELEMETRY STORE since db-write-path-20261023 (telemetry.db, db.js telemetryAll). Indexed on time; cheap.
// Deps: db.js.
import { telemetryAll as queryAll, telemetryOne } from '../db.js';

/** Statements over `minMs` in the last `hours`, per hour × process × kind × caller, with the worst sample. */
export async function slowQueriesByHour({ hours = 24, minMs = 5000 } = {}) {
  return queryAll(`SELECT strftime('%Y-%m-%d %H:00', at, 'unixepoch') AS hour, proc, kind, COALESCE(name, '') AS name,
      COUNT(*) AS n, MAX(duration_ms) AS worst_ms, ROUND(SUM(duration_ms) / 1000.0) AS total_s,
      substr(MAX(printf('%012d', duration_ms) || sql_sample), 13, 160) AS worst_sql
    FROM slow_query_log WHERE at > unixepoch() - ? * 3600 AND duration_ms >= ?
    GROUP BY 1, 2, 3, 4 ORDER BY 1 DESC, n DESC`, [Number(hours), Number(minMs)], 'query-health:slow-by-hour');
}

/** How many statements blocked ≥ minMs in the last `hours`, and the worst (Observatory health). */
export async function slowQueryCount({ hours = 24, minMs = 5000 } = {}) {
  const r = (await queryAll(`SELECT COUNT(*) AS n, MAX(duration_ms) AS worst_ms FROM slow_query_log WHERE at > unixepoch() - ? * 3600 AND duration_ms >= ?`,
    [Number(hours), Number(minMs)], 'query-health:count'))[0] || {};
  return { n: r.n || 0, worst_ms: r.worst_ms || 0, min_ms: minMs };
}

/** Query time per process × kind × label since `since` (unix s), heaviest first — /server/query-time. */
export const queryTimeByLabel = (since, limit = 60) => queryAll(`SELECT proc, kind, label, MAX(name) name,
    SUM(n) n, SUM(total_ms) total_ms, MAX(max_ms) max_ms, MAX(sql_sample) sql_sample
  FROM query_stats WHERE hour >= ? GROUP BY proc, kind, label ORDER BY total_ms DESC LIMIT ?`, [since, limit], 'admin:query-time-report');
export const queryTimeByProc = (since) => queryAll(`SELECT proc, SUM(n) n, SUM(total_ms) total_ms FROM query_stats WHERE hour >= ?
  GROUP BY proc ORDER BY total_ms DESC`, [since], 'admin:query-time-proc');
export const queryTimeSpan = (since) => telemetryOne('SELECT MIN(hour) lo, MAX(hour) hi FROM query_stats WHERE hour >= ?', [since], 'admin:query-time-span');
/** Slow statements grouped by shape since `since` (unix s), worst total first — /server/slow-queries. */
export const slowQueryGroups = (since, minMs, limit = 50) => queryAll(`SELECT fingerprint, kind, proc, db_name,
    COUNT(*) n, MAX(duration_ms) worst_ms, SUM(duration_ms) total_ms, CAST(AVG(duration_ms) AS INT) avg_ms, MAX(at) last_at,
    MAX(sql_sample) sql_sample, MAX(query_plan) query_plan, MAX(name) name
  FROM slow_query_log WHERE at >= ? AND duration_ms >= ? GROUP BY fingerprint, kind, proc, db_name ORDER BY total_ms DESC LIMIT ?`,
[since, minMs, limit], 'admin:slow-queries');
