// Anís strategy graph, read-only admin view (Phase 1, planning/anis-strategy-graph-plan.md). requireInternal (X-Internal-Key);
// CLI: scripts/ops/ops.mjs anis-strategies [--json].
//   GET /anis/strategies   → { rev, source: db|seed, db, templates[], steps[], strategies[] (graph per version), activities[] }
// Deps: repos/strategies-repo (its own SQLite), assistant/activities (the registry).
import { requireInternal } from '../lib/auth.js';
import { strategiesSnapshot } from '../lib/repos/strategies-repo.js';
import { activityList } from '../lib/assistant/activities/index.js';

export default async function strategiesAdminRoutes(fastify, { deps = {} } = {}) {
  const snapshot = deps.snapshot || strategiesSnapshot, activities = deps.activities || activityList;
  fastify.get('/anis/strategies', { preHandler: requireInternal }, async () => ({ ...snapshot(), activities: activities() }));
}
