// grounding — the internal HTTP control plane for the entity-grounding pipeline. THIN wrappers over the shared
// executor (api/lib/pipeline/run-grounding.js via the complete-book CLI) + state (api/lib/pipeline/state.js) +
// the entity store: live status/queue reads, idempotent start/stop, reversible merge, entity backup. Operator,
// orchestrator, and UI drive grounding through this ONE surface instead of ad-hoc SSH/SQL.
// Mounted at /api/admin (requireInternal — X-Internal-Key === DEPLOY_SECRET or admin JWT). Writes route to the
// single writer (the API process sets SIFTER_WRITER_URL), so no direct-write contention.
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import * as state from '../lib/pipeline/state.js';
import * as queue from '../lib/pipeline/queue.js';
import { graphBandHolder } from '../lib/pipeline/lock.js';
import { spawnGrounding } from '../lib/pipeline/spawn.js';
import { makeStore } from '../lib/rag-adapter/store.js';
import { getIntegrationProgress } from '../lib/bio.js';
import { queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const parseRun = (rj) => { try { return rj ? JSON.parse(rj) : null; } catch { return null; } };
// Live only if the run heartbeated within 150s (executor refreshes every 30s). A crashed/killed book stops
// heartbeating → treated as not-running so /start can relaunch it instead of 409-ing on a stale marker.
const isLive = (run) => {
  if (!run || !run.stage || run.stage === 'done') return false;
  const ts = run.updatedAt ? Date.parse(run.updatedAt) : 0;
  return Date.now() - ts < 150000;
};

export default async function groundingRoutes(fastify) {
  const admin = { preHandler: requireInternal };

  // LIVE status — the full roadmap + the driver-reported active book (the same payload the UI reads).
  fastify.get('/grounding/status', admin, async () => getIntegrationProgress());

  // The enabled worklist in priority order: each doc's coarse stage status + live run.
  fastify.get('/grounding/books', admin, async () => {
    const rep = await state.statusReport();
    return { totals: rep.totals, books: rep.enabled.map(({ run_json, ...b }) => ({ ...b, run: parseRun(run_json) })) };
  });

  // One book's full pipeline row.
  fastify.get('/grounding/books/:docId', admin, async (req) => {
    const row = await state.getRow(Number(req.params.docId));
    if (!row) throw ApiError.notFound('doc not in pipeline');
    const { run_json, ...rest } = row;
    return { ...rest, run: parseRun(run_json) };
  });

  // START grounding a book — spawns the executor detached (replaces manual `ssh nohup`). Idempotent: 409 if live.
  // Supports FULL runs and RE-PROCESSING runs: `from=<stage>` resumes from a stage, `only=<stage>` runs one stage
  // (e.g. only=research to re-resolve just the uncertains) — both report live via run_json exactly like a full run.
  fastify.post('/grounding/start', admin, async (req) => {
    const { docId, from, only, to, readjudicate, cc } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    if (isLive(await state.getRun(Number(docId)))) throw ApiError.conflict(`doc ${docId} is already grounding`);
    const pid = spawnGrounding(docId, { from, only, to, readjudicate, cc });   // the ONE launcher (shared with the queue)
    return { started: true, docId: Number(docId), pid, from: from || null, only: only || null, cc: Number(cc) || 8 };
  });

  // ── QUEUE: the API owns the work ORDER and advances it ──────────────────────────────────────────────────────
  // Enqueue books and the supervisor starts each one as a slot frees — so processing continues without an operator
  // (or an agent loop) alive to launch the next book. `to` bounds a run (e.g. to:'research' keeps it out of the
  // shared-graph tail, letting it co-run with a full book).
  fastify.post('/grounding/queue', admin, async (req) => {
    const { docId, docIds, ...opts } = req.body || {};
    const ids = docIds || (docId ? [docId] : []);
    if (!ids.length) throw ApiError.badRequest('docId or docIds required');
    const rows = [];
    for (const id of ids) rows.push(await queue.enqueue({ docId: id, ...opts }));
    queue.tick().catch(() => {});                       // start immediately if a slot is free
    return { queued: rows.length, items: rows.map(({ opts_json, ...r }) => r) };
  });

  fastify.get('/grounding/queue', admin, async () => ({ items: await queue.list() }));

  fastify.delete('/grounding/queue/:id', admin, async (req) => {
    const row = await queue.cancel(req.params.id);
    if (!row) throw ApiError.notFound('queue item not found');
    return row;
  });

  // Force a supervisor pass (normally on a 20s timer) — useful right after enqueuing or stopping a run.
  fastify.post('/grounding/queue/tick', admin, async () => queue.tick());

  // ── MONITOR: everything an operator needs in ONE call ───────────────────────────────────────────────────────
  // live runs + the work order + spend per book + budget. Exists so babysitting is a single cheap poll instead of
  // a pile of ad-hoc SQL: the watcher reports, the API decides.
  fastify.get('/grounding/monitor', admin, async () => {
    const [runs, items, spend, bandHolder] = await Promise.all([
      state.activeRuns(),
      queue.list({ limit: 12 }),
      queryAll(`SELECT CAST(document_id AS INT) docId, provider, COUNT(*) calls,
                  ROUND(SUM(estimated_cost_usd), 4) usd
                FROM ai_usage WHERE caller='corpus-rag' AND document_id IS NOT NULL
                GROUP BY docId, provider ORDER BY usd DESC`),
      graphBandHolder().catch(() => null),
    ]);
    const byProvider = {};
    for (const s of spend) byProvider[s.provider] = Math.round(((byProvider[s.provider] || 0) + s.usd) * 100) / 100;
    return {
      live: runs.map((r) => ({ docId: r.doc_id, stage: r.stage, toStage: r.toStage ?? null, pid: r.pid,
        itemsDone: r.itemsDone, itemsTotal: r.itemsTotal, startedAt: r.startedAt, updatedAt: r.updatedAt })),
      queue: items.filter((i) => i.status === 'queued'),
      recent: items.filter((i) => i.status !== 'queued'),
      graphBandHolder: bandHolder,   // docId currently in the project→dedup mutex, or null
      spend: { byBook: spend, byProvider, total: Math.round(spend.reduce((a, b) => a + b.usd, 0) * 100) / 100 },
    };
  });

  // STOP a live run — signal the reported pid (best-effort) and clear the run marker so the UI goes idle.
  fastify.post('/grounding/stop', admin, async (req) => {
    const { docId } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const run = await state.getRun(Number(docId));
    if (!run?.pid) throw ApiError.notFound(`no live run for doc ${docId}`);
    let signalled = false;
    try { process.kill(run.pid, 'SIGTERM'); signalled = true; } catch { /* already gone */ }
    await state.setRun(Number(docId), null);
    logger.info({ docId: Number(docId), pid: run.pid, signalled }, 'grounding stopped via control API');
    return { stopped: true, docId: Number(docId), pid: run.pid, signalled };
  });

  // MERGE entities — reversible (repoints mentions+claims, records an append-only decision). Replaces raw SQL merges.
  fastify.post('/grounding/merge', admin, async (req) => {
    const { canonicalId, mergeIds, reason } = req.body || {};
    if (!canonicalId || !Array.isArray(mergeIds) || !mergeIds.length) throw ApiError.badRequest('canonicalId + non-empty mergeIds[] required');
    const ids = mergeIds.map(Number).filter((n) => n && n !== Number(canonicalId));
    if (!ids.length) throw ApiError.badRequest('no valid mergeIds (distinct from canonicalId)');
    const merged = await makeStore().applyMerge(Number(canonicalId), ids, reason || 'merge via control API');
    logger.info({ canonicalId: Number(canonicalId), mergeIds: ids, reason }, 'entities merged via control API');
    return { merged, canonicalId: Number(canonicalId), mergeIds: ids };
  });

  // BACKUP the small entity tables (gz) — the operator's manual dump, on demand.
  fastify.post('/grounding/backup', admin, async () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const out = `/tank/backups/entity/entity-tables-${stamp}.sql.gz`;
    const cmd = `sqlite3 ${process.cwd()}/data/sifter.db ".dump graph_entities entity_research entity_mentions_v2 entity_decisions entity_claims" | gzip > ${out}`;
    await new Promise((res, rej) => {
      const c = spawn('sh', ['-c', cmd], { stdio: 'ignore' });
      c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`backup exit ${code}`))));
      c.on('error', rej);
    });
    logger.info({ out }, 'entity tables backed up via control API');
    return { backedUp: true, path: out };
  });

  // The supervisor lives with the control plane: same process, same lifecycle. NEVER under test (it would spawn
  // real books against the real corpus); GROUNDING_SUPERVISOR=0 disables it in any environment.
  if (process.env.NODE_ENV !== 'test' && process.env.GROUNDING_SUPERVISOR !== '0') queue.startSupervisor();
}
