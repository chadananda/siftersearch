// Anís strategy graph admin: Phase 1 read-only view, Phase 2 measurements (strategy-stats-repo), Phase 3 gaps → candidates →
// dry run → promotion (strategy-candidates-repo). requireInternal (X-Internal-Key). CLI: scripts/ops/ops.mjs anis-strategies |
// anis-strategy-stats | anis-branches <id> | anis-step-stats | anis-gaps | anis-candidates | anis-promote <id@v> [--dry] | anis-rollback <id> | anis-retire <id@v>.
//   GET /anis/strategies                   → { rev, source: db|seed, db, templates[], steps[], strategies[], activities[] }
//   GET /anis/strategies/stats?days=7      → per strategy@version: turns, share, p50/p95 ms, $/turn, judged, score, weak %, top defects
//   GET /anis/strategies/:id/branches?days → per branch (node:edge path): share of the strategy's turns + the same metrics
//   GET /anis/steps/stats?days=7           → per step@version: runs, p50/p95 ms, $, edge mix, Jev accuracy vs gold (decision steps)
//   GET  /anis/gaps         → { gaps (internal only: questions never leave the admin API), clusters (ready flag), designs }
//   GET  /anis/candidates   → { candidates (status candidate|retired|rolled_back|withdrawn|active), promotions (ledger, numbers per row) }
//   POST /anis/try {question, history?, strategy?:{id, version}, caller?, jev_only?} → { reply, path, steps, ms, usd, jev_pick }
//        the full-reply DRY RUN: no thread, no mail, billed to an improve-* caller (default improve-replay)
//   POST /anis/promote {id, version, dry?} → job (async-jobs); GET /anis/promote/:key polls it
//   POST /anis/strategy-card {id, description?, near_misses?, exemplars?} → new card version (activated provisionally when it replaces the live one)
//   POST /anis/strategy-fix {id, version?} → { id, version|null, fixed[] }: slot syntax ({x}, from:x → {{x}}) of the newest graph as a new candidate version
//   POST /anis/rollback {id} → { id, rolled_back, restored }
//   POST /anis/retire {id, version, reason?} → { id, version, was, changed }: a non-active version → 'withdrawn' (out of candidates, kept for history)
// Deps: repos/strategies-repo + strategy-stats-repo + strategy-candidates-repo (strategies.db), improve-repo + jev-calls-repo
// (read, via the stats repo), assistant/strategy-{gaps,try,improve}, async-jobs.
import { requireInternal } from '../lib/auth.js';
import { strategiesSnapshot } from '../lib/repos/strategies-repo.js';
import { strategyStats, branchStats, stepStats } from '../lib/repos/strategy-stats-repo.js';
import { IMPROVE_CFG } from '../lib/assistant/strategy-gaps.js';
import { activityList } from '../lib/assistant/activities/index.js';

const daysOf = (q) => Math.min(90, Math.max(0.04, Number(q?.days) || 7));

export default async function strategiesAdminRoutes(fastify, { deps = {} } = {}) {
  const snapshot = deps.snapshot || strategiesSnapshot, activities = deps.activities || activityList;
  const stats = deps.strategyStats || strategyStats, branches = deps.branchStats || branchStats, steps = deps.stepStats || stepStats;
  const repo = async () => deps.repo || await import('../lib/repos/strategy-candidates-repo.js');
  const db = async () => deps.db || (await repo()).candidatesDb();
  let jobs = null;
  const store = async () => (jobs ||= deps.jobs || (await import('../lib/jobs/async-jobs.js')).jobStore());
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

  fastify.get('/anis/gaps', { preHandler: requireInternal }, async (request) => {
    const r = await repo(), d = await db();
    const { clusterGaps } = await import('../lib/assistant/strategy-gaps.js');
    const clusters = clusterGaps(r.openGaps(d)).map(({ gaps, ...c }) => ({ ...c, turn_ids: gaps.map((g) => g.turn_id) }));
    return { gaps: r.listGaps(d, { limit: Math.min(Number(request.query?.limit) || 200, 2000) }), clusters, designs: r.listDesigns(d) };
  });

  fastify.get('/anis/candidates', { preHandler: requireInternal }, async (request) => {
    const r = await repo(), d = await db();
    const pl = await import('../lib/repos/strategy-planner-repo.js');   // probation status + per-node stats ride on the strategy row (planner)
    return { candidates: r.listCandidates(d, { status: request.query?.status || 'all' }).filter((c) => c.created_by !== 'seed' || request.query?.status)
      .map((c) => ({ ...c, probation: pl.probationFor(d, c.id, c.version) })), promotions: r.listPromotions(d) };
  });

  fastify.post('/anis/try', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.question) return reply.code(400).send({ error: 'question is required' });
    const caller = b.caller || 'improve-replay';
    if (!String(caller).startsWith('improve-')) return reply.code(400).send({ error: 'caller must be an improve-* caller (the improve spend group)' });
    let pin = null;
    if (b.strategy?.id) {
      pin = (await repo()).pinFor(await db(), b.strategy.id, b.strategy.version ?? null);
      if (!pin) return reply.code(404).send({ error: `no strategy ${b.strategy.id}@${b.strategy.version ?? 'latest'}` });
    }
    if (b.jev_only) {   // the promotion's guard check: only Jev's pick with the candidate's option added (no turn)
      if (!pin) return reply.code(400).send({ error: 'jev_only needs a strategy' });
      const [{ chooseStrategy }, { optionsWith }, { withAIContext }] = await Promise.all([import('../lib/assistant/strategy-choice.js'),
        import('../lib/assistant/strategy-try.js'), import('../lib/ai-context.js')]);
      const r = await withAIContext({ billTo: caller }, () => chooseStrategy([...(b.history || []), { role: 'user', content: b.question }], { options: optionsWith(pin.row) }));
      return { jev_pick: r?.strategy?.choice ?? null, confidence: r?.strategy?.confidence ?? null };
    }
    const { tryStrategy } = deps.tryStrategy ? { tryStrategy: deps.tryStrategy } : await import('../lib/assistant/strategy-try.js');
    return tryStrategy({ question: b.question, history: Array.isArray(b.history) ? b.history : [], pin, caller, ...(['agent', 'pipeline'].includes(b.engine) ? { engine: b.engine } : {}) });
  });

  fastify.post('/anis/promote', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.id) return reply.code(400).send({ error: 'id is required (version optional: latest)' });
    const { promoteCandidate } = await import('../lib/assistant/strategy-improve.js');
    const d = await db();
    const key = `strategy-promote-${b.id}-${b.version ?? 'latest'}${b.dry ? '-dry' : ''}-${Date.now().toString(36)}`;
    const rec = (await store()).start(key, () => promoteCandidate(d, { id: b.id, version: b.version ?? null, dry: !!b.dry, by: 'ops' }),
      { kind: 'strategy_promote', spec: { id: b.id, version: b.version ?? null, dry: !!b.dry } });
    return { key: rec.key, status: rec.status, poll: `/api/admin/anis/promote/${rec.key}` };
  });

  fastify.get('/anis/promote/:key', { preHandler: requireInternal }, async (request, reply) => {
    const rec = (await store()).get(request.params.key);
    return rec || reply.code(404).send({ error: 'no such promotion job' });
  });

  // re-normalizes slot syntax of a strategy's newest graph into a NEW candidate version (promote it with /anis/promote); never edits a row
  fastify.post('/anis/strategy-fix', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.id) return reply.code(400).send({ error: 'id is required' });
    try {
      const d = await db(), r = (await repo()).fixStrategySlots(d, b.id, { version: b.version ?? null, by: 'strategy-fix' });
      // a mechanical repair of a LIVE tree (parent = the active version): active at once on probation, no judge, no spend
      if (r.activatable) {
        (deps.promote || (await repo()).promote)(d, r.id, r.version, { by: 'strategy-fix', decision: { provisional: true, mechanical: 'slot-syntax' } });
        await (deps.startProbation || (async (...a) => (await import('../lib/repos/strategy-planner-repo.js')).startProbation(...a)))(d, r.id, r.version, { need: IMPROVE_CFG.planner.probation.runs, provisional: true });
        r.activated = true;
      }
      return r;
    } catch (err) { return reply.code(409).send({ error: err.message }); }
  });

  // rewrites a strategy's card (description / near_misses / exemplars) as a NEW candidate version over the same graph; a live one goes active on probation
  fastify.post('/anis/strategy-card', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.id) return reply.code(400).send({ error: 'id is required' });
    try {
      const d = await db(), r = (await repo()).editStrategyCard(d, b.id, { description: b.description, near_misses: b.near_misses, exemplars: b.exemplars, version: b.version ?? null, by: 'strategy-card' });
      if (r.activatable) {
        (deps.promote || (await repo()).promote)(d, r.id, r.version, { by: 'strategy-card', decision: { provisional: true, card_edit: true } });
        await (deps.startProbation || (async (...a) => (await import('../lib/repos/strategy-planner-repo.js')).startProbation(...a)))(d, r.id, r.version, { need: IMPROVE_CFG.planner.probation.runs, provisional: true });
        r.activated = true;
      }
      return r;
    } catch (err) { return reply.code(409).send({ error: err.message }); }
  });

  // Chad's go-live (11-09): a reviewed candidate goes active on probation at once, no judge, no spend; /anis/rollback restores the previous version
  fastify.post('/anis/activate', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.id || !Number.isInteger(Number(b.version))) return reply.code(400).send({ error: 'id and version are required' });
    try {
      const d = await db(), v = Number(b.version);
      (deps.promote || (await repo()).promote)(d, b.id, v, { by: 'ops-activate', decision: { provisional: true, reviewed: b.reason ?? 'activated by ops' } });
      await (deps.startProbation || (async (...a) => (await import('../lib/repos/strategy-planner-repo.js')).startProbation(...a)))(d, b.id, v, { need: IMPROVE_CFG.planner.probation.runs, provisional: true });
      return { id: b.id, version: v, activated: true };
    } catch (err) { return reply.code(409).send({ error: err.message }); }
  });

  fastify.post('/anis/rollback', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.id) return reply.code(400).send({ error: 'id is required' });
    try { return (await repo()).rollback(await db(), b.id, { by: 'ops' }); } catch (err) { return reply.code(409).send({ error: err.message }); }
  });

  fastify.post('/anis/retire', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.id || !Number.isInteger(Number(b.version)) || b.version === null || b.version === '') return reply.code(400).send({ error: 'id and version are required' });
    try { return (await repo()).withdraw(await db(), b.id, Number(b.version), { reason: b.reason ?? null, by: 'ops' }); } catch (err) { return reply.code(409).send({ error: err.message }); }
  });
}
