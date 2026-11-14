// The meta.remaster.quiet record (pure, no deps): shared by tower's intake and the worker bundle's item.js — a server-only import here broke the whole worker (10-30).
// v2 (Chad 11-01): quiet is DATA decided on the GPU job (scripts/media/worker/quiet.py → enhanced/quiet.json); v1 silenced real speech and is redone.
// v3 (Chad 11-14): whisper words >1.5 s and repeated-token runs no longer protect static; music/static judged from the ORIGINAL's sound map; remaster static silenced. A bump only changes the stage fp (stale-by-fp,
// redone by `ops media rerun quiet`); QUIET_MIN_VERSION is what a result must carry to be accepted / complete, so v2 talks stay on air and a v2 worker image keeps working until it is promoted.
export const QUIET_REPAIR_VERSION = 3;
export const QUIET_MIN_VERSION = 2;
// A v1 pass keeps its talk ON AIR while the redo runs (the published copy stays until its replacement publishes); only a v2 pass is "current" (stale marks / fp use QUIET_REPAIR_VERSION).
export const QUIET_AIR_VERSION = 1;
/** The meta.remaster.quiet record from the worker's quiet block (post.json quiet = quiet.json summary). Pure. */
export function quietRecord(rep, extra = {}) {
  return { v: rep.version ?? QUIET_REPAIR_VERSION, quiet_s: rep.silenced_s ?? 0, stretches: (rep.spans || []).length, noise_silenced_s: rep.loud_silenced_s ?? 0, loud_stretches: rep.loud_stretches ?? 0,
    vad_kept: rep.vad_kept ?? 0, vad_kept_s: rep.vad_kept_s ?? 0, asr_kept: (rep.asr_kept || []).length, asr_kept_s: rep.asr_kept_s ?? 0, proof: rep.proof ? { violations: rep.proof.violations, spans: rep.proof.checked_spans } : null, ...extra };
}
/** A published remaster carries its quiet pass (Chad 10-31: UniPASE makes the gaps between speech worse): the record meta.remaster.quiet at the air version or later. Quiet attenuates the remaster's own gaps; it never inserts original audio. */
export const hasQuiet = (meta = {}) => (meta?.remaster?.quiet?.v ?? 0) >= QUIET_AIR_VERSION;
/** Loud silenced STRETCHES (cuts) of a talk's last quiet pass, for the redo order (Chad 11-01: a cut every few sentences ruins a talk even if the total is small). v1 recorded no per-stretch loudness: its `stretches` stand in when it silenced any audible noise. Pure. */
export const loudCuts = (meta = {}) => { const q = meta?.remaster?.quiet; return !q ? 0 : q.loud_stretches ?? (q.noise_silenced_s > 0 ? q.stretches || 0 : 0); };
/** The redo ORDER (Chad 11-01; order, never a filter): published talks first, most loud silenced stretches (cuts) first, then loud seconds, then id; the rest of the remastered follow in the same order. rows: [{ id, published, meta }]. Pure. */
export const redoOrder = (rows = []) => rows.map((r) => ({ ...r, cuts: loudCuts(r.meta), loud_s: r.meta?.remaster?.quiet?.noise_silenced_s || 0 }))
  .sort((a, b) => (b.published ? 1 : 0) - (a.published ? 1 : 0) || b.cuts - a.cuts || b.loud_s - a.loud_s || a.id - b.id);
