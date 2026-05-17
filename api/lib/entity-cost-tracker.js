// Entity extraction cost tracking. Writes to extraction_runs table; enforces budget guardrails.
import { query, queryOne } from './db.js';
import { logger } from './logger.js';

const BUDGET = parseFloat(process.env.EXTRACTION_BUDGET_USD ?? '1000');

export async function trackCost({ model, taskType, paragraphId, runId, inputTokens, outputTokens, cachedTokens, costUsd }) {
  await query(
    `INSERT INTO extraction_runs (model, task_type, paragraph_id, run_id, input_tokens, output_tokens, cached_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [model, taskType, paragraphId ?? null, runId ?? null, inputTokens ?? 0, outputTokens ?? 0, cachedTokens ?? 0, costUsd]
  );
}

export async function getMonthlySpend() {
  const row = await queryOne(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM extraction_runs
     WHERE created_at > strftime('%s', 'now', 'start of month')`
  );
  return row?.total ?? 0;
}

export async function checkBudget() {
  const spend = await getMonthlySpend();
  const fraction = spend / BUDGET;
  let action = 'ok';
  if (fraction >= 1.0) action = 'halt';
  else if (fraction >= 0.8) action = 'local';
  else if (fraction >= 0.5) action = 'warn';
  if (action !== 'ok') {
    logger.warn({ spend, budget: BUDGET, fraction: fraction.toFixed(3), action }, 'Entity extraction budget alert');
  }
  return { spend, budget: BUDGET, fraction, action };
}
