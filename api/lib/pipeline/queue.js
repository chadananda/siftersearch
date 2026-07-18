// pipeline/queue — the grounding WORK QUEUE + its supervisor. The API owns the work ORDER and advances it
// itself, so processing never depends on an operator (or an agent's polling loop) being alive to launch the next
// book: when a slot frees, the next queued book starts. A dead babysitter must not mean a dead pipeline.
//
// Two concurrency rules, both learned the hard way:
//  1. MAX_CONCURRENT — books on DIFFERENT providers don't contend (Persian→anthropic ∥ English→deepseek), so >1 is
//     a real speedup; the cap just bounds the box.
//  2. ONE TAIL AT A TIME — from `project` onward a run mutates the SHARED entity graph, and `merge` is global (it
//     takes no docId). Two books there at once race: one merges same-name entities while the other is still
//     creating them. A run bounded before `project` (e.g. --to=research) is tail-free and always co-runnable.
// Deps: ../db, ./state (live runs), ./spawn (the one launcher), ./run-grounding (the stage order).
import { query, queryAll, queryOne } from '../db.js';
import { activeRuns } from './state.js';
import { spawnGrounding } from './spawn.js';
import { GROUNDING_STAGES } from './run-grounding.js';
import { logger } from '../logger.js';
import { DEFAULT_PEAK_WINDOWS, nowInPeak, peakEndsAt } from './peak.js';

export { nowInPeak, peakEndsAt } from './peak.js';   // re-export so callers/tests import peak logic via the queue

// Concurrency is SIZE-WEIGHTED, not a flat book count: GROUNDING_MAX_CONCURRENT is a SLOT budget, and a book
// consumes ceil(paragraphs / SLOT_PARAS) slots — so we run ~5 small books, or back off to 1-2 huge ones (an
// 18k-paragraph history nearly fills the budget alone). The early foundation books ran at a budget of 1 (strict
// serial) so the shared cast seeded in order; once that's established, parallelism is safe — the band mutex still
// serialises the graph-mutating tail, so only the cheaper read stages actually overlap.
const MAX_CONCURRENT = Number(process.env.GROUNDING_MAX_CONCURRENT || 5);
const SLOT_PARAS = Number(process.env.GROUNDING_SLOT_PARAS || 6000);
const slotsFor = (paras) => Math.max(1, Math.ceil((paras || 0) / SLOT_PARAS));
const paraCountOf = async (docId) => (await queryOne(`SELECT paragraph_count n FROM docs WHERE id=?`, [docId]))?.n || 0;
// The GRAPH-MUTATING band is project→dedup: these create/link/merge/dedup shared entities and `merge` is global,
// so two runs here race. Everything else parallelizes safely — the READ stages (disambiguate…research) write only
// per-paragraph data, and hype/verify AFTER dedup touch no shared entity (hype = per-paragraph questions; verify =
// read-only). The old rule counted project→END as the tail, which wrongly serialized independent hype-only runs.
const GRAPH_START = GROUNDING_STAGES.indexOf('project');
const GRAPH_END = GROUNDING_STAGES.indexOf('dedup');
const TICK_MS = 20000;
// Matches hype-book.mjs MINLEN (skip fragments below this length) so reachedBound's hype denominator counts the
// SAME paragraphs hype actually processes. Keep in sync with that script's default.
const HYPE_MINLEN = Number(process.env.MINLEN || 60);
// Auto-retry (unattended self-heal): a transient death (timeout, killed proc, flaky fetch) shouldn't strand a book.
// Requeue with backoff up to MAX_RETRIES, then leave it 'failed' for a human. Terminal reasons (budget) never retry.
const MAX_RETRIES = Number(process.env.GROUNDING_MAX_RETRIES || 2);
const RETRY_BACKOFF_S = Number(process.env.GROUNDING_RETRY_BACKOFF_S || 120);
// DeepSeek peak/valley pricing: with off-peak-only enabled on a provider, the supervisor won't LAUNCH its books
// during a peak window (a running book finishes — we launch-gate, not kill). Thousands of short books → nearly all
// spend lands in the cheap window. Pure window math lives in ./peak.js (shared with bio.js, no import cycle).

const parseOpts = (r) => { try { return r.opts_json ? JSON.parse(r.opts_json) : {}; } catch { return {}; } };

// Did a vanished run actually REACH its bound, or die early? proc-gone is ambiguous — a clean finish and a SIGKILL
// both clear run_json — so NEVER equate proc-gone with success (that once marked a book 'done' at 6% disambiguated,
// and separately marked read-halves 'done' with reconcile never run). Verify the ARTIFACT of the run's OWN bound
// stage (the last stage it was asked to complete: `only`, else `to`, else the full pipeline). Disambig alone is
// too weak for anything bounded past it.
export const boundStageOf = (opts = {}) => opts.only || opts.to || 'verify';

export async function reachedBound(docId, opts = {}, deps = {}) {
  const q = deps.queryOne || queryOne;
  const row = await q(
    `SELECT (SELECT COUNT(*) FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL) prose,
            (SELECT COUNT(*) FROM content WHERE doc_id=? AND context IS NOT NULL AND context!='') disamb,
            (SELECT COUNT(*) FROM content WHERE doc_id=? AND hyp_questions IS NOT NULL) hyped,
            (SELECT COUNT(*) FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL AND length(trim(text)) >= ${HYPE_MINLEN}) hypeable,
            (SELECT COUNT(*) FROM entity_mentions_v2 WHERE doc_id=?) mentions,
            (SELECT COUNT(*) FROM entity_claims WHERE doc_id=?) claims,
            (SELECT COUNT(DISTINCT resolved_as) FROM entity_mentions_v2 WHERE doc_id=? AND resolved_as IS NOT NULL AND resolved_as NOT LIKE '%?%') clusters,
            (SELECT COUNT(*) FROM entity_decisions WHERE target_kind='mention-cluster' AND CAST(json_extract(payload,'$.docId') AS INT)=?) decisions`,
    [docId, docId, docId, docId, docId, docId, docId, docId]);
  const prose = row?.prose || 0;
  if (prose === 0) return false;
  if ((row.disamb || 0) / prose < 0.98) return false;                     // the floor for EVERY bound
  // Per-stage artifact checks. Stages with no distinct cheap artifact (research/project/link/merge/dedup/verify)
  // all follow reconcile, so they ride on reconcile's decisions.
  // HYPE denominator = HYPEABLE paras (length >= HYPE_MINLEN), NOT all prose: hype-book.mjs skips shorter
  // fragments (titles/publisher lines), so measuring hyped/all-prose false-failed English books with many short
  // paragraphs (e.g. 185 hyped / 232 prose = 80% < 90% though hype was COMPLETE). Match hype's own filter.
  const artifactOk = {
    mentions: (row.mentions || 0) > 0,
    claims: (row.claims || 0) > 0,
    reconcile: (row.decisions || 0) >= 0.85 * Math.max(1, row.clusters || 0),
    hype: (row.hyped || 0) >= 0.9 * Math.max(1, row.hypeable || 0),
  };
  const artifactStage = (s) => (['research', 'project', 'link', 'merge', 'dedup', 'verify'].includes(s) ? 'reconcile' : s);
  const bound = boundStageOf(opts);
  if (opts.only) {
    // A single-stage run: verify ONLY that stage's artifact (its prerequisites were enforced by the gate, not by it).
    const s = artifactStage(bound);
    return s === 'disambiguate' ? true : artifactOk[s] === true;
  }
  // A full/`to` run did every stage up to the bound: require each artifact-bearing stage at or before it.
  const bi = GROUNDING_STAGES.indexOf(bound);
  for (const s of ['mentions', 'claims', 'reconcile', 'hype']) {
    if (GROUNDING_STAGES.indexOf(s) <= bi && artifactOk[s] === false) return false;
  }
  return true;
}
/**
 * Does a run's stage RANGE overlap the graph-mutating band (project→dedup)? Decided by the run's BOUND, not its
 * current stage — a full run parked in disambiguate still reaches the band later. `only:X` = the single stage X;
 * otherwise the range is [from||first .. to||last]. hype-only / research-bounded / read-stage runs own NO tail →
 * co-runnable. (Even this band-serialization is conservative: the single WRITER already serializes writes and
 * decisions are append-only, so concurrent graph work is mostly safe — relaxing it further is a tracked follow-up.)
 */
export const ownsTail = (opts = {}) => {
  const at = (s, dflt) => { const i = s ? GROUNDING_STAGES.indexOf(s) : -1; return i >= 0 ? i : dflt; };
  const start = opts.only ? at(opts.only, 0) : at(opts.from, 0);
  const end = opts.only ? at(opts.only, GROUNDING_STAGES.length - 1) : at(opts.to, GROUNDING_STAGES.length - 1);
  return start <= GRAPH_END && end >= GRAPH_START;   // [start,end] overlaps [project,dedup]
};

/** Add a book to the work order. Returns the queued row. */
export async function enqueue({ docId, note = null, position = null, ...opts }) {
  const pos = position ?? (((await queryOne(`SELECT MAX(position) m FROM grounding_queue WHERE status='queued'`))?.m ?? 0) + 1);
  const res = await query(`INSERT INTO grounding_queue (doc_id, opts_json, position, note) VALUES (?, ?, ?, ?)`,
    [Number(docId), JSON.stringify(opts), pos, note]);
  // `query` routes writes to the SINGLE WRITER — a different connection — so last_insert_rowid() read back here
  // sees nothing. Use the id the writer itself reports; fall back to the newest row for this doc.
  const id = res?.lastInsertRowid ?? res?.rows?.[0]?.lastInsertRowid;
  const row = id
    ? await queryOne(`SELECT * FROM grounding_queue WHERE id=?`, [Number(id)])
    : await queryOne(`SELECT * FROM grounding_queue WHERE doc_id=? ORDER BY id DESC LIMIT 1`, [Number(docId)]);
  logger.info({ docId: Number(docId), position: pos, opts }, 'grounding queued');
  return row;
}

/** The work order + terminal history (newest first), for the monitor. */
export async function list({ limit = 50 } = {}) {
  const rows = await queryAll(
    `SELECT * FROM grounding_queue WHERE status IN ('queued','running')
       UNION ALL SELECT * FROM (SELECT * FROM grounding_queue WHERE status NOT IN ('queued','running')
         ORDER BY COALESCE(finished_at, enqueued_at) DESC LIMIT ?)`, [limit]);
  return rows.map((r) => ({ ...r, opts: parseOpts(r), opts_json: undefined }));
}

/** Drop a queued item (or mark a running one cancelled — the proc itself is stopped via /grounding/stop). */
export async function cancel(id) {
  await query(`UPDATE grounding_queue SET status='cancelled', finished_at=unixepoch() WHERE id=? AND status='queued'`, [Number(id)]);
  return queryOne(`SELECT * FROM grounding_queue WHERE id=?`, [Number(id)]);
}

/**
 * Server-side SPEND GATE — the budget backstop that used to live only in a human's monitoring loop, so an
 * UNATTENDED run can't overspend. Each provider has a ceiling measured INCREMENTALLY over a baseline captured when
 * the budget was set (spent = SUM(cost) − baseline). Books billing to an `over` provider stay queued instead of
 * launching; `warn` (default 80%) is a heads-up the health-check surfaces. Empty table = no gate (fail-open on
 * config, fail-closed on spend once a row exists).
 */
export async function budgetStatus(deps = {}) {
  const qa = deps.queryAll || queryAll;
  const qo = deps.queryOne || queryOne;
  const now = deps.now || new Date();
  const rows = await qa(`SELECT provider, ceiling_usd, baseline_usd, warn_frac, offpeak_only, peak_windows FROM grounding_budget`);
  const out = [];
  for (const b of rows) {
    const spentRow = await qo(`SELECT COALESCE(SUM(estimated_cost_usd),0) s FROM ai_usage WHERE provider=? AND caller='corpus-rag'`, [b.provider]);
    const spent = Math.max(0, (spentRow?.s || 0) - (b.baseline_usd || 0));
    const frac = b.ceiling_usd > 0 ? spent / b.ceiling_usd : 0;
    let windows = DEFAULT_PEAK_WINDOWS;
    try { if (b.peak_windows) windows = JSON.parse(b.peak_windows); } catch { /* keep default */ }
    const offpeakOnly = !!b.offpeak_only;
    const inPeak = nowInPeak(windows, now);
    const peakBlocked = offpeakOnly && inPeak;                    // peakBlocked → won't launch this provider's books now
    const endsAt = peakBlocked ? peakEndsAt(windows, now) : null;
    out.push({ provider: b.provider, spent: Math.round(spent * 100) / 100, ceiling: b.ceiling_usd,
      frac: Math.round(frac * 1000) / 1000, over: spent >= b.ceiling_usd, warn: frac >= (b.warn_frac ?? 0.8),
      offpeakOnly, inPeak, peakBlocked,
      offPeakResumesAt: endsAt ? Math.floor(endsAt.getTime() / 1000) : null });  // epoch s → the UI's countdown target
  }
  return out;
}

/**
 * Which provider a book bills to (for the spend + off-peak gates). GROUND TRUTH is what the doc has ACTUALLY
 * charged: the pipeline's model routing (Mázindarání Persian → Haiku/anthropic) doesn't match content.language
 * (often NULL) or docs.language (Vol 8 is mistagged 'ar'), so keying on language misrouted Persian to deepseek and
 * the off-peak gate wrongly held it. Prefer the provider from this doc's ai_usage; fall back to language only for a
 * doc with no spend history yet.
 */
export async function providerForDoc(docId, deps = {}) {
  const qo = deps.queryOne || queryOne;
  const used = await qo(
    `SELECT provider FROM ai_usage WHERE caller='corpus-rag' AND CAST(document_id AS INT)=? GROUP BY provider ORDER BY COUNT(*) DESC LIMIT 1`, [docId]);
  if (used?.provider) return used.provider;
  const row = await qo(
    `SELECT COALESCE((SELECT language FROM content WHERE doc_id=? AND language IS NOT NULL GROUP BY language ORDER BY COUNT(*) DESC LIMIT 1),
                     (SELECT language FROM docs WHERE id=?)) lang`, [docId, docId]);
  return String(row?.lang || '').startsWith('fa') ? 'anthropic' : 'deepseek';
}

/**
 * One supervisor pass: reconcile queue rows against reality, then fill any free slot.
 * Idempotent and cheap — safe to call on a timer.
 */
export async function tick() {
  // Concurrency must be counted from an IMMEDIATE signal. activeRuns() reads run_json heartbeats, which a
  // just-spawned proc has not written yet — so back-to-back ticks each saw a free slot and over-spawned (8 enqueue
  // calls → 5 procs against a cap of 2). The queue's own 'running' rows are written synchronously at spawn, so
  // count the UNION: queue rows (immediate, authoritative) + run_json (covers runs started outside the queue).
  const live = await activeRuns();
  const runningRows = await queryAll(`SELECT * FROM grounding_queue WHERE status='running'`);
  const liveDocs = new Set([...live.map((r) => r.doc_id), ...runningRows.map((r) => r.doc_id)]);

  // A 'running' row whose proc is gone has finished (or died). run_json is cleared by the executor's finally, so
  // "not live" is the completion signal — but only once the run has had time to publish a heartbeat, else we'd
  // reap the run we just spawned. Don't guess success: record it and let the roadmap's done flag speak.
  const liveJson = new Set(live.map((r) => r.doc_id));
  let busy = 0;
  const busyDocs = [];   // doc_ids actually in flight → summed into slot usage below
  for (const r of runningRows) {
    const age = Date.now() / 1000 - (r.started_at || 0);
    if (!liveJson.has(r.doc_id) && r.started_at && age > 90) {
      // proc gone: DONE only if the book actually reached its bound stage; otherwise it died early.
      const ok = await reachedBound(r.doc_id, parseOpts(r));
      if (ok) {
        await query(`UPDATE grounding_queue SET status='done', error=NULL, finished_at=unixepoch() WHERE id=?`, [r.id]);
        logger.info({ docId: r.doc_id, id: r.id, outcome: 'done' }, 'grounding queue: run ended');
      } else if ((r.retry_count || 0) < MAX_RETRIES) {
        // AUTO-RETRY: a transient death (timeout/killed/flaky) shouldn't strand a book while unattended. Requeue
        // with escalating backoff; the atomic claim + budget gate still apply on the next launch.
        const rc = (r.retry_count || 0) + 1;
        const backoff = RETRY_BACKOFF_S * rc;
        await query(`UPDATE grounding_queue SET status='queued', retry_count=?, next_attempt_at=unixepoch()+?, pid=NULL, started_at=NULL, error=? WHERE id=?`,
          [rc, backoff, `retry ${rc}/${MAX_RETRIES}: did not reach ${boundStageOf(parseOpts(r))} (backoff ${backoff}s)`, r.id]);
        logger.warn({ docId: r.doc_id, id: r.id, retry: rc, backoff }, 'grounding queue: run failed → requeued with backoff');
      } else {
        await query(`UPDATE grounding_queue SET status='failed', finished_at=unixepoch(), error=? WHERE id=?`,
          [`failed after ${MAX_RETRIES} retries: did not reach ${boundStageOf(parseOpts(r))}`, r.id]);
        logger.error({ docId: r.doc_id, id: r.id }, 'grounding queue: run failed permanently after retries');
      }
    } else { busy++; busyDocs.push(r.doc_id); }
  }
  // Runs started outside the queue still occupy the box.
  for (const r of live) if (!runningRows.some((q) => q.doc_id === r.doc_id)) { busy++; busyDocs.push(r.doc_id); }
  // Size-weighted slot usage of everything in flight. If the budget is already full, launch nothing this tick.
  let usedSlots = 0;
  for (const d of busyDocs) usedSlots += slotsFor(await paraCountOf(d));
  if (usedSlots >= MAX_CONCURRENT) return { started: [], busy };

  // No more whole-book tail-lock: graph exclusivity is now the BAND MUTEX (pipeline/lock.js) — a run serialises
  // only at project→dedup, so a long reconcile no longer blocks other books' graph work. The queue just fills
  // free slots up to MAX_CONCURRENT; the mutex does the rest.
  // LAUNCH GATE (two server-side guards so an UNATTENDED run stays cheap + safe): a provider is blocked when it is
  //  • OVER its ceiling (budget backstop — never overspend), or
  //  • PEAK-BLOCKED (offpeak_only set AND currently a peak-pricing window — hold DeepSeek books for the cheap hours).
  // Blocked books stay queued; the next tick launches them once the wall clears. Computed once per tick.
  const blockedProviders = new Set((await budgetStatus()).filter((b) => b.over || b.peakBlocked).map((b) => b.provider));
  const started = [];
  // Skip rows still in retry-backoff (next_attempt_at in the future) so a just-requeued book waits its cooldown.
  for (const r of await queryAll(`SELECT * FROM grounding_queue WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at <= unixepoch()) ORDER BY position ASC, id ASC`)) {
    if (usedSlots >= MAX_CONCURRENT) break;                        // slot budget full
    if (liveDocs.has(r.doc_id) || started.some((s) => s.docId === r.doc_id)) continue; // already grounding this book
    if (blockedProviders.size && blockedProviders.has(await providerForDoc(r.doc_id))) continue; // budget OR peak wall: leave queued
    const slots = slotsFor(await paraCountOf(r.doc_id));
    if (usedSlots > 0 && usedSlots + slots > MAX_CONCURRENT) break; // next book (in order) doesn't fit → wait, don't skip ahead
    // ATOMIC CLAIM: flip the row to 'running' BEFORE spawning, guarded by WHERE status='queued'. Two concurrent
    // ticks (the 20s timer + a POST /queue/tick) both selected this row while it was still 'queued' and each
    // spawned a proc — the over-spawn that needed killing by hand. The write routes through the single writer, so
    // exactly one UPDATE matches; the loser sees 0 changes and skips.
    const claim = await query(`UPDATE grounding_queue SET status='running', started_at=unixepoch() WHERE id=? AND status='queued'`, [r.id]);
    if ((claim?.rows?.[0]?.changes ?? 0) === 0) continue;          // another tick claimed it first
    const pid = spawnGrounding(r.doc_id, parseOpts(r));
    await query(`UPDATE grounding_queue SET pid=? WHERE id=?`, [pid, r.id]);
    started.push({ id: r.id, docId: r.doc_id, pid });
    usedSlots += slots;
  }
  return { started, busy, blocked: [...blockedProviders] };
}

let timer = null;
/** Start the supervisor loop. Safe to call once at boot; a failed tick never kills it. */
export function startSupervisor() {
  if (timer) return timer;
  timer = setInterval(() => { tick().catch((e) => logger.warn({ err: e.message }, 'grounding supervisor tick failed')); }, TICK_MS);
  timer.unref?.();
  logger.info({ maxConcurrent: MAX_CONCURRENT, tickMs: TICK_MS }, 'grounding supervisor started');
  return timer;
}
