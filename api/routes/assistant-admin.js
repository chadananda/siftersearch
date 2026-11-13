// Admin: GET /api/admin/anis/overview?days=30 — the Anís hub's data (activity, costs, assessment, System-1) in one call.
// Threads + turns carry their traced searches (search_trace); /anis/turns/:id/{trace,replay} — search introspection (11-04).
// Auth: requireInternal = admin JWT or X-Internal-Key, so ops tooling can read a thread when an answer goes wrong.
// Each section fails on its own (a missing store shows as unavailable, never breaks the page).
import { requireInternal } from '../lib/auth.js';
import { listResearchSets } from '../lib/repos/research-sets-repo.js';
import { getAnisOverview } from '../lib/assistant/admin-overview.js';
import { threadsOverview, threadDetail, strategyGaps, turnTrace, parseTurnId } from '../lib/assistant/admin-threads.js';
import { tracesForThread, tracesForTurn, childTraces, docTitles } from '../lib/repos/search-trace-repo.js';
import { auditsSince } from '../lib/repos/audit-store-repo.js';
import { listAnisThreads, anisThread, anisThreadMessages } from '../lib/repos/anis-threads-repo.js';
import { forensicsSince, listImprovements, getImprovement, recordBehaviorRuns, BEHAVIOR_STATES, setImprovementStatus, improveStats, improveReportData, improveDigestData, improveOverviewData, behaviorRunStates, IMPROVEMENT_STATUSES } from '../lib/repos/improve-repo.js';
import { theoriesDb, listTheories, theoryCounts } from '../lib/repos/jev-theories-repo.js';
import { improveOverview } from '../lib/audit/improve-overview.js';
import { candidatesDb, overviewReads } from '../lib/repos/strategy-candidates-repo.js';
import { readServices } from '../lib/service-heartbeat.js';
import { forensicsReport, rankImprovements, improveReport, improveDigest, scenariosOf } from '../lib/audit/improve.js';
import { TARGETS } from '../lib/audit/improve-targets.js';
import { capStatus, isSpendCap } from '../lib/spend-caps.js';

// since: an ISO time, or a relative '24h' / '7d' / '90m' → ISO; null when absent; throws 400 when unreadable.
export function parseSince(v, now = Date.now()) {
  if (v == null || v === '') return null;
  const rel = String(v).match(/^(\d+)\s*(m|h|d)$/i);
  const ms = rel ? now - Number(rel[1]) * { m: 60e3, h: 3600e3, d: 86400e3 }[rel[2].toLowerCase()] : Date.parse(v);
  if (!Number.isFinite(ms)) throw Object.assign(new Error('since must be an ISO time or 24h/7d/90m'), { statusCode: 400 });
  return new Date(ms).toISOString();
}
const TARGET_FILTERS = ['code', 'data', ...TARGETS];

export default async function anisAdminRoutes(fastify) {
  fastify.get('/anis/overview', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => getAnisOverview(request.query.days || 30));   // off the event loop, cached (admin-overview.js)

  // Threads (Chad 10-12): every Anís conversation with each reply's audit — filter=strategy shows where a better search
  // strategy was warranted.
  fastify.get('/anis/threads', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
      filter: { type: 'string', enum: ['all', 'strategy', 'problems', 'pending'], default: 'all' } } } },
  }, async (request) => threadsOverview({ listThreads: listAnisThreads }, { days: request.query.days || 30, filter: request.query.filter || 'all' }));

  // per round: searches[] (tool, query, filters, ms, top 10 hits), writer_passages[] (with standing), cited[] (Chad 11-04)
  fastify.get('/anis/threads/:id', { preHandler: requireInternal }, async (request, reply) => {
    const t = await threadDetail({ thread: anisThread, messages: anisThreadMessages, traces: tracesForThread, titles: docTitles }, request.params.id);
    return t || reply.code(404).send({ error: 'no such thread' });
  });

  // ONE turn ("<thread>:<round>"): every search it made (top 20 each), the writer's passages, what the reply cites
  fastify.get('/anis/turns/:id/trace', { preHandler: requireInternal }, async (request, reply) => {
    const t = await turnTrace({ thread: anisThread, messages: anisThreadMessages, traces: tracesForTurn, titles: docTitles }, request.params.id);
    if (t?.missing) return reply.code(404).send({ error: t.error, rounds: t.rounds });
    return t || reply.code(404).send({ error: 'no such turn (expected <thread>:<round>)' });
  });

  // Re-run every engine search the turn made on today's code: old vs new ranked lists. No planner, no LLM, no reply, no trace.
  fastify.post('/anis/turns/:id/replay', { preHandler: requireInternal }, async (request, reply) => {
    if (!parseTurnId(request.params.id)) return reply.code(400).send({ error: 'expected <thread>:<round>' });
    const rows = await tracesForTurn(request.params.id);
    if (!rows.length) return reply.code(404).send({ error: 'no traced searches for this turn' });
    const { replayTurn } = await import('../lib/search/trace-replay.js');
    return { turn: request.params.id, ...(await replayTurn(rows, { children: childTraces, titles: docTitles })) };
  });

  // The audits as a ranked work queue (Chad 10-12: audit-identified strategy extensions are the highest priority).
  fastify.get('/anis/strategy-gaps', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => ({ days: request.query.days || 30, ...strategyGaps(auditsSince(request.query.days || 30)) }));
  // Improvement cycle (Chad 11-04; api/workers/improve-worker.js): forensic stage × class queue for replies and searches, with
  // the Opus judge's tally — and the deduped improvement suggestions, ranked evidence × severity, with a status to set.
  fastify.get('/anis/forensics', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
      stage: { type: 'string' }, examples: { type: 'integer', minimum: 0, maximum: 10, default: 3 } } } },
  }, async (request) => {
    const days = request.query.days || 7;
    const all = forensicsSince(2 * days);
    const cut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    return { days, stage: request.query.stage || null, stats_24h: improveStats(1),
      ...forensicsReport(all.filter((r) => r.asked_at >= cut), all.filter((r) => r.asked_at < cut), { stage: request.query.stage || null, examples: request.query.examples ?? 3 }) };
  });

  // The live improvement report (Chad 11-04, /admin/anis-improve): pipeline + spend tiles, audits (weak verdicts) → conclusions
  // (deep analyses) → solutions (ranked, with their evidence audits). Spend today = the ai_usage rollup the cap itself reads.
  fastify.get('/anis/improve-report', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
      stage: { type: 'string', maxLength: 40 }, status: { type: 'string', enum: IMPROVEMENT_STATUSES }, kind: { type: 'string', enum: ['reply', 'search'] },
      target: { type: 'string', enum: TARGET_FILTERS }, since: { type: 'string', maxLength: 40 },
      limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 } } } },
  }, async (request) => {
    const q = request.query, days = q.days || 7;
    const filters = { stage: q.stage || null, status: q.status || null, kind: q.kind || null, target: q.target || null, since: parseSince(q.since) };
    const cap = (await capStatus().catch(() => [])).find((g) => g.group === 'improve') || null;
    return improveReport(improveReportData({ days, ...filters, limit: q.limit || 50 }), { days, cap, filters });
  });

  // The daily digest for Claude Code (Chad 11-04: "easy API access to assessment summaries and code improvement suggestions
  // ... Claude Code should check these daily"): assessment since `since` (default 24h), new/grown CODE recommendations,
  // DATA changes proposed/applied. `node scripts/ops/ops.mjs anis-improve-digest --since 24h` prints it as text.
  fastify.get('/anis/improve-digest', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { since: { type: 'string', maxLength: 40 } } } },
  }, async (request) => {
    const since = parseSince(request.query.since || '24h');
    const cap = (await capStatus().catch(() => [])).find((g) => g.group === 'improve') || null;
    // Jev misses (jev-tuning/miss-fix.js): this period's miss rate vs the one before, fixes tried/promoted; a store without the table reads as none
    const jevMisses = await (async () => { try { const [{ missDigest }, { candidatesDb }, { countCalls }] = await Promise.all([import('../lib/jev-tuning/miss-fix.js'),
      import('../lib/repos/strategy-candidates-repo.js'), import('../lib/repos/jev-calls-repo.js')]); return missDigest(candidatesDb(), { since, countCalls }); } catch { return null; } })();
    // candidates kept out for confusing Jev (real-call breaks, confidence drops, guard steals, setting-of)
    const confusion = await (async () => { try { const { candidatesDb, confusionDigest } = await import('../lib/repos/strategy-candidates-repo.js');
      return confusionDigest(candidatesDb(), { since: new Date(Date.parse(since)).toISOString().slice(0, 19).replace('T', ' ') }); } catch { return null; } })();
    // TOOLS loop (planner): wished-for elements across planned trees, as Gherkin code recommendations; probations; planner defects (a second plan for one type)
    const tools = await (async () => { try { const [{ candidatesDb }, P, R] = await Promise.all([import('../lib/repos/strategy-candidates-repo.js'), import('../lib/assistant/strategy-planner.js'), import('../lib/repos/strategy-planner-repo.js')]);
      const db = candidatesDb(), wishlist = P.toolWishlist(db); const t = { wishlist, gherkin: P.wishlistGherkin(wishlist), repeat_plans: R.repeatPlans(db), probations: R.listProbations(db, { phase: 'probation' }), catalog: P.checkCatalog(db) }; return t.wishlist.length || t.repeat_plans.length || t.probations.length || t.catalog.queued.length ? t : null; } catch { return null; } })();
    return improveDigest(improveDigestData({ since }), { since, cap, jevMisses, confusion, tools });
  });

  // The progress page (Chad 11-04, AnisImprove.svelte): headline (7-day score/weak rate, 30 days, a deterministic status sentence),
  // the loop's flow, what changed (strategy promotions + code behaviours Claude Code finished), what is under test, what waits
  // for Claude Code, improve spend. Repos read; improve-overview.js shapes. No question text. Each read degrades to empty alone.
  fastify.get('/anis/improve-overview', { preHandler: requireInternal }, async (request) => {
    const now = Date.now();
    const since7 = new Date(now - 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    let strat = { promotions: [], candidates: [], gaps: { open: 0, designed: 0 } };
    try { strat = overviewReads(candidatesDb(), { since: since7 }); } catch (err) { request.log?.warn?.({ err }, 'improve-overview: strategy store unreadable'); }
    const caps = await capStatus().catch(() => []);
    const cap = caps.find((g) => g.group === 'improve') || null, anisCap = caps.find((g) => g.group === 'anis') || null;
    let heartbeat = null;
    try { heartbeat = (await readServices()).find((s) => s.name === 'siftersearch-improve') || null; } catch { /* no heartbeat store: unknown */ }
    // the decision-theory loop (jev_theories, strategies.db), the behaviour runs, the cost ladder, the anis spend for $/turn
    let theories = [], decisions = null, runs = new Map(), ladder = [];
    try { const tdb = theoriesDb(); theories = listTheories(tdb, { since: new Date(now - 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ') });
      decisions = theoryCounts(tdb, { since: since7 }); } catch (err) { request.log?.warn?.({ err }, 'improve-overview: theory store unreadable'); }
    try { runs = behaviorRunStates(); } catch { /* no behaviour runs yet */ }
    try { ladder = (await import('../lib/assistant/activities/catalog.js')).activityCatalog(); } catch (err) { request.log?.warn?.({ err }, 'improve-overview: activity catalog'); }
    return improveOverview({ data: improveOverviewData({ now }), ...strat, cap, heartbeat, theories, decisions, runs, ladder, anisCap, now });
  });

  // The research cache (research-cache.js): newest sets, for curation and to see capture working.
  fastify.get('/anis/research-sets', { preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 } } } },
  }, async (request) => ({ sets: await listResearchSets({ limit: request.query.limit || 50, status: request.query.status || null }) }));

  // The question log (question-log-repo.js): most-asked questions and the sites asking, by window. `ops.mjs anis-questions`.
  fastify.get('/anis/question-log/top', { preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { since: { type: 'string' }, site: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 } } } },
  }, async (request) => {
    const { topQuestions, topSites } = await import('../lib/repos/question-log-repo.js');
    const { since = '7d', site = null, limit = 50 } = request.query;
    return { since, site, questions: await topQuestions({ since, site, limit }), sites: await topSites({ since, limit: 20 }) };
  });

  fastify.get('/anis/improvements', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { status: { type: 'string', enum: IMPROVEMENT_STATUSES }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } } } },
  }, async (request) => ({ improvements: rankImprovements(listImprovements({ status: request.query.status || null, limit: request.query.limit || 100 })) }));

  // One improvement with its acceptance scenarios (`ops.mjs anis-improve-scenarios <id> --write` → tests/behavior/proposed/<id>.json).
  fastify.get('/anis/improvements/:id', { preHandler: requireInternal }, async (request, reply) => {
    const r = getImprovement(request.params.id);
    return r ? { improvement: { ...r, scenarios: scenariosOf(r) } } : reply.code(404).send({ error: 'no such improvement' });
  });

  // Behaviour scenarios (tests/behavior/run.mjs): the judge checks of one reply (Opus, billed improve-behavior-judge) and the run
  // states the progress page shows on waiting cards. Internal key; the runner never touches a DB.
  fastify.post('/anis/behavior/judge', {
    preHandler: requireInternal,
    schema: { body: { type: 'object', required: ['reply', 'expects'], properties: { question: { type: 'string', maxLength: 4000 }, reply: { type: 'string', maxLength: 60000 },
      cited: { type: 'array', maxItems: 30 }, expects: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 400 } } } } },
  }, async (request, reply) => {
    const { judgeBehavior } = await import('../lib/audit/behavior-judge.js');
    try { return await judgeBehavior(request.body); } catch (err) {
      if (isSpendCap(err)) return reply.code(429).send({ error: err.message, retry_after_ms: err.retryAfterMs ?? null });
      throw err;
    }
  });
  fastify.post('/anis/behavior/runs', {
    preHandler: requireInternal,
    schema: { body: { type: 'object', required: ['runs'], properties: { runs: { type: 'array', maxItems: 500, items: { type: 'object', required: ['scenario', 'state'],
      properties: { scenario: { type: 'string', maxLength: 200 }, proposal: { type: ['integer', 'null'] }, state: { type: 'string', enum: BEHAVIOR_STATES },
        checks: { type: 'array' }, commit: { type: ['string', 'null'], maxLength: 64 } } } } } } },
  }, async (request) => ({ recorded: recordBehaviorRuns(request.body.runs) }));

  fastify.post('/anis/improvements/:id/status', {
    preHandler: requireInternal,
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: IMPROVEMENT_STATUSES }, note: { type: 'string', maxLength: 2000 },
      by: { type: 'string', maxLength: 80 } } } },
  }, async (request, reply) => {
    // No human gate (11-04 v2): only Claude Code and the system set a status, with the internal key; the page never calls this.
    const u = request.user || {};
    if (!u.internal) return reply.code(403).send({ error: 'improvement status is set by Claude Code or the system (internal key)' });
    const by = request.body.by ? `internal:${request.body.by}` : 'internal-key';
    const changed = setImprovementStatus(request.params.id, request.body.status, request.body.note ?? null, undefined, by);
    return changed ? { ok: true, id: Number(request.params.id), status: request.body.status } : reply.code(404).send({ error: 'no such improvement' });
  });
}
