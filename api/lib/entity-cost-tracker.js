// Entity extraction cost tracking. Writes to extraction_runs in graph.db; enforces budget guardrails.
import { graphQuery, graphQueryOne } from './db.js';
import { logger } from './logger.js';

const BUDGET = parseFloat(process.env.EXTRACTION_BUDGET_USD ?? '1000');

async function graphQueryWithRetry(sql, params, maxAttempts = 5) {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await graphQuery(sql, params);
    } catch (err) {
      if (err.code !== 'SQLITE_BUSY' || i === maxAttempts - 1) throw err;
      await delay(1000 * Math.pow(2, i));
    }
  }
}

export async function trackCost({ model, taskType, paragraphId, runId, inputTokens, outputTokens, cachedTokens, costUsd }) {
  await graphQueryWithRetry(
    `INSERT INTO extraction_runs (model, task_type, paragraph_id, run_id, input_tokens, output_tokens, cached_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [model, taskType, paragraphId ?? null, runId ?? null, inputTokens ?? 0, outputTokens ?? 0, cachedTokens ?? 0, costUsd]
  );
}

export async function getMonthlySpend() {
  const row = await graphQueryOne(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM extraction_runs
     WHERE created_at > strftime('%s', 'now', 'start of month')`
  );
  return row?.total ?? 0;
}

let _lastWarnAt = 0;
const WARN_INTERVAL_MS = 60 * 60 * 1000; // log budget warnings at most once per hour

export async function checkBudget() {
  const spend = await getMonthlySpend();
  const fraction = spend / BUDGET;
  let action = 'ok';
  if (fraction >= 1.0) action = 'halt';
  else if (fraction >= 0.8) action = 'local';
  else if (fraction >= 0.5) action = 'warn';
  if (action !== 'ok') {
    const now = Date.now();
    if (now - _lastWarnAt >= WARN_INTERVAL_MS) {
      logger.warn({ spend, budget: BUDGET, fraction: fraction.toFixed(3), action }, 'Entity extraction budget alert');
      _lastWarnAt = now;
    }
  }
  return { spend, budget: BUDGET, fraction, action };
}
