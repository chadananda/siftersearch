// Admin: /api/admin/workplan — the WorkPlan page's data. The store is D1 behind the site Worker (/_work/*, internal
// key; worker/ops/workplan.js); this route only checks the admin and relays, so the page never holds the key.
import { requireTier } from '../lib/auth.js';

const EDGE = () => `${process.env.CLEF_URL || 'https://siftersearch.com'}/_work`;
async function relay(path, init = {}) {
  const r = await fetch(`${EDGE()}${path}`, { ...init, signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.INTERNAL_API_KEY || '' } });
  const body = await r.json().catch(() => ({ error: `edge ${r.status}` }));
  if (!r.ok) throw Object.assign(new Error(body.error || `edge ${r.status}`), { statusCode: r.status });
  return body;
}

export default async function workplanAdminRoutes(fastify) {
  const admin = { preHandler: requireTier('admin') };
  fastify.get('/workplan', admin, async () => relay('/items'));
  fastify.post('/workplan', admin, async (req) => relay('/items', { method: 'POST', body: JSON.stringify({ requested_by: 'chad', ...req.body }) }));
  fastify.post('/workplan/reorder', admin, async (req) => relay('/reorder', { method: 'POST', body: JSON.stringify(req.body || {}) }));
  fastify.post('/workplan/:id', admin, async (req) => relay(`/items/${Number(req.params.id)}`, { method: 'POST', body: JSON.stringify(req.body || {}) }));
}
