// ai-usage-repo — read side of the ai_usage ledger (spend per model × caller). Writes stay in ai-services logAIUsage.
// Callers: scripts/ops/model-review.mjs. Deps: db.js.
import { queryAll } from '../db.js';

/** Spend, calls and tokens per model over the last `days` days (estimated_cost_usd as logged). */
export async function spendByModel(days = 30) {
  return queryAll(`SELECT model, provider, COUNT(*) AS calls, ROUND(SUM(estimated_cost_usd), 2) AS usd,
      SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(success = 0) AS failures
    FROM ai_usage WHERE timestamp > datetime('now', ?) GROUP BY model, provider ORDER BY usd DESC`, [`-${Number(days)} days`]);
}
