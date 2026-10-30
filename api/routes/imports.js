// /api/admin/imports — donor-drive review (the /admin/imports page): donors → drives → intake_items, decisions, the per-drive and per-donor reports (/admin/imports/report).
// Admin-only (requireInternal: X-Internal-Key or admin session). Deps: repos/archives-repo.js. Plan: planning/donor-intake-plan-20261030.md.
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import * as archives from '../lib/repos/archives-repo.js';

const DECISIONS = ['approve', 'deny', 'more_info'];
const SECTIONS = ['main', 'covenant-breaker', 'set-aside'];

/** Fold itemCounts rows into per-dimension totals; the raw rows stay so the page can total any filter combination. */
export function summarize(rows) {
  const by = { section: {}, kind: {}, match: {}, decision: {} };
  let total = 0;
  for (const r of rows) {
    total += r.n;
    for (const k of Object.keys(by)) { const v = r[k] ?? (k === 'decision' ? 'undecided' : 'none'); by[k][v] = (by[k][v] || 0) + r.n; }
  }
  return { total, ...by, rows };
}

const decisionOf = (body) => {
  const d = body?.decision ?? null;
  if (d !== null && !DECISIONS.includes(d)) throw ApiError.badRequest(`decision must be one of ${DECISIONS.join(', ')} or null`);
  const note = body?.note == null ? null : String(body.note).slice(0, 4000);
  if (d === 'more_info' && !note?.trim()) throw ApiError.badRequest('more_info needs a note (what to look into)');
  return { decision: d, note };
};
const who = (req) => req.user?.email || String(req.user?.sub ?? 'admin');

let clipStore = null;   // one R2 client per process (creating one verifies the token)

export default async function importsRoutes(fastify) {
  const admin = { preHandler: requireInternal };

  fastify.get('/imports/donors-drives', admin, async () => {
    const [donors, drives] = await Promise.all([archives.listDonors(), archives.listDrives()]);
    const withCounts = await Promise.all(drives.map(async (d) => ({ ...d, counts: summarize(await archives.itemCounts(d.id)) })));
    return { donors: donors.map((p) => ({ ...p, drives: withCounts.filter((d) => d.donor_id === p.id) })),
      orphanDrives: withCounts.filter((d) => !donors.some((p) => p.id === d.donor_id)) };
  });

  fastify.get('/imports/drives/:id/items', admin, async (req) => {
    if (!(await archives.getDrive(req.params.id))) throw ApiError.notFound('no such drive');
    const { section, kind, match, decision, q } = req.query || {};
    if (section && !SECTIONS.includes(section)) throw ApiError.badRequest('bad section');
    const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query?.offset) || 0, 0);
    const items = await archives.listItems(req.params.id, { section, kind, match, decision, q, limit: limit + 1, offset });
    return { items: items.slice(0, limit), offset, limit, more: items.length > limit };
  });

  fastify.post('/imports/items/:id/decision', admin, async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw ApiError.badRequest('numeric item id required');
    if (!(await archives.getItem(id))) throw ApiError.notFound('no such item');
    return { item: await archives.decideItem(id, { ...decisionOf(req.body), by: who(req) }) };
  });

  // A talk's first-minute clip → { url }: a short-lived signed R2 URL (tower never serves the bytes). JSON, not a redirect: admin auth is a Bearer header an <audio> can't send.
  fastify.get('/imports/items/:id/clip', admin, async (req) => {
    const it = await archives.getItem(Number(req.params.id));
    const key = it?.sample?.clip?.key;
    if (!key) throw ApiError.notFound('no clip for this item');
    clipStore ||= (await import('../lib/media/r2-stage.js')).r2StageStore().catch(() => null);
    const store = await clipStore;
    if (!store) { clipStore = null; throw ApiError.internal('no R2 store'); }
    return { url: await store.signed(key, 3600), secs: it.sample.clip.secs, ext: it.sample.clip.ext };
  });

  fastify.post('/imports/items/decision-bulk', admin, async (req) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000) throw ApiError.badRequest('ids: 1–1000 item ids');
    const d = decisionOf(req.body);
    return { updated: await archives.decideItems(ids, { ...d, by: who(req) }), decision: d.decision };
  });

  fastify.get('/imports/drives/:id/report', admin, async (req) => {
    const r = await archives.driveReport(req.params.id);
    if (!r) throw ApiError.notFound('no such drive');
    return { ...r, summary: summarize(r.counts) };
  });

  // The cumulative report for one donor: every drive they sent (the printable page /admin/imports/report?donor=<id>).
  fastify.get('/imports/donors/:id/report', admin, async (req) => {
    const r = await archives.donorReport(req.params.id);
    if (!r) throw ApiError.notFound('no such donor');
    return { ...r, drives: r.drives.map((d) => ({ ...d, summary: summarize(d.counts) })) };
  });
}
