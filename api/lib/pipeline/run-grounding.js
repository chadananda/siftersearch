// run-grounding — the ONE grounding executor. Drives a doc through the full stage sequence via the rag library.
// Shared by the CLI (scripts/complete-book.mjs), the orchestrator, and the HTTP control API so operator +
// automation + UI all use ONE path (no parallel drivers). Stage lifecycle is surfaced through callbacks
// (onStage before each, onResult after) so the caller decides where to report — status file, doc_pipeline, logs.
// Deps: ../rag-adapter (the stages), ./state.js (reports live run state into doc_pipeline — the single truth the
// UI/API read), node:child_process (the link stage shells out, as the CLI did).
import { execSync } from 'node:child_process';
import os from 'node:os';
import { setRun } from './state.js';
const { rag, withUsageScope, langOf } = await import('../rag-adapter/index.js');
const { setAIContext } = await import('../ai-context.js');   // stamp the live stage onto the metering scope

// Full Definition-of-Done sequence, in order. Must stay in lockstep with the rag stage set.
export const GROUNDING_STAGES = ['disambiguate', 'mentions', 'claims', 'reconcile', 'research', 'project', 'link', 'merge', 'dedup', 'hype', 'verify'];

/**
 * Drive one book through the grounding stages. Idempotent per stage (each rag stage resumes/skips done work).
 * opts: { from?, only?, cc=8, writer?, onStage?(stage,{index,total}), onResult?(stage,result) }.
 * Returns { ok, verify, createdIds, flaggedKeystones }. Throws if a stage throws (caller handles resume/retry).
 */
export async function runGrounding(docId, opts = {}) {
  const { from, only, to, readjudicate, cc = 8, onStage, onResult, report = true } = opts;
  const writer = opts.writer || process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';
  const fromI = only ? GROUNDING_STAGES.indexOf(only) : (from ? GROUNDING_STAGES.indexOf(from) : 0);
  // `to` bounds the last stage (used by an incremental re-adjudication sweep to run reconcile..link and skip a
  // full hype re-index). `only` still pins a single stage.
  const toI = only ? GROUNDING_STAGES.indexOf(only) : (to ? GROUNDING_STAGES.indexOf(to) : GROUNDING_STAGES.length - 1);
  const want = (s) => { const i = GROUNDING_STAGES.indexOf(s); return i >= fromI && i <= toI; };
  const startedAt = new Date().toISOString();
  let currentRun = null;   // the live run object; enter() replaces it, the heartbeat refreshes its updatedAt.
  const writeRun = () => setRun(docId, currentRun).catch(() => {});
  // enter() reports the live stage into doc_pipeline.run_json (the single truth bio.js/UI/API read) AND calls onStage.
  // It also re-scopes metering, so every model call the stage makes is costed against (docId, stage) in ai_usage
  // and checked against the spend policy (paid providers = Persian only).
  const enter = async (s) => {
    setAIContext({ stage: s });   // the live ALS store — assigning to `scope` would not reach it (it was spread)
    currentRun = { docId, stage: s, stageIndex: GROUNDING_STAGES.indexOf(s), totalStages: GROUNDING_STAGES.length,
      withinFrac: 0, itemsDone: 0, itemsTotal: 0,
      // toStage = this run's BOUND. The queue supervisor reads it to enforce "one graph-mutating run at a time":
      // a full run parked in disambiguate will still reach the tail later, so intent — not current stage — decides.
      toStage: GROUNDING_STAGES[toI],
      pid: process.pid, host: os.hostname(), startedAt, updatedAt: new Date().toISOString() };
    if (report) await writeRun();
    await onStage?.(s, { index: GROUNDING_STAGES.indexOf(s), total: GROUNDING_STAGES.length });
  };
  // Per-item within-stage progress from the stages' pool() → run_json.withinFrac, so the bar reflects REAL work
  // done (job size = total items) and a flat bar means work actually stopped. Throttled to ~3s so a per-paragraph
  // callback doesn't hammer the single writer; the value is always kept fresh in-memory for the heartbeat too.
  let lastProg = 0;
  const onProgress = (done, total) => {
    if (!currentRun || !total) return;
    currentRun.itemsDone = done; currentRun.itemsTotal = total;
    currentRun.withinFrac = Math.min(0.999, done / total);
    const now = Date.now();
    if (report && (now - lastProg > 3000 || done === total)) { lastProg = now; currentRun.updatedAt = new Date().toISOString(); writeRun(); }
  };
  const emit = (s, r) => { onResult?.(s, r); return r; };

  const out = { ok: false, verify: null, createdIds: [], flaggedKeystones: [] };
  // HEARTBEAT: a stage can run far longer than the freshness window (e.g. disambiguate/claims/hype minutes+), so refresh
  // run_json.updatedAt every 30s — otherwise activeRun/UI treat the (still-running) book as dead and show nothing.
  const hb = report ? setInterval(() => { if (currentRun) { currentRun.updatedAt = new Date().toISOString(); writeRun(); } }, 30000) : null;

  // ONE metering + policy scope for the whole run: every model call any stage makes inherits (docId, lang, stage),
  // so its cost lands in ai_usage against THIS book and a paid provider is refused unless the book is Persian.
  // enter() mutates scope.stage as the run advances — the AsyncLocalStorage store is this same object.
  const scope = { docId, lang: null, stage: null };
  try { scope.lang = await langOf(docId); } catch { /* unknown language → policy fails closed on paid providers */ }

  return withUsageScope(scope, async () => {
  try {
    if (want('disambiguate')) { await enter('disambiguate'); emit('disambiguate', await rag.disambiguate(docId, { concurrency: cc, onProgress })); }
    if (want('mentions'))     { await enter('mentions'); emit('mentions', await rag.entities.mentions(docId)); }
    if (want('claims'))       { await enter('claims'); emit('claims', await rag.entities.claims(docId, { resume: true, threshold: 0.9, concurrency: cc, onProgress })); }
    if (want('reconcile'))    { await enter('reconcile'); emit('reconcile', await rag.entities.reconcile(docId, readjudicate ? { readjudicate, threshold: 0.9, concurrency: 4, onProgress } : { resume: true, threshold: 0.9, concurrency: 4, onProgress })); } // readjudicate = incremental re-sweep of the improvable clusters; else FULL resume
    if (want('research'))     { await enter('research'); emit('research', await rag.entities.researchResolve(docId, { concurrency: 3, onProgress })); } // resolve uncertains: corpus+web
    if (want('project'))      { await enter('project'); const r = await rag.entities.project({ auto: true, kinds: ['link', 'create'], hiConf: 0.9, docId }); out.createdIds = r.createdIds || []; emit('project', r); }
    if (want('link'))         { await enter('link'); execSync(`DOC=${docId} WRITE=1 SIFTER_WRITER_URL=${writer} node scripts/entity-read/link-claims.mjs`, { stdio: 'inherit' }); }
    if (want('merge'))        { await enter('merge'); emit('merge', await rag.entities.merge({ concurrency: 4, onProgress })); } // same-name dedup by evidence
    if (want('dedup') && out.createdIds.length) { await enter('dedup'); emit('dedup', await rag.entities.dedupGuard({ entityIds: out.createdIds, onProgress })); } // AFTER link — new entities need bound claims
    if (want('hype'))         { await enter('hype'); emit('hype', await rag.retrieval.index(docId, { resume: true, onProgress })); }

    if (want('verify')) {
      await enter('verify');
      const v = await rag.entities.verify(docId);
      out.verify = { ok: v.ok, ...v.checks, missing: v.missing };
      out.ok = v.ok;
      emit('verify', out.verify);
      // Keystone-roster DoD (warn-only): major figures must not split across name/title/epithet. Evidence-adjudicated.
      if (v.ok) {
        try {
          const { runGate } = await import('../../../scripts/entity-read/keystone-gate.mjs');
          out.flaggedKeystones = (await runGate()).filter((r) => r.verdict !== 'ok');
        } catch { /* gate optional — never blocks completion */ }
      }
    } else {
      out.ok = true; // a partial run (no verify requested) is not a failure
    }
    return out;
  } finally {
    // Clear the marker on completion OR a thrown crash → UI goes idle + /start can relaunch (no stale run_json).
    // (A hard SIGKILL skips this; the freshness guard then clears it after the heartbeat lapses.)
    if (hb) clearInterval(hb);
    if (report) await setRun(docId, null).catch(() => {});
  }
  });
}
