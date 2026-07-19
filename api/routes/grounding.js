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
import * as processor from '../lib/pipeline/plan.js';   // plan/override/general mode processor (chooses next work)
import * as digest from '../lib/pipeline/digest.js';    // hourly progress-digest email
import { graphBandHolder } from '../lib/pipeline/lock.js';
import { spawnGrounding } from '../lib/pipeline/spawn.js';
import { makeStore } from '../lib/rag-adapter/store.js';
import { getIntegrationProgress } from '../lib/bio.js';
import { query, queryOne, queryAll } from '../lib/db.js';
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

  // Reset the working queue: SIGTERM any running procs, drop all queued/running rows, clear stale run_json. In
  // plan/general mode the processor re-derives the next work from the plan on its next tick, so this is the
  // API-native way to recover a tangled queue — no direct DB access. Writes route through the single writer.
  fastify.post('/grounding/queue/reset', admin, async () => {
    const running = await queryAll(`SELECT pid FROM grounding_queue WHERE status='running' AND pid IS NOT NULL`);
    let killed = 0;
    for (const r of running) { try { process.kill(Number(r.pid), 'SIGTERM'); killed++; } catch { /* already gone */ } }
    const before = (await queryOne(`SELECT COUNT(*) n FROM grounding_queue WHERE status IN ('queued','running')`))?.n || 0;
    await query(`DELETE FROM grounding_queue WHERE status IN ('queued','running')`);
    await query(`UPDATE doc_pipeline SET run_json=NULL WHERE run_json IS NOT NULL`);
    return { cleared: before, killed };
  });

  // ── MONITOR: everything an operator needs in ONE call ───────────────────────────────────────────────────────
  // live runs + the work order + spend per book + budget. Exists so babysitting is a single cheap poll instead of
  // a pile of ad-hoc SQL: the watcher reports, the API decides.
  fastify.get('/grounding/monitor', admin, async () => {
    const [runs, items, spend, bandHolder, budget] = await Promise.all([
      state.activeRuns(),
      queue.list({ limit: 12 }),
      queryAll(`SELECT CAST(document_id AS INT) docId, provider, COUNT(*) calls,
                  ROUND(SUM(estimated_cost_usd), 4) usd
                FROM ai_usage WHERE caller='corpus-rag' AND document_id IS NOT NULL
                GROUP BY docId, provider ORDER BY usd DESC`),
      graphBandHolder().catch(() => null),
      queue.budgetStatus().catch(() => []),
    ]);
    const byProvider = {};
    for (const s of spend) byProvider[s.provider] = Math.round(((byProvider[s.provider] || 0) + s.usd) * 100) / 100;
    const queued = items.filter((i) => i.status === 'queued');
    // A single health verdict the cloud health-check reads to decide whether to ping the user AT ALL.
    const overBudget = budget.filter((b) => b.over).map((b) => b.provider);
    const warnBudget = budget.filter((b) => b.warn && !b.over).map((b) => b.provider);
    const peakBlocked = budget.filter((b) => b.peakBlocked);
    const offPeakResumesAt = peakBlocked.length
      ? Math.min(...peakBlocked.map((b) => b.offPeakResumesAt).filter((t) => t)) : null;
    const health = {
      ok: overBudget.length === 0,
      overBudget,                                   // providers at ceiling → new books of theirs are paused
      warnBudget,                                   // providers ≥ warn_frac → heads-up
      queuedBlocked: overBudget.length > 0 && queued.length > 0,  // work waiting behind a budget wall
      // DELIBERATE off-peak hold: work IS queued but held for cheap hours → the UI shows "waiting for off-hour
      // rates · [countdown]" (offPeakResumesAt) so a paused-for-savings pipeline never reads as stuck.
      peakWaiting: peakBlocked.length > 0 && queued.length > 0,
      offPeakResumesAt,
      liveCount: runs.length,
    };
    return {
      live: runs.map((r) => ({ docId: r.doc_id, stage: r.stage, toStage: r.toStage ?? null, pid: r.pid,
        itemsDone: r.itemsDone, itemsTotal: r.itemsTotal, startedAt: r.startedAt, updatedAt: r.updatedAt })),
      queue: queued,
      recent: items.filter((i) => i.status !== 'queued'),
      graphBandHolder: bandHolder,   // docId currently in the project→dedup mutex, or null
      spend: { byBook: spend, byProvider, total: Math.round(spend.reduce((a, b) => a + b.usd, 0) * 100) / 100 },
      budget,                        // [{provider, spent, ceiling, frac, over, warn}] — the server-side spend gate
      health,
    };
  });

  // SET/UPDATE a provider budget ceiling — the server-side spend backstop for unattended runs. Baseline is captured
  // automatically as the current spend for that provider, so `ceiling_usd` is the INCREMENTAL allowance from now.
  fastify.post('/grounding/budget', admin, async (req) => {
    const { provider, ceilingUsd, warnFrac, offpeakOnly, peakWindows } = req.body || {};
    if (!provider || !(Number(ceilingUsd) > 0)) throw ApiError.badRequest('provider + positive ceilingUsd required');
    const pw = Array.isArray(peakWindows) ? JSON.stringify(peakWindows) : null;   // NULL → server DEFAULT_PEAK_WINDOWS
    const base = await queryOne(`SELECT COALESCE(SUM(estimated_cost_usd),0) s FROM ai_usage WHERE provider=? AND caller='corpus-rag'`, [provider]);
    await query(`INSERT INTO grounding_budget (provider, ceiling_usd, baseline_usd, warn_frac, offpeak_only, peak_windows, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, unixepoch())
                 ON CONFLICT(provider) DO UPDATE SET ceiling_usd=excluded.ceiling_usd, baseline_usd=excluded.baseline_usd,
                   warn_frac=excluded.warn_frac, offpeak_only=excluded.offpeak_only, peak_windows=excluded.peak_windows, updated_at=unixepoch()`,
      [provider, Number(ceilingUsd), base?.s || 0, Number(warnFrac) > 0 ? Number(warnFrac) : 0.8, offpeakOnly ? 1 : 0, pw]);
    logger.info({ provider, ceilingUsd, baseline: base?.s || 0, offpeakOnly: !!offpeakOnly }, 'grounding budget set');
    return { provider, ceilingUsd: Number(ceilingUsd), baselineUsd: base?.s || 0, offpeakOnly: !!offpeakOnly, budget: await queue.budgetStatus() };
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

  // Processor MODE: plan (follow the history plan) | override (agents hand-enroll) | general (whole library).
  // GET returns the current mode; POST switches it at runtime (in-memory → a restart reverts to the safe default).
  // Hourly progress digest: emails what finished in (since, now]. Driven by a cron that tracks the window in a
  // state file (robust across restarts). `preview=1` renders without sending. `now` (upper bound) is returned so
  // the cron persists it as the next window's `since` → contiguous, no gaps or overlaps.
  fastify.post('/grounding/digest', admin, async (req) => {
    const b = req.body || {};
    const now = (await queryOne('SELECT unixepoch() n'))?.n ?? Math.floor(Date.now() / 1000);
    const since = Number(b.since) || (now - 3600);
    if (b.preview) { const d = await digest.buildDigest(since); return { since, now, count: d.books.length, processing: d.processing.length, html: digest.renderDigestHtml(d) }; }
    const r = await digest.sendDigest(since, { force: !!(b.test || b.force) });   // test/force → always send (verify email)
    return { since, now, ...r };
  });

  // Trigger a plan-follower pass now (normally on a ~3-min timer) — repopulates the queue with the next books in
  // plan order (incl. the pilgrim/period primary-source groups). Useful right after a queue reset.
  fastify.post('/grounding/plan/tick', admin, async (req) => {
    const lookahead = Number((req.body || {}).lookahead) || Number(process.env.GROUNDING_LOOKAHEAD || 8);
    return processor.followPlanTick({ lookahead });
  });

  fastify.get('/grounding/mode', admin, async () => ({ mode: processor.getMode(), modes: ['plan', 'override', 'general'] }));
  fastify.post('/grounding/mode', admin, async (req) => {
    const m = (req.body || {}).mode;
    if (!m) throw ApiError.badRequest('mode required (plan|override|general)');
    try { return { mode: processor.setMode(m) }; } catch (e) { throw ApiError.badRequest(e.message); }
  });

  // The supervisor + processor live with the control plane: same process, same lifecycle. NEVER under test (they
  // would spawn real books against the real corpus); GROUNDING_SUPERVISOR=0 disables them in any environment.
  if (process.env.NODE_ENV !== 'test' && process.env.GROUNDING_SUPERVISOR !== '0') {
    queue.startSupervisor();     // runs the queue serially
    processor.startProcessor();  // chooses the next work per the active mode (plan by default)
  }
}
