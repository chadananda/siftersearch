// POWER MODE — the one global read-only flag (Chad 10-23: the UPS battery is for an EMERGENCY shutdown only). A JSON file on
// tmpfs (/dev/shm: gone after a reboot, so a machine that boots on mains is never stuck read-only), written only by
// scripts/ops/ups-power.sh. Absent file = normal. Modes:
//   normal    everything runs
//   draining  power is out: services claim no new work and drain (the SIGHUP drain), writes still land so jobs save resume points
//   readonly  flushed: the writer refuses every write ("read-only (power)"), telemetry is dropped, reads keep serving
// Every check is a cached stat+read (≤ 1 per second per process). Deps: node:fs. db-write-path-20261023 § UPS.
import { readFileSync } from 'node:fs';

export const POWER_FILE = () => process.env.SIFTER_POWER_FILE || '/dev/shm/sifter-power.json';
const TTL_MS = 1000;
let cache = { at: 0, state: null };

/** {mode, since, reason, stopped?} or null (normal). Never throws. */
export function powerState({ now = Date.now(), fresh = false } = {}) {
  if (!fresh && now - cache.at < TTL_MS) return cache.state;
  let state = null;
  try {
    const j = JSON.parse(readFileSync(POWER_FILE(), 'utf8'));
    if (j && (j.mode === 'draining' || j.mode === 'readonly')) state = j;
  } catch { /* absent or unreadable = normal */ }
  cache = { at: now, state };
  return state;
}
export const powerMode = (o) => powerState(o)?.mode || 'normal';
/** Writes are refused. */
export const isPowerReadOnly = (o) => powerMode(o) === 'readonly';
/** No new work may start (draining or read-only). */
export const isPowerHold = (o) => powerMode(o) !== 'normal';
/** One line for status surfaces. */
export const powerLine = (o) => { const s = powerState(o); return s ? `POWER: ${s.mode === 'readonly' ? 'read-only mode' : 'draining for read-only mode'} since ${s.since || '?'}${s.reason ? ` (${s.reason})` : ''}` : null; };

export class PowerReadOnlyError extends Error {
  constructor(what = 'write') { super(`read-only (power): ${what} refused — tower is on UPS battery`); this.code = 'SIFTER_READONLY'; this.readonly = true; this.statusCode = 503; }
}

/** Call onHold once when power leaves normal (the same drain SIGHUP starts). Polls every `every` ms, unref'd. → stop(). */
export function watchPower(onHold, { every = 2000 } = {}) {
  let fired = false;
  const t = setInterval(() => { if (!fired && isPowerHold({ fresh: true })) { fired = true; onHold(powerState()); } }, every);
  t.unref?.();
  return () => clearInterval(t);
}

/** A starting service PARKS here while power is held: it claims nothing until mains is back and the flag is cleared,
 *  then starts normally (its interrupted jobs resume from their saved points). Resolves at once when power is normal. */
export async function waitForNormalPower({ every = 5000, onPark = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!isPowerHold({ fresh: true })) return false;
  onPark(powerState());
  while (isPowerHold({ fresh: true })) await sleep(every);
  return true;
}

/** test seam */
export const _resetPowerCache = () => { cache = { at: 0, state: null }; };
