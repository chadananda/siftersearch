// Anís strategy graph, read-only admin view (Phase 1) + its measurements (Phase 2, strategy-stats-repo). requireInternal
// (X-Internal-Key); CLI: scripts/ops/ops.mjs anis-strategies | anis-strategy-stats | anis-branches <id> | anis-step-stats.
//   GET /anis/strategies                   → { rev, source: db|seed, db, templates[], steps[], strategies[], activities[] }
//   GET /anis/strategies/stats?days=7      → per strategy@version: turns, share, p50/p95 ms, $/turn, judged, score, weak %, top defects
//   GET /anis/strategies/:id/branches?days → per branch (node:edge path): share of the strategy's turns + the same metrics
//   GET /anis/steps/stats?days=7           → per step@version: runs, p50/p95 ms, $, edge mix, Jev accuracy vs gold (decision steps)
// Deps: repos/strategies-repo + strategy-stats-repo (strategies.db), improve-repo + jev-calls-repo (read, via the stats repo).
import { requireInternal } from '../lib/auth.js';
import { strategiesSnapshot } from '../lib/repos/strategies-repo.js';
import { strategyStats, branchStats, stepStats } from '../lib/repos/strategy-stats-repo.js';
import { activityList } from '../lib/assistant/activities/index.js';

const daysOf = (q) => Math.min(90, Math.max(0.04, Number(q?.days) || 7));

export default async function strategiesAdminRoutes(fastify, { deps = {} } = {}) {
  const snapshot = deps.snapshot || strategiesSnapshot, activities = deps.activities || activityList;
  const stats = deps.strategyStats || strategyStats, branches = deps.branchStats || branchStats, steps = deps.stepStats || stepStats;
  fastify.get('/anis/strategies', { preHandler: requireInternal }, async () => ({ ...snapshot(), activities: activities() }));
  fastify.get('/anis/strategies/stats', { preHandler: requireInternal }, async (req) => {
    const days = daysOf(req.query);
    return { days, strategies: stats({ days }) };
  });
  fastify.get('/anis/strategies/:id/branches', { preHandler: requireInternal }, async (req) => {
    const days = daysOf(req.query);
    return { days, strategy: req.params.id, branches: branches(req.params.id, { days, version: req.query?.version ?? null }) };
  });
  fastify.get('/anis/steps/stats', { preHandler: requireInternal }, async (req) => {
    const days = daysOf(req.query);
    return { days, steps: steps({ days }) };
  });
}
