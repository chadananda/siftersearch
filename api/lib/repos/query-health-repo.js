// query-health-repo — reads of slow_query_log (migration 109): which process/statement blocked, and WHEN, so a live
// cause can be told from a stale entry still inside the 24h alert window. Indexed on `at`; cheap. Deps: db.js.
import { queryAll } from '../db.js';

/** Statements over `minMs` in the last `hours`, per hour × process × kind × caller, with the worst sample. */
export async function slowQueriesByHour({ hours = 24, minMs = 5000 } = {}) {
  return queryAll(`SELECT strftime('%Y-%m-%d %H:00', at, 'unixepoch') AS hour, proc, kind, COALESCE(name, '') AS name,
      COUNT(*) AS n, MAX(duration_ms) AS worst_ms, ROUND(SUM(duration_ms) / 1000.0) AS total_s,
      substr(MAX(printf('%012d', duration_ms) || sql_sample), 13, 160) AS worst_sql
    FROM slow_query_log WHERE at > unixepoch() - ? * 3600 AND duration_ms >= ?
    GROUP BY 1, 2, 3, 4 ORDER BY 1 DESC, n DESC`, [Number(hours), Number(minMs)], 'query-health:slow-by-hour');
}
