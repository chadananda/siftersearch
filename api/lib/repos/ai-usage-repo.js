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
export async function rollupSpend(name, { key, where = '1=1', dayBound = false, monthBound = false }, deps = {}) {
  const qa = deps.queryAll || queryAll, qo = deps.queryOne || queryOne;
  const day = new Date().toISOString().slice(0, monthBound ? 7 : 10);   // the period key: UTC day, or UTC month for monthBound
  let r = rollups.get(name);
  if (!r || ((dayBound || monthBound) && r.day !== day)) {
    const top = (await qo('SELECT MAX(rowid) m FROM ai_usage'))?.m ?? 0;
    // today's first row through the timestamp index — MIN(rowid) … WHERE timestamp walked the table from its oldest row
    // until today's (11.7 s measured 10-16)
    const first = dayBound || monthBound ? (await qo(`SELECT rowid AS m FROM ai_usage INDEXED BY idx_ai_usage_timestamp WHERE timestamp >= date('now'${monthBound ? ", 'start of month'" : ''}) ORDER BY timestamp LIMIT 1`))?.m : 1;
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

/** Today's (UTC) spend per provider (incremental) — the provider-wide caps' input (spend-caps.js). → { [provider]: usd } */
export async function dailySpendByProvider(deps, excludeCallers = []) {
  const ex = excludeCallers.map((c) => `'${String(c).replace(/'/g, "''")}'`).join(',');   // callers whose spend the provider caps ignore (spend-caps provider_exempt)
  const sums = await rollupSpend(ex ? 'daily-by-provider-excl' : 'daily-by-provider', { key: `COALESCE(provider, '')`, dayBound: true, ...(ex ? { where: `COALESCE(caller, '') NOT IN (${ex})` } : {}) }, deps);
  return Object.fromEntries([...sums].map(([k, v]) => [k, v.usd]));
}

/** Today's (UTC) spend per caller (incremental) — the spend caps' input (spend-caps.js). → { [caller or '']: usd } */
export async function dailySpendByCaller(deps) {
  const sums = await rollupSpend('daily-by-caller', { key: `COALESCE(caller, '')`, dayBound: true }, deps);
  return Object.fromEntries([...sums].map(([k, v]) => [k, v.usd]));
}

/** This calendar month's (UTC) spend per caller (incremental) — the hype-program monthly ceiling's input. → { [caller or '']: usd } */
export async function monthSpendByCaller(deps) {
  const sums = await rollupSpend('month-by-caller', { key: `COALESCE(caller, '')`, monthBound: true }, deps);
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

/** HyPE spend (service_type grounding:hype, any caller) in one timestamp window [from, to) → [{ day, model, docId, usd, calls }]. The implication
 *  overview report walks windows so no read is long. */
export const hypeSpendWindow = (from, to) => queryAll(`SELECT substr(timestamp, 1, 10) AS day, model, document_id AS docId, ROUND(SUM(estimated_cost_usd), 4) AS usd, COUNT(*) AS calls
  FROM ai_usage WHERE timestamp >= ? AND timestamp < ? AND service_type = 'grounding:hype' AND success = 1 GROUP BY 1, 2, 3`, [from, to], 'ai-usage:hype-window');

/** First ledger timestamp (the window walk's start). */
export const firstUsageAt = async () => (await queryOne('SELECT MIN(timestamp) AS t FROM ai_usage', [], 'ai-usage:first'))?.t || null;

/** All-time spend of the implied-question work outside HyPE itself: premise pilot/reconcile, the admin's propose button, the HyPE judge. → { [label]: usd } */
export async function impliedSideSpend() {
  const rows = await queryAll(`SELECT caller, service_type AS st, ROUND(SUM(estimated_cost_usd), 4) AS usd FROM ai_usage
    WHERE caller IN ('premise-pilot', 'implied-admin') OR service_type = 'grounding:hype-judge' GROUP BY caller, service_type`, [], 'ai-usage:implied-side');
  const out = { premise: 0, propose: 0, judge: 0 };
  for (const r of rows) { if (r.caller === 'premise-pilot') out.premise += r.usd || 0; else if (r.caller === 'implied-admin') out.propose += r.usd || 0; else out.judge += r.usd || 0; }
  return out;
}
