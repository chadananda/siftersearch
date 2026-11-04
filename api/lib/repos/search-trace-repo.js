// search-trace-repo — bounded reads of search_trace (migration 122) for the search latency contract
// (api/lib/search/latency-budget.js, GET /api/admin/ops/search-latency). Range on idx_strace_created, capped rows. Deps: db.
import { queryAll } from '../db.js';

/** The newest traces of the last `minutes` (at most `limit`): endpoint + timings only, newest first. */
export const recentTraceTimings = ({ minutes = 60, limit = 5000 } = {}) => queryAll(
  `SELECT endpoint, timings_json, created_at FROM search_trace WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`,
  [Math.floor(Date.now() / 1000) - Math.max(1, Number(minutes) || 60) * 60, Math.min(Math.max(1, Number(limit) || 5000), 20000)],
  'search-trace:recent-timings');
