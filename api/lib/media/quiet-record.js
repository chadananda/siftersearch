// The meta.remaster.quiet record (pure, no deps): shared by tower's quiet repair and the worker bundle's item.js — a server-only import here broke the whole worker (10-30).
export const QUIET_REPAIR_VERSION = 1;
/** The meta.remaster.quiet record from a quiet.py report. Pure. */
export function quietRecord(rep, extra = {}) {
  return { v: QUIET_REPAIR_VERSION, quiet_s: rep.quiet_s ?? 0, stretches: rep.stretches ?? 0, noise_silenced_s: rep.loud_s ?? 0,
    voiced_kept_s: Math.round((rep.voiced_kept || []).reduce((a, [s, e]) => a + (e - s), 0) * 10) / 10, ...extra };
}
/** A published remaster carries its quiet pass (Chad 10-31: UniPASE makes the gaps between speech worse): the record meta.remaster.quiet at this version or later. Quiet attenuates the remaster's own gaps; it never inserts original audio. */
export const hasQuiet = (meta = {}) => (meta?.remaster?.quiet?.v ?? 0) >= QUIET_REPAIR_VERSION;
