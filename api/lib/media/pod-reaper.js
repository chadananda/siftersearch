// Independent GPU-pod reaper (Chad 10-24: "no dangling paid GPU instances"). Runs in the media service on its own timer, NOT in the
// cloud lane: lists RunPod pods named sifter-unipase-* (nothing else on the account is ever touched) and terminates any that are idle,
// stuck, unreachable, past their lifetime, orphaned, or billing while the lane is not running. Reads the lane's state file only.
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { LEDGER, POD_PREFIX, reapReason } from './pod-ledger.js';
import * as C from './cloud.js';

export const REAPER_FILE = join(dirname(C.STATE_FILE), 'pod-reaper.json');

/** One pass → { seen, reaped: [{ id, name, why }], errors }. Deps injectable (listPods, terminatePod, state, now). */
export async function reapPass(deps = {}) {
  const now = (deps.now || Date.now)();
  const list = deps.listPods || C.listPods, kill = deps.terminatePod || C.terminatePod;
  const st = deps.state !== undefined ? deps.state : await readFile(deps.stateFile || C.STATE_FILE, 'utf8').then(JSON.parse).catch(() => null);
  if (st && deps.state === undefined) { const b = Number(await readFile(`${deps.stateFile || C.STATE_FILE}.beat`, 'utf8').catch(() => 0)); if (b > (st.updated || 0)) st.updated = b; }   // the lane's own liveness timer
  const out = { at: now, seen: 0, reaped: [], errors: [] };
  const pods = (await list(deps)).filter((p) => String(p.name || '').startsWith(POD_PREFIX) && (p.desiredStatus || 'RUNNING') === 'RUNNING');
  out.seen = pods.length;
  for (const p of pods) {
    const why = reapReason(p, st?.pods?.[p.id] || null, st, now, deps.cfg || LEDGER);
    if (!why) continue;
    try { await kill(p.id, deps); out.reaped.push({ id: p.id, name: p.name, why }); }
    catch (err) { out.errors.push(`${p.name}: ${String(err.message).slice(0, 120)}`); }
  }
  if (deps.write !== false) {
    const prev = await readFile(deps.reaperFile || REAPER_FILE, 'utf8').then(JSON.parse).catch(() => ({}));
    out.history = [...out.reaped.map((x) => ({ at: now, ...x })), ...(prev.history || [])].slice(0, 30);
    await mkdir(dirname(deps.reaperFile || REAPER_FILE), { recursive: true });
    await writeFile(deps.reaperFile || REAPER_FILE, JSON.stringify(out, null, 1));
  }
  return out;
}
