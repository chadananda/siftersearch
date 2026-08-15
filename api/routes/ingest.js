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




  // Locator metadata: 'pdf-z-zwemer' as an author, a filename as a title. Read-only AUDIT so the repair can
  // be reviewed without a shell — recoveryRate is the number that decides whether the rule is good enough to
  // run on ~2,058 live documents.
  fastify.get('/ingest/metadata-audit', admin, async (req) => {
    const { auditLocatorMetadata } = await import('../lib/ingest/metadata-repair.js');
    return auditLocatorMetadata({ limit: Math.min(Number(req.query?.limit) || 300, 5000), apply: false });
  });

  // The repair. Rewrites what live documents claim about their authorship, so it demands an explicit
  // confirm — a mistyped curl must not silently rewrite the library.
  fastify.post('/ingest/metadata-backfill', admin, async (req) => {
    if (req.body?.confirm !== 'rewrite-author-metadata') {
      throw ApiError.badRequest("pass {\"confirm\":\"rewrite-author-metadata\"} — this rewrites author/title on live documents");
    }
    const { auditLocatorMetadata } = await import('../lib/ingest/metadata-repair.js');
    return auditLocatorMetadata({ limit: Math.min(Number(req.body?.limit) || 500, 5000), apply: true });
  });

  // ── entity_research JSON repair ────────────────────────────────────────────────────────────────────
  // 20 rows hold PROSE where bio.js parses JSON, so those people silently lose their death/kin. DRY RUN by
  // default and via GET: the list is worth seeing before anything is written, and a repair you cannot
  // preview is a repair you cannot check. Writes go through query() → the single writer, like everything
  // else (2026-08-14).
  const RESEARCH_JSON_COLS = ['aliases', 'kinship', 'research_notes'];
  // SCOPED TO WHERE A PARSE ACTUALLY HAPPENS. A first scan found 140 malformed rows, but 117 are `work`
  // entities whose research_notes holds a curated prose description — and bio.js reads research_notes ONLY
  // for persons (`WHERE ge.entity_type = 'person'`). Nothing parses the work rows as JSON, so that prose is
  // not corrupt, it is the format its consumers expect. Rewriting it would be damage dressed as a repair.
  // Default therefore = person only; ?types=all still lists everything for diagnosis (2026-08-14).
  const findMalformed = async ({ types = ['person'] } = {}) => {
    const all = types === 'all';
    const rows = await queryAll(
      `SELECT rowid AS rid, canonical_name, entity_type, aliases, kinship, research_notes
         FROM entity_research${all ? '' : ` WHERE entity_type IN (${types.map(() => '?').join(',')})`}`,
      all ? [] : types, 'repair:scan-entity-research');
    const { parsedOrUndefined, repairJsonColumn } = await import('../lib/text/repair-json-column.js');
    const out = [];
    for (const r of rows) {
      for (const col of RESEARCH_JSON_COLS) {
        const raw = r[col];
        if (raw == null || String(raw).trim() === '') continue;
        if (parsedOrUndefined(raw) !== undefined) continue;         // valid → not ours
        const fix = repairJsonColumn(col, raw);
        if (!fix.changed) continue;
        out.push({ rid: r.rid, canonical_name: r.canonical_name, entity_type: r.entity_type,
          column: col, raw: String(raw).slice(0, 300), next: fix.next, why: fix.why });
      }
    }
    return out;
  };

  fastify.get('/entity-research/malformed', admin, async (req) => {
    const items = await findMalformed(req.query?.types === 'all' ? { types: 'all' } : {});
    const byColumn = {};
    for (const i of items) byColumn[i.column] = (byColumn[i.column] || 0) + 1;
    return { count: items.length, byColumn, items };
  });

  fastify.post('/entity-research/repair-json', admin, async (req) => {
    // apply is person-scoped ALWAYS: `types:'all'` is a diagnostic view, never a write target.
    const items = await findMalformed();
    if (!req.body?.apply) return { dryRun: true, count: items.length, items };
    let repaired = 0;
    const failed = [];
    for (const i of items) {
      try {
        // Keyed by rowid: canonical_name is not unique across entity_type, and a repair that hits the wrong
        // row is worse than the corruption it is fixing.
        await query(`UPDATE entity_research SET ${i.column} = ? WHERE rowid = ?`, [i.next, i.rid],
          'repair:entity-research-json');
        repaired += 1;
      } catch (err) { failed.push({ rid: i.rid, column: i.column, error: err.message }); }
    }
    return { applied: true, repaired, failed, total: items.length };
  });

  // WHY IS THIS BOOK NOT BEING WORKED ON? The question that cost a full off-peak window (2026-08-13): the
  // roadmap said 241 plan books were not done while the follower enqueued none of them, and the numbers each
  // side used were computed in-process and thrown away. This returns the SAME row both decisions read, both
  // verdicts, and the gate that blocks — so a disagreement is one GET away instead of a night of inference.
  fastify.get('/grounding/why/:docId', admin, async (req) => {
    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) throw ApiError.badRequest('numeric docId required');
    const { coverageOf, blockingGate, isDoneFromArtifacts } = await import('../lib/pipeline/queue.js');
    const { resumeStageFor } = await import('../lib/pipeline/plan.js');
    const row = await coverageOf(docId);
    const pipelineDone = isDoneFromArtifacts(row, {});
    const resume = await resumeStageFor(docId);
    const blocked = blockingGate(row, {});
    // `clusters` counts RESOLVED mentions only, so clusters:0 is ambiguous in the one way that matters:
    // a book nobody appears in and a book whose extraction ran but never resolved look identical, and the
    // first is legitimately done while the second is silently unfinished. Split them (2026-08-14): raw =
    // mentions extracted at all, unresolved = extracted but never bound to an entity. raw:0 => genuinely
    // entity-sparse; raw>0 with unresolved==raw => extraction ran, resolution did not.
    const m = (await queryOne(
      `SELECT COUNT(*) raw, SUM(CASE WHEN entity_id IS NULL THEN 1 ELSE 0 END) unresolved
         FROM entity_mentions_v2 WHERE doc_id=?`, [docId], 'grounding:why-mention-split')) || {};
    const mentions = { raw: m.raw || 0, unresolved: m.unresolved || 0 };
    // WHICH disambig version wrote these notes? entities/mentions.js only reads paragraphs whose
    // context_model EQUALS the current version, while the coverage measure counts context IS NOT NULL with no
    // version check. A book disambiguated by an older version therefore reads 100% disambiguated, gives the
    // mentions stage an EMPTY paragraph list, writes nothing, and reports success. Surfacing the actual
    // context_model spread makes that visible instead of inferable (2026-08-14).
    const models = await queryAll(
      `SELECT COALESCE(context_model,'(null)') model, COUNT(*) n FROM content
        WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL AND context IS NOT NULL
        GROUP BY 1 ORDER BY n DESC`, [docId], 'grounding:why-context-models');
    // The version the mentions stage compares against lives in the rag adapter's ctx.config.versions,
    // not in api/lib/config.js — read it from the same place the stage does.
    // What disambiguation ACTUALLY WROTE. mentions.js parses «"surface" = resolved» pairs out of the note, so a
    // note that is empty or carries no quoted pairs yields no mentions no matter how complete coverage looks.
    // Two hypotheses (never-ran, version-mismatch) were refuted by inference before this was simply shown.
    const notes = await queryAll(
      `SELECT paragraph_index pidx, substr(COALESCE(context,''),1,240) note, length(COALESCE(context,'')) len
         FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL
          AND context IS NOT NULL ORDER BY length(COALESCE(context,'')) DESC LIMIT 3`,
      [docId], 'grounding:why-note-sample');
    const noteStats = (await queryOne(
      `SELECT COUNT(*) n, SUM(CASE WHEN trim(COALESCE(context,''))='' THEN 1 ELSE 0 END) empty,
              SUM(CASE WHEN context LIKE '%=%' THEN 1 ELSE 0 END) withPairs
         FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL
          AND context IS NOT NULL`, [docId], 'grounding:why-note-stats')) || {};
    const { RAG_VERSIONS } = await import('../lib/rag-adapter/index.js');
    const currentDisambig = RAG_VERSIONS.disambig;
    const eligible = models.find((r) => r.model === currentDisambig)?.n || 0;
    const extractionVerdict = mentions.raw === 0
      ? 'no mentions extracted — entity-sparse, or extraction never ran on this book'
      : (row.clusters ? 'extraction and resolution both produced output'
        : 'extraction produced mentions but NONE resolved — resolution did not finish');
    // resumeStageFor returning null means "nothing to do" — which is the follower's SKIP. If the pipeline
    // also says done, the two agree. If they disagree, that is the bug, and naming it here is the point.
    const followerWouldEnqueue = resume !== null;
    return {
      docId,
      coverage: row,
      mentions,
      contextModels: models,
      notes: { ...noteStats, longest: notes },
      currentDisambig,
      mentionsEligibleParas: eligible,
      extractionVerdict,
      pipelineDone,
      followerWouldEnqueue,
      resumeFrom: resume === null ? null : (resume.from || 'full run'),
      blockingGate: blocked,
      verdict: pipelineDone === !followerWouldEnqueue
        ? (pipelineDone ? 'agreed: done' : 'agreed: needs work')
        : 'DISAGREEMENT — the roadmap and the follower read the same row differently',
    };
  });

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


  // WHERE THE QUERY TIME GOES — the whole picture, not just the outliers. Ranked by TOTAL time, because the
  // two ways this pipeline has actually hurt itself are opposite shapes: one 152s scan, and a 1.3s check run
  // 672×. Sorting by worst-case hides the second; sorting by count hides the first. Total catches both.
  // `frozenPct` is the number that matters operationally: better-sqlite3 is synchronous, so total query time
  // IS time that process spent unable to do anything else.
  fastify.get('/server/query-time', admin, async (req) => {
    const hours = Math.min(Math.max(Number(req.query?.hours) || 24, 1), 24 * 30);
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    // Group by NAME first — a query TYPE is what you act on. Unnamed statements fall back to their shape
    // and are reported as such, which doubles as a worklist: an expensive line with no name wants one.
    const rows = await queryAll(
      `SELECT proc, kind, label, MAX(name) name,
              SUM(n) n, SUM(total_ms) total_ms, MAX(max_ms) max_ms, MAX(sql_sample) sql_sample
         FROM query_stats WHERE hour >= ?
        GROUP BY proc, kind, label ORDER BY total_ms DESC LIMIT 60`, [since],
      'admin:query-time-report').catch(() => []);
    const perProc = await queryAll(
      `SELECT proc, SUM(n) n, SUM(total_ms) total_ms FROM query_stats WHERE hour >= ? GROUP BY proc ORDER BY total_ms DESC`,
      [since]).catch(() => []);
    // frozenPct must divide by the span actually OBSERVED, not the span requested: query_stats began
    // collecting when migration 111 landed, so dividing one hour of data by a 24h window reported 0.8%
    // for a process that was really frozen 10.7% of the time it was measured — an instrument understating
    // the very problem it exists to find.
    const span = await queryOne(
      `SELECT MIN(hour) lo, MAX(hour) hi FROM query_stats WHERE hour >= ?`, [since], 'admin:query-time-span')
      .catch(() => null);
    const observedHours = span?.lo != null ? Math.max(1, (span.hi - span.lo) / 3600 + 1) : hours;
    const wallMs = observedHours * 3600 * 1000;
    return {
      hours,
      observedHours,                 // how much of the window actually has data — frozenPct is over THIS
      note: 'total_ms is SYNCHRONOUS time: with better-sqlite3 it is time the process could not serve anything else',
      processes: perProc.map((p) => ({
        proc: p.proc, queries: p.n, totalMs: p.total_ms,
        totalMin: Math.round(p.total_ms / 600) / 100,
        frozenPct: Math.round((p.total_ms / wallMs) * 1000) / 10,   // share of wall-clock spent inside SQLite
      })),
      // The named lines are the actionable ones; unnamed are listed too so nothing hides.
      unnamedShare: (() => {
        const tot = rows.reduce((a, r) => a + r.total_ms, 0) || 1;
        return Math.round((rows.filter((r) => !r.name).reduce((a, r) => a + r.total_ms, 0) / tot) * 100);
      })(),
      queries: rows.map((r) => ({
        query: r.name || '(unnamed)', proc: r.proc, kind: r.kind, calls: r.n,
        totalMin: Math.round(r.total_ms / 600) / 100,
        avgMs: Math.round(r.total_ms / Math.max(1, r.n)),
        worstMs: r.max_ms,
        // The shape of the problem, named — so the fix is obvious from the report alone.
        pattern: r.max_ms >= 5000 ? 'BLOCKING scan' : (r.n >= 200 && r.total_ms >= 60000 ? 'death by a thousand cuts' : 'ok'),
        sql: r.sql_sample,
      })),
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

  // PREVIEW the relabel proposals. The apply endpoint existed with no way to READ what it would do, so the
  // only way to inspect a proposal was to apply it — which is not a review gate, it is a leap. Read-only,
  // grouped by from→to so the shape of the change is visible before anyone approves it (2026-08-14).
  fastify.get('/ingest/relabel/pending', admin, async (req) => {
    const limit = Math.min(Number(req.query?.limit) || 200, 2000);
    const rows = await queryAll(
      `SELECT item_ref, reason, payload_json, updated_at FROM ingest_stage
        WHERE stage = 'relabel' AND status = 'pending' ORDER BY item_ref LIMIT ?`, [limit],
      'relabel:list-pending');
    const byMove = {};
    const items = rows.map((r) => {
      let p = {}; try { p = JSON.parse(r.payload_json || '{}'); } catch { /* reason still carries from → to */ }
      const move = `${p.from || '?'} → ${p.to || '?'}`;
      byMove[move] = (byMove[move] || 0) + 1;
      return { doc_id: Number(r.item_ref), move, from: p.from ?? null, to: p.to ?? null,
        title: p.title ?? null, reason: r.reason, confidence: p.confidence ?? null, updated_at: r.updated_at };
    });
    return { count: items.length, byMove, items };
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
