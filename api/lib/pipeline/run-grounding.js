// run-grounding — the ONE grounding executor. Drives a doc through the full stage sequence via the rag library.
// Shared by the CLI (scripts/complete-book.mjs), the orchestrator, and the HTTP control API so operator +
// automation + UI all use ONE path (no parallel drivers). Stage lifecycle is surfaced through callbacks
// (onStage before each, onResult after) so the caller decides where to report — status file, doc_pipeline, logs.
// Deps: ../rag-adapter (the stages), node:child_process (the link stage shells out, as the CLI did).
import { execSync } from 'node:child_process';
const { rag } = await import('../rag-adapter/index.js');

// Full Definition-of-Done sequence, in order. Must stay in lockstep with the rag stage set.
export const GROUNDING_STAGES = ['disambiguate', 'mentions', 'claims', 'reconcile', 'research', 'project', 'link', 'merge', 'dedup', 'hype', 'verify'];

/**
 * Drive one book through the grounding stages. Idempotent per stage (each rag stage resumes/skips done work).
 * opts: { from?, only?, cc=8, writer?, onStage?(stage,{index,total}), onResult?(stage,result) }.
 * Returns { ok, verify, createdIds, flaggedKeystones }. Throws if a stage throws (caller handles resume/retry).
 */
export async function runGrounding(docId, opts = {}) {
  const { from, only, cc = 8, onStage, onResult } = opts;
  const writer = opts.writer || process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';
  const fromI = only ? GROUNDING_STAGES.indexOf(only) : (from ? GROUNDING_STAGES.indexOf(from) : 0);
  const toI = only ? GROUNDING_STAGES.indexOf(only) : GROUNDING_STAGES.length - 1;
  const want = (s) => { const i = GROUNDING_STAGES.indexOf(s); return i >= fromI && i <= toI; };
  const enter = async (s) => onStage?.(s, { index: GROUNDING_STAGES.indexOf(s), total: GROUNDING_STAGES.length });
  const emit = (s, r) => { onResult?.(s, r); return r; };

  const out = { ok: false, verify: null, createdIds: [], flaggedKeystones: [] };

  if (want('disambiguate')) { await enter('disambiguate'); emit('disambiguate', await rag.disambiguate(docId, { concurrency: cc })); }
  if (want('mentions'))     { await enter('mentions'); emit('mentions', await rag.entities.mentions(docId)); }
  if (want('claims'))       { await enter('claims'); emit('claims', await rag.entities.claims(docId, { resume: true, threshold: 0.9, concurrency: cc })); }
  if (want('reconcile'))    { await enter('reconcile'); emit('reconcile', await rag.entities.reconcile(docId, { resume: true, threshold: 0.9, concurrency: 4 })); } // FULL — no --limit
  if (want('research'))     { await enter('research'); emit('research', await rag.entities.researchResolve(docId, { concurrency: 3 })); } // resolve uncertains: corpus+web
  if (want('project'))      { await enter('project'); const r = await rag.entities.project({ auto: true, kinds: ['link', 'create'], hiConf: 0.9, docId }); out.createdIds = r.createdIds || []; emit('project', r); }
  if (want('link'))         { await enter('link'); execSync(`DOC=${docId} WRITE=1 SIFTER_WRITER_URL=${writer} node scripts/entity-read/link-claims.mjs`, { stdio: 'inherit' }); }
  if (want('merge'))        { await enter('merge'); emit('merge', await rag.entities.merge({ concurrency: 4 })); } // same-name dedup by evidence
  if (want('dedup') && out.createdIds.length) { await enter('dedup'); emit('dedup', await rag.entities.dedupGuard({ entityIds: out.createdIds })); } // AFTER link — new entities need bound claims
  if (want('hype'))         { await enter('hype'); emit('hype', await rag.retrieval.index(docId, { resume: true })); }

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
}
