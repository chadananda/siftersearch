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
