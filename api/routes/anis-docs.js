// PUBLIC reads behind the three docs pages (strategy graph Phase 2), no auth, edge-cached (worker/edge-cache.js API_ROUTES):
//   GET /api/v1/anis/tools      → the tools.js registry (schemas, the code steps that call each, 7-day calls/p50/p95) merged with
//                                  the plan's tool rows; plan-only tools as built / planned
//   GET /api/v1/anis/strategies → ONE ordered list of strategies, status built | planned, Unmatched last (a built one with its own
//                                  graph carries graph, templates, 7-day numbers, branches, candidates), the code building steps
//                                  (catalog + 7-day runs/p50/$) and the plan's ladder, combining rules and decisions
//   GET /api/v1/anis/activities → the reader-facing activities from the plan, steps linked to the strategies/tools they use
// The plan = planning/anis-strategies.json (anis-docs-data.js, mtime-cached).
// Structure and aggregates only (strategy-docs.js): no turn ids, live questions or prompt text (the plan's curated example
// phrasings were already public on the retired /docs/anis-strategies page). Each answer is memoised MEMO_MS.
import { strategiesSnapshot } from '../lib/repos/strategies-repo.js';
import { strategyStats, branchStats, activityStats, toolStats, qualityByTurn } from '../lib/repos/strategy-stats-repo.js';
import { activityCatalog } from '../lib/assistant/activities/catalog.js';
import { REGISTRY } from '../lib/assistant/tools.js';
import { candidatesDb, listPromotions } from '../lib/repos/strategy-candidates-repo.js';
import { publicStrategies, publicSteps, publicTools, publicStrategyPlan, publicStrategyList, publicReaderActivities } from '../lib/assistant/strategy-docs.js';
import { loadPlan } from '../lib/assistant/anis-docs-data.js';

const MEMO_MS = 60_000, DAYS = 7;
const safe = (fn, d) => { try { return fn(); } catch { return d; } };   // no measurements yet / store unreadable → structure without numbers

export default async function anisDocsRoutes(fastify, { deps = {} } = {}) {
  const snapshot = deps.snapshot || strategiesSnapshot, activities = deps.activities || activityCatalog;
  const sStats = deps.strategyStats || strategyStats, bStats = deps.branchStats || branchStats, quality = deps.quality || qualityByTurn;
  const aStats = deps.activityStats || activityStats, tStats = deps.toolStats || toolStats;
  const promos = deps.promotions || (() => listPromotions(candidatesDb(), { limit: 500 }));
  const tools = deps.tools || (() => Object.values(REGISTRY).filter((e) => !e.internal));
  const plan = deps.plan || loadPlan;
  const memo = new Map();
  const cached = (key, build) => {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
    const value = { ...build(), days: DAYS, generated_at: new Date().toISOString() };
    memo.set(key, { at: Date.now(), value });
    return value;
  };

  fastify.get('/strategies', async (req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    return cached('strategies', () => {
      const q = safe(() => quality(DAYS), new Map());
      const snap = snapshot(), acts = activities();
      const pub = publicStrategies({ snapshot: snap, activities: acts, stats: safe(() => sStats({ days: DAYS, quality: q }), []),
        branches: (id) => safe(() => bStats(id, { days: DAYS, quality: q }), []), promotions: safe(promos, null) });
      const pl = safe(plan, null);
      return { ...pub, strategies: publicStrategyList({ plan: pl, strategies: pub.strategies }), steps: publicSteps({ activities: acts, snapshot: snap, live: safe(() => aStats({ days: DAYS }), {}) }).steps,
        plan: publicStrategyPlan({ plan: pl }) };
    });
  });
  fastify.get('/activities', async (req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    return cached('activities', () => publicReaderActivities({ plan: safe(plan, null),
      strategies: publicStrategies({ snapshot: snapshot(), activities: activities() }).strategies }));
  });
  fastify.get('/tools', async (req, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    return cached('tools', () => publicTools({ tools: tools(), activities: activities(), live: safe(() => tStats({ days: DAYS }), {}), plan: safe(plan, null) }));
  });
}
