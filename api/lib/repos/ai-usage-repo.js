// ai-usage-repo — read side of the ai_usage ledger (spend per model × caller). Writes stay in ai-services logAIUsage.
// Callers: scripts/ops/model-review.mjs, pipeline/spend-ledger.js. Deps: db.js.
import { queryAll, queryOne } from '../db.js';

/** Spend, calls and tokens per model over the last `days` days (estimated_cost_usd as logged). */
export async function spendByModel(days = 30) {
  return queryAll(`SELECT model, provider, COUNT(*) AS calls, ROUND(SUM(estimated_cost_usd), 2) AS usd,
      SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(success = 0) AS failures
    FROM ai_usage WHERE timestamp > datetime('now', ?) GROUP BY model, provider ORDER BY usd DESC`, [`-${Number(days)} days`]);
}

/** Spend per model × caller over the last `hours` hours. */
export async function spendSince(hours = 6) {
  return queryAll(`SELECT model, caller, COUNT(*) AS calls, ROUND(SUM(estimated_cost_usd), 2) AS usd, SUM(success = 0) AS failures,
      MIN(timestamp) AS first, MAX(timestamp) AS last
    FROM ai_usage WHERE timestamp > datetime('now', ?) GROUP BY model, caller ORDER BY usd DESC LIMIT 50`, [`-${Number(hours)} hours`]);
}

/** Spend per stage (service_type) × model over the last `hours` hours, with token totals — the per-paragraph cost basis
 *  for library-wide estimates (10-14). Bounded by timestamp like spendSince. */
export async function spendByStage(hours = 12) {
  return queryAll(`SELECT service_type AS stage, model, COUNT(*) AS calls, ROUND(SUM(estimated_cost_usd), 3) AS usd,
      SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(cached_tokens) AS cached_tokens
    FROM ai_usage WHERE timestamp > datetime('now', ?) GROUP BY service_type, model ORDER BY usd DESC LIMIT 60`, [`-${Number(hours)} hours`]);
}

// INCREMENTAL SPEND ROLLUPS (10-14: the Anís admin pages took 37 s). ai_usage is append-only, so a total is carried forward
// by rowid: each call reads only rows added since the last, in short chunks that yield between them. The full-table
// GROUP BYs these replace took ~5 s each on the API's event loop — the monitor's per-book spend on every poll, the daily
// per-service spend on every call that checks the budget — and stacked into half-minute stalls once the ledger stopped
// dropping rows. dayBound rollups restart at the first row of the UTC day.
const rollups = new Map();
const CHUNK = 50000;
export async function rollupSpend(name, { key, where = '1=1', dayBound = false }, deps = {}) {
  const qa = deps.queryAll || queryAll, qo = deps.queryOne || queryOne;
  const day = new Date().toISOString().slice(0, 10);
  let r = rollups.get(name);
  if (!r || (dayBound && r.day !== day)) {
    const top = (await qo('SELECT MAX(rowid) m FROM ai_usage'))?.m ?? 0;
    const first = dayBound ? (await qo(`SELECT MIN(rowid) m FROM ai_usage WHERE timestamp >= date('now')`))?.m : 1;
    r = { day, lastId: (first ?? top + 1) - 1, sums: new Map() };
    rollups.set(name, r);
  }
  const top = (await qo('SELECT MAX(rowid) m FROM ai_usage'))?.m ?? 0;
  while (r.lastId < top) {
    const hi = Math.min(top, r.lastId + CHUNK);
    const rows = await qa(`SELECT ${key} AS k, COUNT(*) n, SUM(estimated_cost_usd) usd FROM ai_usage
      WHERE rowid > ? AND rowid <= ? AND ${where} GROUP BY k`, [r.lastId, hi]);
    for (const row of rows) {
      const cur = r.sums.get(row.k) || { calls: 0, usd: 0 };
      cur.calls += row.n || 0; cur.usd += row.usd || 0;
      r.sums.set(row.k, cur);
    }
    r.lastId = hi;
    await new Promise((res) => setImmediate(res));   // let requests through between chunks
  }
  return r.sums;
}
export const _resetRollups = () => rollups.clear();

/** Today's spend per service_type (incremental). → { [serviceType]: usd } */
export async function dailySpendByService(deps) {
  const sums = await rollupSpend('daily-by-service', { key: 'service_type', dayBound: true }, deps);
  return Object.fromEntries([...sums].map(([k, v]) => [k, v.usd]));
}

/** All-time pipeline spend per book × provider (incremental). → [{ docId, provider, calls, usd }] by usd desc */
export async function pipelineSpendByBook(deps) {
  const sums = await rollupSpend('pipeline-by-book', { key: `CAST(document_id AS INT) || '|' || provider`, where: `caller='corpus-rag' AND document_id IS NOT NULL` }, deps);
  return [...sums].map(([k, v]) => { const [docId, provider] = String(k).split('|'); return { docId: Number(docId), provider, calls: v.calls, usd: Math.round(v.usd * 10000) / 10000 }; })
    .sort((a, b) => b.usd - a.usd);
}

/** Highest ai_usage id (the rowid — instant). */
export async function maxUsageId() {
  return Number((await queryOne('SELECT MAX(id) m FROM ai_usage', [], 'spend-ledger:top'))?.m) || 0;
}

/** corpus-rag spend for one provider in an id range, after `since`. `+` keeps the planner on the rowid range: the
 *  provider/caller/timestamp indexes would scan history (40 s cold, 10-12). */
export async function corpusRagSpendInRange(fromId, toId, provider, since = '') {
  const r = await queryOne(`SELECT COALESCE(SUM(estimated_cost_usd),0) s FROM ai_usage
    WHERE id > ? AND id <= ? AND +provider = ? AND +caller = 'corpus-rag' AND +timestamp > ?`, [fromId, toId, provider, since || ''], 'spend-ledger:range');
  return Number(r?.s) || 0;
}
