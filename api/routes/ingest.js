// Ingestion control + status over the API. Mounted at /api/admin/ingest.
// The point of this file: answering "is ingestion working?" must be ONE request, never an investigation.
// Before it existed, "never started", "running", and "nothing to do" were indistinguishable from off-box —
// current_activity only measures AI spend (conversion spends none) and the missing-books queue is TTL-frozen.
//
// Deliberate design: the API does NOT execute worker processes. It RECORDS a request; the stage's own cron
// process picks it up on its next tick and honours it even outside the peak window. Keeping execution in the
// worker and intent in the API is why a control-plane request can never half-run or block a request thread.
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { query, queryOne, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import * as state from '../lib/pipeline/stage-state.js';
import { nowInPeak, peakEndsAt } from '../lib/pipeline/peak.js';
import { join } from 'node:path';

// Where logs can live: the app's own ./logs (what ecosystem.config.cjs declares) and PM2's default
// store (what an app started before that config actually uses). Checked in that order.
const logDirs = () => [join(process.cwd(), 'logs'), join(process.env.HOME || '/root', '.pm2', 'logs')];
const KNOWN_LOGS = new Set([
  'converter-out', 'converter-error', 'book-ingest-out', 'book-ingest-error',
  'digest-out', 'digest-error', 'relabel-out', 'relabel-error',
  'pipeline-snapshot-out', 'pipeline-snapshot-error', 'api-out', 'api-error',
  // The worker hosts the single writer; when IT crash-loops every writing stage dies with
  // "other side closed", so its log is the first place to look when writes fail everywhere.
  'worker-out', 'worker-error', 'embedding-out', 'embedding-error',
  'deep-research-out', 'deep-research-error', 'updater-out', 'updater-error',
  'library-watcher-out', 'library-watcher-error', 'tunnel-out', 'tunnel-error',
]);

export default async function ingestRoutes(fastify) {
  const admin = { preHandler: requireInternal };

  // ── THE one status call ────────────────────────────────────────────────────────────────────────────
  // Per stage: counts by status, why things were rejected, the last run + its throughput, whether a run is
  // stuck, and the most recent per-item errors. Plus whether the window even allows work right now, so a
  // deliberately-paused pipeline never reads as broken.
  fastify.get('/ingest/status', admin, async () => {
    const st = await state.ingestStatus();
    const inPeak = nowInPeak();
    const requested = await queryAll(
      `SELECT stage, id, started_at FROM pipeline_run WHERE status = 'requested' ORDER BY id`);
    return {
      ...st,
      window: {
        // Conversion/ingest run in the PEAK window precisely because grounding is paused then.
        ingest_allowed_now: inPeak,
        reason: inPeak ? 'peak window — grounding paused, ingestion runs' : 'off-peak — grounding owns the box',
        peak_ends_at: inPeak ? peakEndsAt()?.toISOString() : null,
      },
      pending_requests: requested,
    };
  });

  fastify.get('/ingest/runs', admin, async (req) => {
    const stage = req.query?.stage;
    const limit = Math.min(Number(req.query?.limit) || 30, 200);
    const rows = stage
      ? await queryAll(`SELECT * FROM pipeline_run WHERE stage = ? ORDER BY id DESC LIMIT ?`, [stage, limit])
      : await queryAll(`SELECT * FROM pipeline_run ORDER BY id DESC LIMIT ?`, [limit]);
    return { runs: rows };
  });

  // Everything known about one item, across stages — "what happened to this book?" without grepping logs.
  fastify.get('/ingest/item/:ref', admin, async (req) => {
    const rows = await queryAll(`SELECT * FROM ingest_stage WHERE item_ref = ? ORDER BY stage`, [String(req.params.ref)]);
    if (!rows.length) throw ApiError.notFound(`no pipeline state for item ${req.params.ref}`);
    return { item_ref: String(req.params.ref), stages: rows };
  });

  // Why did things get rejected? Rejection is DATA, not a log line — this is how the quality gate gets tuned.
  fastify.get('/ingest/rejections', admin, async (req) => {
    const stage = req.query?.stage || 'convert';
    const limit = Math.min(Number(req.query?.limit) || 50, 500);
    const [reasons, items] = await Promise.all([
      queryAll(`SELECT reason, COUNT(*) n FROM ingest_stage WHERE stage = ? AND status = 'rejected'
                GROUP BY reason ORDER BY n DESC`, [stage]),
      queryAll(`SELECT item_ref, reason, payload_json, updated_at FROM ingest_stage
                 WHERE stage = ? AND status = 'rejected' ORDER BY updated_at DESC LIMIT ?`, [stage, limit]),
    ]);
    return { stage, reasons, items };
  });

  // Items by stage+status — the general view the review workflow actually needs. /ingest/rejections only
  // shows status='rejected', so the relabel scan's PROPOSALS (recorded as 'pending') were unreadable: a
  // propose-then-approve design with no way to read the proposal is just a delay, not a safeguard.
  fastify.get('/ingest/items', admin, async (req) => {
    const stage = String(req.query?.stage || '');
    const status = String(req.query?.status || '');
    if (stage && !state.STAGES.includes(stage)) throw ApiError.badRequest(`unknown stage '${stage}'`);
    const limit = Math.min(Number(req.query?.limit) || 100, 1000);
    const where = ['1=1'], args = [];
    if (stage) { where.push('stage = ?'); args.push(stage); }
    if (status) { where.push('status = ?'); args.push(status); }
    const items = await queryAll(
      `SELECT item_ref, stage, status, reason, attempts, doc_id, payload_json, updated_at
         FROM ingest_stage WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`, [...args, limit]);
    const byReason = await queryAll(
      `SELECT reason, COUNT(*) n FROM ingest_stage WHERE ${where.join(' AND ')} AND reason IS NOT NULL
        GROUP BY reason ORDER BY n DESC`, args);
    return { stage: stage || 'all', status: status || 'all', count: items.length, by_reason: byReason, items };
  });

  // ── LOGS: read a pipeline log without an ssh session ───────────────────────────────────────────────
  // Written because the answer to "I need ssh to see why this failed" is almost always "the management API
  // is missing an endpoint". Three times in one night the decisive artifact was a log file on the box: the
  // per-book grounding log, the converter's output, the ingest run's output. Read-only, tail-only, and the
  // name must match a known shape — never an arbitrary path, so this cannot become a file-read primitive.


  // Probe the single writer. Its /health lives on 127.0.0.1:7849 — localhost-only, so diagnosing it used to
  // mean SSH. The API runs on the same box, so it can ask on our behalf. Read-only: GETs /health, never /write.
  // Probes several times because the failure being chased is INTERMITTENT (a socket accepted then closed);
  // a single OK proves nothing.
  fastify.get('/server/writer', admin, async (req) => {
    const url = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';
    const n = Math.min(Math.max(Number(req.query?.probes) || 5, 1), 20);
    const probes = [];
    for (let i = 0; i < n; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
        const body = await res.text().catch(() => '');
        probes.push({ ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: body.length });
      } catch (e) {
        // The exact shape the grounding children die on — record the undici code, not just "failed".
        probes.push({ ok: false, ms: Date.now() - t0, error: e?.message, code: e?.cause?.code || e?.code || e?.name });
      }
      if (i < n - 1) await new Promise((r) => setTimeout(r, 150));
    }
    const good = probes.filter((p) => p.ok);
    return {
      writerUrl: url,
      probes: n,
      okCount: good.length,
      // Intermittent is the diagnosis that matters: all-ok and all-fail are easy, a mix means the writer is
      // accepting connections while blocked, which is what closes sockets mid-request.
      verdict: good.length === n ? 'healthy' : good.length === 0 ? 'down' : 'INTERMITTENT',
      slowestMs: Math.max(...probes.map((p) => p.ms)),
      results: probes,
    };
  });

  // The slow-query detector's missing half: somewhere to READ what it found, across every process.
  // Aggregated by statement shape, worst-total-impact first — one 61s statement that runs each boot
  // matters more than a thousand 200ms reads, and sorting by count alone hides it.
  fastify.get('/server/slow-queries', admin, async (req) => {
    const hours = Math.min(Math.max(Number(req.query?.hours) || 24, 1), 24 * 30);
    const minMs = Math.max(Number(req.query?.minMs) || 1000, 0);
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    const rows = await queryAll(
      `SELECT fingerprint, kind, proc, db_name,
              COUNT(*) n, MAX(duration_ms) worst_ms, SUM(duration_ms) total_ms,
              CAST(AVG(duration_ms) AS INT) avg_ms, MAX(at) last_at,
              MAX(sql_sample) sql_sample, MAX(query_plan) query_plan, MAX(name) name
         FROM slow_query_log
        WHERE at >= ? AND duration_ms >= ?
        GROUP BY fingerprint, kind, proc, db_name
        ORDER BY total_ms DESC
        LIMIT 50`, [since, minMs]).catch(() => []);

    // A slow WRITE is not just slow: better-sqlite3 is synchronous, so it froze that process. On the
    // worker — the single writer — that is why /write and /health stop answering and callers see
    // "other side closed". Surface those separately so they cannot be read as ordinary slowness.
    const blockingMs = Number(process.env.BLOCKING_QUERY_MS || 5000);
    const blocking = rows.filter((r) => r.worst_ms >= blockingMs);
    return {
      hours,
      minMs,
      blockingThresholdMs: blockingMs,
      blockingCount: blocking.length,
      blocking: blocking.map((r) => ({
        proc: r.proc, kind: r.kind, worstMs: r.worst_ms, occurrences: r.n,
        frozeEventLoopFor: `${(r.worst_ms / 1000).toFixed(1)}s`,
        lastAt: new Date(r.last_at * 1000).toISOString(), sql: r.sql_sample,
      })),
      queries: rows,
    };
  });

  // Which logs exist, so nobody has to guess a name (or SSH to run `ls logs/`).
  fastify.get('/logs', admin, async () => {
    const { readdir, stat } = await import('node:fs/promises');
    const out = [];
    for (const dir of logDirs()) {
      let names = [];
      try { names = await readdir(dir); } catch { continue; }
      for (const f of names) {
        if (!f.endsWith('.log')) continue;
        try {
          const st = await stat(join(dir, f));
          out.push({ name: f.replace(/\.log$/, ''), dir, bytes: st.size, mtime: st.mtime.toISOString() });
        } catch { /* raced with rotation */ }
      }
    }
    out.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return { count: out.length, logs: out.slice(0, 300) };
  });

  fastify.get('/logs/:name', admin, async (req) => {
    const { readFile, stat } = await import('node:fs/promises');
    const name = String(req.params.name || '');
    // Anchored allowlist: a doc's grounding log, or a known pipeline/PM2 log. No dots, no separators.
    // PM2 appends the app's instance id to the configured filename (worker-out-1, converter-error-25) and
    // uses its own siftersearch-<app>-<stream> naming when it owns the file. Accept both shapes; still
    // anchored, still no dots or path separators, so nothing outside the log dirs is reachable.
    const ok = /^grounding-\d{1,9}$/.test(name)
      || KNOWN_LOGS.has(name)
      || /^[a-z][a-z0-9-]{0,48}-(out|error)(-\d{1,4})?$/.test(name)
      || /^[a-z][a-z0-9-]{0,48}$/.test(name);   // plain script logs: system-checks, stall-guard, digest…
    if (!ok) throw ApiError.badRequest(`log '${name}' is not readable here (expected grounding-<docId> or a known pipeline log; GET /logs lists them)`);

    // PM2 apps declare ./logs/<x>.log, but an app started before that config still writes to
    // ~/.pm2/logs/siftersearch-<app>-<stream>.log. Try both and SAY which paths were tried — a bare
    // 404 sent me hunting for a crash-looping worker's log by hand.
    const m = /^(.*)-(out|error)$/.exec(name);
    const candidates = [];
    for (const dir of logDirs()) {
      candidates.push(join(dir, `${name}.log`));
      if (m) candidates.push(join(dir, `siftersearch-${m[1]}-${m[2]}.log`));
    }
    let file = null; let size = null;
    for (const c of candidates) {
      try { size = (await stat(c)).size; file = c; break; } catch { /* try the next */ }
    }
    if (!file) throw ApiError.notFound(`no log named '${name}' — looked in: ${candidates.join(', ')}`);

    const lines = Math.min(Number(req.query?.lines) || 60, 500);
    // Read only the tail: a grounding log can be megabytes and the interesting part is always the end.
    const MAX_BYTES = 512 * 1024;
    const buf = await readFile(file);
    const text = buf.subarray(Math.max(0, buf.length - MAX_BYTES)).toString('utf8');
    const all = text.split('\n');
    return { name, file, bytes: size, lines: all.length, tail: all.slice(-lines) };
  });

  // ── AUDIT: who changed this file/doc, when, and why ────────────────────────────────────────────────
  // The question that motivated all of this: "we cannot figure out why files were moved."
  fastify.get('/audit', admin, async (req) => {
    const { recentAudit, auditSummary } = await import('../lib/audit.js');
    const hours = Math.min(Number(req.query?.hours) || 24, 24 * 30);
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    const [entries, summary] = await Promise.all([
      recentAudit({
        action: req.query?.action || null, actor: req.query?.actor || null,
        docId: req.query?.doc_id != null ? Number(req.query.doc_id) : null,
        sinceEpoch: since, limit: Number(req.query?.limit) || 200,
      }),
      auditSummary({ sinceEpoch: since }),
    ]);
    return { window_hours: hours, summary, count: entries.length, entries };
  });

  // The full history of ONE doc, oldest first — "why is this doc gone / different?"
  fastify.get('/audit/doc/:id', admin, async (req) => {
    const { docHistory } = await import('../lib/audit.js');
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) throw ApiError.badRequest('doc id must be a number');
    const history = await docHistory(docId);
    return { doc_id: docId, events: history.length, history };
  });

  // ── Control ────────────────────────────────────────────────────────────────────────────────────────
  // Ask a stage to run at its next tick, even outside the peak window. The API records intent only.
  fastify.post('/ingest/run/:stage', admin, async (req) => {
    const stage = String(req.params.stage);
    if (!state.STAGES.includes(stage)) throw ApiError.badRequest(`unknown stage '${stage}' (expected: ${state.STAGES.join(', ')})`);
    const existing = await queryOne(`SELECT id FROM pipeline_run WHERE stage = ? AND status = 'requested'`, [stage]);
    if (existing) return { stage, requested: true, run_id: existing.id, note: 'a request was already pending' };
    await query(`INSERT INTO pipeline_run (stage, status, started_at, note) VALUES (?, 'requested', unixepoch(), ?)`,
      [stage, `requested via API${nowInPeak() ? '' : ' (off-peak — will run anyway)'}`]);
    const row = await queryOne(`SELECT id FROM pipeline_run WHERE stage = ? ORDER BY id DESC LIMIT 1`, [stage]);
    logger.info({ stage, runId: row?.id }, 'ingest: run requested via API');
    return { stage, requested: true, run_id: row?.id, note: 'the stage picks this up on its next tick and ignores the peak gate' };
  });

  // APPROVE the relabel proposals. The scan proposes (status='pending'); this is the other half — without
  // it the "gate" is just a stall. Applies ONLY what was already recorded and reviewed, writes through the
  // single writer, and audits every change with its before/after so it is reversible from the trail.
  fastify.post('/ingest/relabel/apply', admin, async (req) => {
    const { audit } = await import('../lib/audit.js');
    const limit = Math.min(Number(req.body?.limit) || 500, 5000);
    const only = Array.isArray(req.body?.doc_ids) ? req.body.doc_ids.map(Number).filter(Number.isFinite) : null;
    let rows = await queryAll(
      `SELECT item_ref, reason, payload_json FROM ingest_stage
        WHERE stage = 'relabel' AND status = 'pending' ORDER BY item_ref LIMIT ?`, [limit]);
    if (only) rows = rows.filter((r) => only.includes(Number(r.item_ref)));
    if (!rows.length) return { applied: 0, note: 'no pending relabel proposals' };

    const applied = [];
    for (const r of rows) {
      let p = {}; try { p = JSON.parse(r.payload_json || '{}'); } catch { /* reason still carries from → to */ }
      const to = p.to || String(r.reason || '').split('→').pop()?.trim();
      if (!to || !/^[a-z]{2}$/.test(to)) continue;             // never write a language we cannot parse
      const docId = Number(r.item_ref);
      await query('UPDATE docs SET language = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [to, docId]);
      await query(`UPDATE ingest_stage SET status = 'done', updated_at = unixepoch()
                    WHERE stage = 'relabel' AND item_ref = ?`, [String(docId)]);
      await audit({
        actor: `api:relabel/apply${req.body?.approved_by ? `:${req.body.approved_by}` : ''}`,
        action: 'doc.language', target: `doc:${docId}`, docId,
        reason: `approved relabel ${p.from || '?'} → ${to}`,
        detail: { from: p.from ?? null, to, title: p.title ?? null },
      }).catch(() => {});
      applied.push({ doc_id: docId, from: p.from ?? null, to, title: p.title ?? null });
    }
    logger.info({ applied: applied.length }, 'relabel proposals applied');
    return { applied: applied.length, changes: applied };
  });

  // After a fix, put failed items back in the queue. Rejected items are NOT touched: a rejection is a
  // judgement about the source (scanned PDF, no text layer), not a transient error to retry blindly.
  fastify.post('/ingest/retry/:stage', admin, async (req) => {
    const stage = String(req.params.stage);
    if (!state.STAGES.includes(stage)) throw ApiError.badRequest(`unknown stage '${stage}'`);
    const n = await state.retryFailed(stage, { limit: Math.min(Number(req.body?.limit) || 500, 5000) });
    logger.info({ stage, reset: n }, 'ingest: failed items returned to the queue');
    return { stage, reset: n };
  });
}
