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
import { spawn } from 'node:child_process';   // used by /grounding/backup (was missing → endpoint threw ReferenceError)
import { spawnGrounding } from '../lib/pipeline/spawn.js';
import { makeStore } from '../lib/rag-adapter/store.js';
import { repairMergeTombstones, mergeTombstoneDivergence, naturalKeyCollisions, breakMergeCycles } from '../lib/entity-merge-repair.js';
import { getIntegrationProgress, gradedPlanDocIds } from '../lib/bio.js';
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

  // VERIFIER (2026-08-06): prove reachedBoundBulk() ≡ per-doc reachedBound() over the graded plan docs, so the
  // roadmap's bulk done-check (the migration-97 perf fix) can't silently diverge from the pipeline's own test.
  // Read-only; expect mismatchCount:0. Kept as a cheap regression probe.
  fastify.get('/grounding/verify-done-bulk', admin, async () => {
    const ids = gradedPlanDocIds();
    const bulk = await queue.reachedBoundBulk(ids, {});
    const single = new Set();
    for (const id of ids) { if (await queue.reachedBound(id, {})) single.add(Number(id)); }
    const mismatches = ids.filter((id) => bulk.has(Number(id)) !== single.has(Number(id)));
    return { total: ids.length, bulkDone: bulk.size, singleDone: single.size, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 50) };
  });

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
    const { docId, from, only, to, readjudicate, rehype, cc } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    if (isLive(await state.getRun(Number(docId)))) throw ApiError.conflict(`doc ${docId} is already grounding`);
    const pid = spawnGrounding(docId, { from, only, to, readjudicate, rehype, cc });   // the ONE launcher (shared with the queue)
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

  /**
   * POST /concepts/run — run the CONCEPTUAL track on one document.
   *
   * The conceptual track has been code-complete since 08-19 and had never run on a single document, because
   * the only way to invoke it was scripts/rag.mjs on the box — and control belongs on the internal API, not
   * SSH. GROUNDING_STAGES has no concept stage either, so the person pipeline could never reach it.
   *
   * ORDER IS LOAD-BEARING (conceptual-track §3, §7): the lexicon must accumulate from the higher texts BEFORE
   * lower texts bind their symbols to it, and HyPE reads the disambiguation context, so a concept-carrying
   * note has to exist before questions are generated. Hence the default order below, and hence `stages` is
   * validated against it rather than accepted as free text.
   *
   * SPENDS. Every stage makes model calls; dryRun runs the read side and writes nothing.
   */
  fastify.post('/concepts/run', admin, async (req) => {
    const ORDER = ['disambiguate', 'extract', 'lexicon', 'reconcile', 'promote'];
    const { docId, stages, dryRun = false, ...opts } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const want = stages?.length ? stages : ORDER;
    const unknown = want.filter((s) => !ORDER.includes(s));
    if (unknown.length) throw ApiError.badRequest(`unknown concept stage(s): ${unknown.join(', ')} — known: ${ORDER.join(', ')}`);
    // Run in canonical order regardless of the order asked for: a caller who lists extract before
    // disambiguate is asking for concepts off an un-disambiguated text, which the design forbids outright.
    const ordered = ORDER.filter((s) => want.includes(s));
    const { rag } = await import('../lib/rag-adapter/index.js');
    const out = { docId, dryRun, ran: [], stats: {} };
    for (const stage of ordered) {
      const fn = stage === 'lexicon' ? rag.concepts.lexicon.seed : rag.concepts[stage];
      if (typeof fn !== 'function') { out.stats[stage] = { error: 'stage not available in this build' }; break; }
      try {
        out.stats[stage] = await fn.call(rag.concepts, docId, { ...opts, dryRun });
        out.ran.push(stage);
      } catch (err) {
        // Stop at the first failure: a later stage consuming a half-built lexicon produces confidently wrong
        // bindings, which is worse than no bindings.
        out.stats[stage] = { error: err.message };
        out.stoppedAt = stage;
        break;
      }
    }
    // Index what was just extracted. Without this the concepts exist only as rows: searchable claims hanging
    // off paragraphs, but not concepts a reader can query in their own right across traditions (§6). Indexing
    // as part of the run means "extracted" and "findable" cannot drift apart — the failure mode that left
    // `context` written-but-unindexed for a month.
    if (!dryRun && out.ran.length) {
      try {
        const { syncConcepts } = await import('../lib/search/concepts.js');
        const { syncLexicon } = await import('../lib/search/concepts.js');
        out.indexed = { entities: await syncConcepts(), lexicon: await syncLexicon() };
      } catch (err) {
        out.indexed = { error: err.message };   // reported, never silent — the run still succeeded
      }
    }
    return out;
  });

  /**
   * POST /concepts/start — launch a DETACHED concept run and return immediately.
   *
   * /concepts/run executes in-request, which only works for bounded runs: the disambiguate stage is
   * sequential, so a whole book exceeds the edge timeout. This is the path for a real book, and it mirrors
   * how grounding has always been launched (detached CLI + per-doc log), so an operator-launched run and an
   * API-launched one are the same thing.
   */
  fastify.post('/concepts/start', admin, async (req) => {
    const { docId, only, from, limit, dry = false } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const { spawnConcepts } = await import('../lib/pipeline/spawn.js');
    const pid = spawnConcepts(Number(docId), { only, from, limit, dry });
    return { started: true, docId: Number(docId), pid, log: `logs/concepts-${docId}.log`, dry };
  });

  /**
   * GET /concepts/status — what the conceptual track has actually produced.
   *
   * Without this a concept run is invisible: extract writes concept_claims, lexicon writes concept_lexicon,
   * and only later stages create concept_entities — so /concepts/sync reporting 0 entities says nothing about
   * whether extraction worked. Counting each table separately is the difference between "it ran" and "it
   * produced something", which is the distinction this pipeline keeps losing.
   */
  fastify.get('/concepts/status', admin, async (req) => {
    const docId = req.query?.docId ? Number(req.query.docId) : null;
    const scope = docId ? ' WHERE doc_id = ?' : '';
    const args = docId ? [docId] : [];
    const one = async (sql, a = args) => (await queryOne(sql, a, 'diag:concepts-status'))?.n ?? 0;
    const [claims, proofOk, lexicon, entities, decisions, links] = await Promise.all([
      one(`SELECT COUNT(*) n FROM concept_claims${scope}`),
      one(`SELECT COUNT(*) n FROM concept_claims${scope ? scope + ' AND' : ' WHERE'} proof_ok = 1`),
      docId ? one(`SELECT COUNT(*) n FROM concept_lexicon WHERE proof_doc_id = ?`) : one(`SELECT COUNT(*) n FROM concept_lexicon`, []),
      one(`SELECT COUNT(*) n FROM concept_entities`, []),
      one(`SELECT COUNT(*) n FROM concept_decisions`, []),
      one(`SELECT COUNT(*) n FROM concept_links`, []),
    ]);
    const byDoc = docId ? null : await queryAll(
      `SELECT doc_id, COUNT(*) n FROM concept_claims GROUP BY doc_id ORDER BY n DESC LIMIT 20`, [], 'diag:concepts-bydoc');
    // A SAMPLE, not just counts. 740 lexicon entries tells you the stage ran; reading five of them tells you
    // whether it produced authoritative interpretations or restatements — which is the actual question.
    const sample = await queryAll(
      `SELECT symbol, interpretation, authority, authority_tier, layer, proof_verbatim
         FROM concept_lexicon${docId ? ' WHERE proof_doc_id = ?' : ''}
        ORDER BY (authority_tier IS NULL), authority_tier, id DESC LIMIT 8`, args, 'diag:concepts-sample');
    // WHEN, not just how many. I asserted the track "had never run" on the strength of entities=0 — the wrong
    // table — and then found 2,086 claims on two books I never launched. A count without a timestamp cannot
    // tell tonight's work from someone else's, so the ages ship with the counts (2026-08-20).
    const ages = await queryOne(
      `SELECT MIN(created_at) first_at, MAX(created_at) last_at FROM concept_lexicon${docId ? ' WHERE proof_doc_id = ?' : ''}`,
      args, 'diag:concepts-ages');
    return { docId, claims, claims_proof_ok: proofOk, lexicon_entries: lexicon, entities, decisions, links,
      first_at: ages?.first_at ?? null, last_at: ages?.last_at ?? null, byDoc, sample };
  });

  /** POST /concepts/sync — reindex concept entities without re-extracting. Full refresh; cheap, no model calls. */
  // GET /concepts/lexicon?symbol=…&limit= — every recorded interpretation of one symbol.
  // Feeds tests/quality/score-concepts.mjs, which measures TWO things the lexicon conflates: whether we
  // captured all the senses a symbol genuinely carries (recall), and whether what we stored are distinct
  // senses or restatements of one (distinctness). Without symbol-level read-out neither is measurable.
  fastify.get('/concepts/lexicon', admin, async (req) => {
    const symbol = String(req.query?.symbol || '').trim();
    const limit = Math.min(500, Number(req.query?.limit) || 200);
    if (!symbol) {
      // No symbol → the polysemy overview: which symbols carry the most recorded interpretations.
      const rows = await queryAll(
        `SELECT symbol, COUNT(*) entries, COUNT(DISTINCT interpretation) distinctText
           FROM concept_lexicon GROUP BY symbol HAVING entries > 1
          ORDER BY entries DESC LIMIT ?`, [limit]);
      return { overview: true, symbols: rows };
    }
    const entries = await queryAll(
      `SELECT id, symbol, interpretation, authority, authority_tier, layer, proof_doc_id, proof_verbatim
         FROM concept_lexicon WHERE symbol = ? ORDER BY authority_tier IS NULL, authority_tier, id LIMIT ?`,
      [symbol, limit]);
    return { symbol, count: entries.length, entries };
  });

  fastify.post('/concepts/sync', admin, async () => {
    // BOTH kinds. Entities have no writer yet (nothing in the codebase INSERTs concept_entities), so syncing
    // only those would keep reporting 0 while 1,651 real cited interpretations sat unindexed.
    const { syncConcepts, syncLexicon } = await import('../lib/search/concepts.js');
    const [entities, lexicon] = await Promise.all([syncConcepts(), syncLexicon()]);
    return { entities, lexicon };
  });

  fastify.get('/grounding/queue', admin, async () => ({ items: await queue.list() }));

  fastify.delete('/grounding/queue/:id', admin, async (req) => {
    const row = await queue.cancel(req.params.id);
    if (!row) throw ApiError.notFound('queue item not found');
    return row;
  });

  // Release books the storm-guard parked. The guard quarantines a doc after repeated identical failures so a
  // broken book cannot burn tokens forever; once the underlying bug is FIXED, the parked set has to be released
  // or the fix reaches nothing. Needing an ssh + raw-SQL session to do that is a missing endpoint, so: this is
  // it. `reason` defaults to the storm signature; the follower re-enqueues on its next tick (no restart).
  // Deliberately NOT automatic — releasing means real model spend on those books, which is an operator's call.
  fastify.post('/grounding/queue/unquarantine', admin, async (req) => {
    const reason = req.body?.reason || 'did not reach verify';
    const note = req.body?.note || `quarantine cleared ${new Date().toISOString().slice(0, 10)}`;
    const like = `%${reason}%`;
    const affected = await queryAll(
      `SELECT id, doc_id FROM grounding_queue
        WHERE status='failed' AND (COALESCE(error,'') LIKE ? OR COALESCE(note,'') LIKE ?)`, [like, like]);
    if (!affected.length) return { released: 0, docs: [] };
    // query() routes writes through the single writer, same as /queue/reset above.
    await query(
      `UPDATE grounding_queue SET error = ?,
         note = CASE WHEN COALESCE(note,'') LIKE ? THEN NULL ELSE note END
        WHERE status='failed' AND (COALESCE(error,'') LIKE ? OR COALESCE(note,'') LIKE ?)`,
      [note, like, like, like]);
    const docs = [...new Set(affected.map((r) => r.doc_id))];
    return { released: affected.length, docs };
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
    // baseline_at is what makes the spend check BOUNDED: every later read sums only rows after this moment
    // instead of rescanning all billing history (migration 110). Captured from the DB clock, not the app's,
    // so it is comparable to ai_usage.timestamp even if the two ever disagree.
    await query(`INSERT INTO grounding_budget (provider, ceiling_usd, baseline_usd, warn_frac, offpeak_only, peak_windows, updated_at, baseline_at)
                 VALUES (?, ?, ?, ?, ?, ?, unixepoch(), datetime('now'))
                 ON CONFLICT(provider) DO UPDATE SET ceiling_usd=excluded.ceiling_usd, baseline_usd=excluded.baseline_usd,
                   warn_frac=excluded.warn_frac, offpeak_only=excluded.offpeak_only, peak_windows=excluded.peak_windows,
                   updated_at=unixepoch(), baseline_at=datetime('now')`,
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

  // GET /grounding/exhaustion — is there any plan work the follower could actually START?
  // The roadmap grades a book "not done" from claim coverage; the follower separately decides whether it can
  // ground it at all. When every remaining book is a husk (zero prose), language-parked, or quarantined, the
  // queue drains to empty and STAYS empty — indistinguishable, to a queue-depth alarm, from a wedged pipeline.
  // system-checks reads this so `Grounding progress` can say "plan exhausted" instead of crying CRITICAL forever.
  fastify.get('/grounding/exhaustion', admin, async () => processor.planExhaustion());

  // ── Merge-tombstone integrity (2026-08-24). applyMerge used to mark merged duplicates by appending
  //    ' ⟨merged→N⟩' to canonical_name — a form no API reader checked — so 6,668 hollow entities were served
  //    as live people. The writer is fixed; these repair the rows it already wrote.
  //
  // GET  /entities/merge-divergence   — the DETECTOR. servedButMerged must be 0.
  // POST /entities/repair-merge-tombstones {dryRun=true, chunkSize=200}
  //      Rewrites each marked row to `last_assessed_version='merged-into-<finalSurvivor>'` (chain-resolved)
  //      and restores canonical_name. Idempotent; dry-run by default; unresolvable rows are reported, never guessed.
  fastify.get('/entities/merge-divergence', admin, async () => mergeTombstoneDivergence());
  fastify.get('/entities/key-collisions', admin, async () => naturalKeyCollisions());
  // Rows merged into EACH OTHER (A→B, B→A) — no chain terminates, so the main repair skips them.
  // Survivor is chosen by evidence (claims+mentions), ties by lowest id; the rest tombstone to it.
  fastify.post('/entities/break-merge-cycles', admin, async (request) =>
    breakMergeCycles({ dryRun: (request.body || {}).dryRun !== false }));
  fastify.post('/entities/repair-merge-tombstones', admin, async (request) => {
    const b = request.body || {};
    return repairMergeTombstones({ dryRun: b.dryRun !== false, chunkSize: Math.min(500, +b.chunkSize || 200) });
  });
  fastify.post('/grounding/mode', admin, async (req) => {
    const m = (req.body || {}).mode;
    if (!m) throw ApiError.badRequest('mode required (plan|override|general)');
    try { return { mode: processor.setMode(m) }; } catch (e) { throw ApiError.badRequest(e.message); }
  });

  // The supervisor + processor live with the control plane: same process, same lifecycle. NEVER under test (they
  // would spawn real books against the real corpus); GROUNDING_SUPERVISOR=0 disables them in any environment.
  if (process.env.NODE_ENV !== 'test' && process.env.GROUNDING_SUPERVISOR !== '0') {
    await queue.killStrayGroundingProcs(); // clean slate: kill any detached procs a restart left behind, else the fresh
                                     // supervisor re-derives the same books → duplicate-spawn runaway (2026-08-07)
    queue.startSupervisor();     // runs the queue serially
    processor.startProcessor();  // chooses the next work per the active mode (plan by default)
  }
}
