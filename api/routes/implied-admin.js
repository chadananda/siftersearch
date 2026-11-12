// Implication browser admin API (/api/admin/implied*, /api/admin/hype/paragraph/*). requireAdmin. Reads: repo/service + latest `implied-overview` report. Writes: implied-repo (single writer) + reindex queue.
import { requireAdmin } from '../lib/auth.js';
import { latest } from '../lib/repos/ops-report-repo.js';
import * as S from '../lib/implied/service.js';
import * as repo from '../lib/repos/implied-repo.js';
import * as qs from '../lib/repos/question-score-repo.js';

const notFound = (what) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const editor = (req) => req.user?.email || req.user?.sub || null;
const reindex = (r, deps) => (r?.docId ? S.queueReindex([r.docId], deps) : 'none');
const fail = (code, reason) => Object.assign(new Error(reason), { statusCode: code, reason });

export default async function impliedAdminRoutes(fastify, opts = {}) {
  const deps = opts.deps || {}, pre = { preHandler: requireAdmin };
  fastify.get('/implied/overview', pre, async () => {
    const run = await latest('implied-overview');
    return run?.result ? { ...run.result, asOf: run.result.asOf || run.finished_at } : { asOf: null, pending: true, totals: { items: 0, paragraphs: 0, byStatus: {}, bySource: {} }, byConcept: [], byReligion: [], spend: null, featured: [] };
  });
  fastify.get('/implied/search', pre, async (req) => { const q = req.query || {}; if (!q.q) throw fail(400, 'q is required'); return S.searchHits({ q: q.q, limit: num(q.limit, 30), status: q.status, religion: q.religion, stated: q.stated === '1' || q.stated === 'true', rater: editor(req) || '' }, deps); });
  fastify.get('/implied/graph', pre, async (req) => { const q = req.query || {}; return S.graph({ concept: q.concept, religion: q.religion, root: q.root ? Number(q.root) : undefined, limit: num(q.limit, 150) }, deps); });
  fastify.get('/implied/edits', pre, async (req) => ({ edits: await repo.recentEdits(Math.min(num(req.query?.limit, 50), 500)) }));
  fastify.get('/implied', pre, async (req) => { const q = req.query || {}; return S.listItems({ status: q.status, concept: q.concept, religion: q.religion, docId: q.docId ? Number(q.docId) : undefined, author: q.author, text: q.text, sort: q.sort || 'new', limit: Math.min(num(q.limit, 50), 200), cursor: num(q.cursor, 0), rater: editor(req) || '' }); });
  // question scores (1-5 per question, per rater) — static paths, so they win over /implied/:id
  fastify.put('/implied/score', pre, async (req) => ({ score: await qs.setScore(req.body || {}, editor(req) || '') }));
  fastify.delete('/implied/score', pre, async (req) => qs.clearScore({ paraId: req.query?.paraId, question: req.query?.question }, editor(req) || ''));
  fastify.get('/implied/scores/stats', pre, async () => S.scoreStats());
  fastify.get('/implied/scores', pre, async (req) => { const q = req.query || {}; return S.scoredList({ max: q.max ? Number(q.max) : undefined, kind: q.kind, limit: num(q.limit, 50), cursor: num(q.cursor, 0) }); });
  fastify.get('/implied/:id', pre, async (req) => (await S.itemDetail(Number(req.params.id), editor(req) || '')) || (() => { throw notFound('item'); })());
  fastify.get('/implied/:id/similar', pre, async (req) => (await S.similarTo(Number(req.params.id), { limit: Math.min(num(req.query?.limit, 20), 100) }, deps)) || (() => { throw notFound('item'); })());
  fastify.post('/implied/import', pre, async (req) => { const r = await S.importRun({ file: req.body?.file }, deps.import || {}); if (r.docIds?.length) r.reindex = await S.queueReindex(r.docIds, deps); return r; });
  fastify.post('/implied/bulk', pre, async (req) => {
    const { ids, status } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) throw fail(400, 'ids[] is required');
    const r = await repo.bulkStatus(ids.map(Number), status, { editor: editor(req) });
    return { updated: r.updated, reindex: r.docIds.length ? await S.queueReindex(r.docIds, deps) : 'none' };
  });
  fastify.post('/implied', pre, async (req) => {
    const b = req.body || {};
    if (!b.paraId || !b.question || !b.implies) throw fail(400, 'paraId, question and implies are required');
    const bad = b.force ? null : await S.proofFault(b.paraId, b.proof);
    if (bad) { const e = fail(422, bad); throw e; }
    const r = await repo.createImplied(b.paraId, b, { editor: editor(req) });
    if (!r) throw notFound('paragraph');
    return { ...(await S.itemDetail(r.item.id)), reindex: await reindex(r, deps) };
  });
  fastify.patch('/implied/:id', pre, async (req) => {
    const b = req.body || {};
    if (b.proof !== undefined && !b.force) { const cur = await repo.getRow(Number(req.params.id)); if (!cur) throw notFound('item'); const bad = await S.proofFault(cur.paraId, b.proof); if (bad) throw fail(422, bad); }
    const r = await repo.patchImplied(Number(req.params.id), b, { editor: editor(req) });
    if (!r) throw notFound('item');
    return { item: S.shapeItem((await repo.itemsByIds([r.item.id]))[0]), reindex: await reindex(r, deps) };
  });
  fastify.delete('/implied/:id', pre, async (req) => {
    const id = Number(req.params.id), hard = req.query?.hard === '1' || req.query?.hard === 'true';
    const r = hard ? await repo.deleteImplied(id, { editor: editor(req) }) : await repo.patchImplied(id, { status: 'rejected' }, { editor: editor(req) });
    if (!r) throw notFound('item');
    return { ok: true, hard, reindex: await reindex(r, deps) };
  });
  // HyPE editor
  fastify.get('/hype/paragraph/:paraId', pre, async (req) => (await S.paragraphEditor(Number(req.params.paraId), editor(req) || '')) || (() => { throw notFound('paragraph'); })());
  fastify.put('/hype/paragraph/:paraId', pre, async (req) => {
    const r = await repo.saveStated(Number(req.params.paraId), { stated: req.body?.stated, thesis: req.body?.thesis }, { editor: editor(req) });
    if (!r) throw notFound('paragraph');
    return { ok: true, reindex: await reindex(r, deps) };
  });
  fastify.post('/hype/paragraph/:paraId/propose', pre, async (req) => {
    const r = await S.propose(Number(req.params.paraId), deps.propose || {});
    if (!r) throw notFound('paragraph');
    return r;
  });
}
