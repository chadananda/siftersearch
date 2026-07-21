// Grounding PROCESSOR modes — decides WHAT the serial supervisor grounds next, so processing never depends on
// an operator (or an agent) remembering the plan or hand-enrolling books. Three modes:
//
//   plan     (default now) — follow the hardcoded history plan (integration-phases.js, the order the UI renders)
//                            top-down: first not-yet-complete book → resume from its real stage → ground fully.
//   override (dev/agents)  — the follower stands down; the queue is whatever an operator/agent hand-enrolls via
//                            the API. For development and deliberate hand-holding.
//   general  (default later, once the whole plan is done) — process ANY unprocessed document in the library,
//                            not just the history plan; keeps everything ground as new docs arrive.
//
// The supervisor (queue.js) always runs the queue serially; this module only chooses the next work. Mode is
// in-memory with an env default, so a restart reverts to the safe default (plan) — an agent that switched to
// override and forgot never strands the run.
// Deps: bio (plan order + done state) · queue (enqueue/list/tick). No import cycle: queue imports neither.
import { queryOne, queryAll } from '../db.js';
import { logger } from '../logger.js';
import { enqueue, list, tick } from './queue.js';
import { getIntegrationProgress } from '../bio.js';

const HYPE_MINLEN = Number(process.env.HYPE_MINLEN || 60);   // matches reachedBound / hype-book fragment filter
const MODES = ['plan', 'override', 'general'];

let _mode = MODES.includes(process.env.GROUNDING_MODE) ? process.env.GROUNDING_MODE : 'plan';
export const getMode = () => _mode;
export function setMode(m) {
  if (!MODES.includes(m)) throw new Error(`invalid grounding mode "${m}" (expected ${MODES.join('|')})`);
  const prev = _mode; _mode = m;
  if (m !== prev) logger.info({ from: prev, to: m }, 'grounding processor mode changed');
  return _mode;
}

// The stage a book must RESUME from to reach full grounding, decided by which artifacts it already has — the
// inverse of reachedBound. Returns the grounding opts, or null when the book is either fully done OR ungroundable
// (no prose). Never re-runs completed stages: a book with its graph tail already built only needs `from:hype`.
//   {}                → full run (disambiguation or reconcile incomplete)
//   {from:'project'}  → read-half done; needs the graph tail (project→dedup) + HyPE
//   {from:'hype'}     → everything but HyPE done; needs only the retrieval index
//   null              → fully grounded, or empty doc → skip (not remaining work)
export async function resumeStageFor(docId, deps = {}) {
  const q = deps.queryOne || queryOne;
  const r = await q(
    `SELECT (SELECT COUNT(*) FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL) prose,
            (SELECT COUNT(*) FROM content WHERE doc_id=? AND context IS NOT NULL AND context!='') disamb,
            (SELECT COUNT(*) FROM content WHERE doc_id=? AND hyp_questions IS NOT NULL) hyped,
            (SELECT COUNT(*) FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL AND length(trim(text)) >= ${HYPE_MINLEN}) hypeable,
            (SELECT COUNT(*) FROM entity_claims WHERE doc_id=? AND entity_id IS NOT NULL) claimsBound,
            (SELECT COUNT(DISTINCT resolved_as) FROM entity_mentions_v2 WHERE doc_id=? AND resolved_as IS NOT NULL AND resolved_as NOT LIKE '%?%') clusters,
            (SELECT COUNT(*) FROM entity_decisions WHERE target_kind='mention-cluster' AND CAST(json_extract(payload,'$.docId') AS INT)=?) decisions`,
    [docId, docId, docId, docId, docId, docId, docId]);
  const prose = r?.prose || 0;
  if (prose === 0) return null;                                              // no groundable content → skip
  if ((r.disamb || 0) / prose < 0.98) return {};                            // disambiguation incomplete → full
  if ((r.decisions || 0) < 0.85 * (r.clusters || 0)) return {};             // reconcile incomplete → full (0 clusters ⇒ nothing to reconcile ⇒ ok)
  // DONE = fully PROCESSED, not entity OUTPUT (must match reachedBound, else the follower re-queues what the queue
  // considers done → the re-grounding grind). HyPE is stage 10 (after the graph tail), so once it covers the
  // hypeable paras the whole pipeline ran → done, EVEN with 0 bound claims (a legitimately entity-sparse book).
  // The old order tested claimsBound===0 FIRST and re-ran such books from 'project' forever.
  if ((r.hyped || 0) >= 0.9 * (r.hypeable || 0)) return null;                // HyPE complete ⇒ all prior stages ran → done
  if ((r.claimsBound || 0) === 0) return { from: 'project' };               // HyPE incomplete + no tail evidence → graph tail + HyPE
  return { from: 'hype' };                                                   // tail done, only HyPE left
}

// Keep the next `lookahead` incomplete books queued, in the given order, each resuming from its real stage.
// Idempotent: already-queued books are respected (never duplicated); position is pinned to the source index so
// order can never drift. `orderedIds()` supplies the candidate order (plan order or library order per mode).
async function refill(orderedIdsFn, { lookahead, deps }) {
  const rows = deps.list ? await deps.list() : await list({ limit: 100000 });   // list() returns the array itself
  const active = new Set(rows.filter((r) => r.status === 'queued' || r.status === 'running').map((r) => r.doc_id));
  if (active.size >= lookahead) return { added: [], active: active.size };   // enough work already queued

  const resume = deps.resumeStageFor || resumeStageFor;
  const enq = deps.enqueue || enqueue;
  const doTick = deps.tick || tick;
  const ordered = await orderedIdsFn();
  const added = [];
  let pending = 0;
  for (let i = 0; i < ordered.length && pending < lookahead; i++) {
    const { id, done } = ordered[i];
    if (done) continue;                        // reliably complete → skip fast (avoids a per-doc query)
    const opts = await resume(id);             // authoritative stage decision
    if (opts == null) continue;                // done or empty → not remaining work
    pending++;
    if (active.has(id)) continue;              // already in flight → counts toward lookahead, don't duplicate
    await enq({ docId: id, position: i, ...opts });   // position = source index → order can't drift
    added.push({ docId: id, opts });
  }
  if (added.length) doTick().catch(() => {});
  return { added, pending };
}

// PLAN mode: candidate order = the history plan (integration-phases.js), exactly as the UI renders it.
export async function followPlanTick({ lookahead = 3, deps = {} } = {}) {
  const orderedIds = async () => {
    const prog = deps.getProgress ? await deps.getProgress() : await getIntegrationProgress();
    // A phase's work = its listed `books` PLUS its `groups` (e.g. the hundreds of Pilgrim-Notes primary sources
    // grouped by period under Primary Sources — they're NOT in `books`). Both must be followed, in phase order,
    // so the 600+ primary docs are grounded BEFORE biographies. Group `done` is a weak has-claims flag, so force
    // resumeStageFor to decide (done:false) rather than fast-skip.
    return (prog.phases || []).flatMap((p) => [
      ...(p.books || []).map((b) => ({ id: b.id, done: !!b.done })),
      ...(p.groups || []).flatMap((g) => (g.books || []).map((b) => ({ id: b.id, done: false }))),
    ]).filter((b) => b && b.id);
  };
  return refill(orderedIds, { lookahead, deps });
}

// GENERAL mode: candidate order = every substantial library document (biggest first as a rough priority). The
// `done` flag isn't pre-known here, so resumeStageFor decides per doc. Coarse but self-completing; refine the
// ordering (doc-tier) later. Runs only once the history plan is fully ground.
export async function followGeneralTick({ lookahead = 3, deps = {} } = {}) {
  const orderedIds = async () => {
    const rows = deps.libraryDocs ? await deps.libraryDocs()
      : await queryAll(`SELECT id FROM docs WHERE deleted_at IS NULL AND duplicate_of IS NULL
                        AND coalesce(paragraph_count,0) >= 40 ORDER BY paragraph_count DESC LIMIT 1000`);
    return rows.map((r) => ({ id: r.id, done: false }));
  };
  return refill(orderedIds, { lookahead, deps });
}

let _timer = null;
// Start the processor loop. Dispatches each interval on the CURRENT mode: plan/general drive from their source;
// override stands down (the hand-enrolled queue runs as-is). Safe to call once at boot.
export function startProcessor() {
  if (_timer) return;
  const run = () => {
    const mode = getMode();
    const driver = mode === 'plan' ? followPlanTick : mode === 'general' ? followGeneralTick : null;
    if (!driver) return Promise.resolve();     // override → follower stands down
    // Keep MORE books queued than the supervisor's slot budget so it never starves (a book can be 1 slot; 5 slots
    // ≈ 5 small books). Default a comfortable lookahead above GROUNDING_MAX_CONCURRENT.
    const lookahead = Number(process.env.GROUNDING_LOOKAHEAD || Math.max(8, Number(process.env.GROUNDING_MAX_CONCURRENT || 5) + 3));
    return driver({ lookahead })
      .then((r) => { if (r.added?.length) logger.info({ mode, added: r.added }, 'processor: enqueued next book(s)'); })
      .catch((e) => logger.warn({ mode, err: e.message }, 'processor tick failed'));
  };
  _timer = setInterval(run, Number(process.env.GROUNDING_FOLLOW_INTERVAL_MS || 180000));   // every 3 min
  run();
  logger.info({ mode: _mode }, 'grounding processor started');
}
