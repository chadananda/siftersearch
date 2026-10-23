// Stopped-short alert throttle: at most ONE mail per job × budget-key family × UTC day; the rest are counted (10-23: a
// shared media budget key stopped ~350 per-talk phrase runs and mailed Chad ~100 times). The family drops a ':<id>' suffix,
// so per-item keys (media-phrase-index:983195) share one daily mail. State: data/ops-alerts/<service>.json. Never throws.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export const alertFamily = (run) => `${run?.name || '?'}|${String(run?.params?.budgetKey || '').split(':')[0]}`;

/** Pure: decide for one stopped-short run. → { send, count, suppressedBefore, state } (state is the new state). */
export function throttleDecision(state, run, now = new Date()) {
  const day = now.toISOString().slice(0, 10), fam = alertFamily(run);
  const prev = state?.[fam];
  const suppressedBefore = prev && prev.day !== day ? Math.max(0, (prev.count || 0) - 1) : 0;   // yesterday's unmailed
  const count = prev?.day === day ? (prev.count || 0) + 1 : 1;
  return { send: count === 1, count, suppressedBefore, previousDay: suppressedBefore ? prev.day : null, state: { ...(state || {}), [fam]: { day, count, last_id: run?.id ?? null } } };
}

/** File-backed: read state, decide, write state back. */
export function throttleStoppedShort(file, run, now = new Date()) {
  let state = {};
  try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first use */ }
  const d = throttleDecision(state, run, now);
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(`${file}.tmp`, JSON.stringify(d.state, null, 1)); renameSync(`${file}.tmp`, file); } catch { /* unwritable → still decided */ }
  return d;
}
