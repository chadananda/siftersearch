// Admin: GET /api/admin/anis/overview?days=30 — the Anís hub's data (activity, costs, assessment, System-1) in one call.
// Each section fails on its own (a missing store shows as unavailable, never breaks the page).
import { queryAll } from '../lib/db.js';
import { requireTier } from '../lib/auth.js';
import { anisActivity, anisCosts, anisAssessment, anisSystem1 } from '../lib/anis/admin-overview.js';

export default async function anisAdminRoutes(fastify) {
  fastify.get('/anis/overview', {
    preHandler: requireTier('admin'),
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => {
    const days = request.query.days || 30;
    const safe = async (fn) => { try { return await fn(); } catch (err) { return { available: false, error: String(err.message || err).slice(0, 200) }; } };
    const [activity, costs, assessment, system1] = await Promise.all([
      safe(() => anisActivity({ queryAll }, days)),
      safe(() => anisCosts({ queryAll }, days)),
      safe(() => anisAssessment({}, days)),
      safe(() => anisSystem1({}, days)),
    ]);
    return { days, activity, costs, assessment, system1 };
  });
}
