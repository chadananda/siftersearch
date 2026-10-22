#!/usr/bin/env node
// RAM-disk Qdrant (qdrant-hot on tmpfs /srv/qram) flush + restore — storage plan §6, R14. NOT installed yet (after the MP44 +
// phrases_f16 rebuild). `qram.mjs flush [--all-dirty] [--wait]`: snapshot each hot collection that changed since its last
// flush (points_count or newest storage mtime), keep 2 generations, record state.json. `qram.mjs restore --args`: print
// `--snapshot <newest complete file>:<collection>` for each collection with a snapshot but no storage (qdrant-hot ExecStart).
// Qdrant HTTP only (no SQLite). Env: QRAM_URL (http://127.0.0.1:6335), QDRANT__SERVICE__API_KEY, QRAM_STORAGE, QRAM_SNAPSHOTS.
import { readdirSync, statSync, readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

export const KEEP = 2;
const env = (k, d) => process.env[k] || d;

/** A collection is dirty when its point count changed or its storage was written after the last flush. Pure. */
export function isDirty(last, cur) {
  if (!last) return true;
  return last.points !== cur.points || cur.mtimeMs > last.mtimeMs;
}

/** Snapshots to delete so `keep` newest remain (by creation_time, then name). Pure. */
export function toPrune(snapshots, keep = KEEP) {
  const sorted = [...snapshots].sort((a, b) => String(b.creation_time || '').localeCompare(String(a.creation_time || '')) || b.name.localeCompare(a.name));
  return sorted.slice(keep).map((s) => s.name);
}

/** Newest COMPLETE snapshot file per collection: a `.snapshot` with its `.checksum` sidecar (Qdrant writes it last). Pure.
 *  files: { [collection]: [{ name, mtimeMs }] } → { [collection]: name } */
export function newestComplete(files) {
  const out = {};
  for (const [c, list] of Object.entries(files)) {
    const names = new Set(list.map((f) => f.name));
    const ok = list.filter((f) => f.name.endsWith('.snapshot') && names.has(`${f.name}.checksum`)).sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (ok.length) out[c] = ok[0].name;
  }
  return out;
}

/** qdrant-hot start args: restore only collections that have a snapshot and no storage (never overwrite live data). Pure. */
export function restoreArgs({ snapshotsDir, snapshots, present }) {
  return Object.entries(snapshots).filter(([c]) => !present.includes(c)).sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([c, name]) => ['--snapshot', `${join(snapshotsDir, c, name)}:${c}`]);
}

// Taking a snapshot rewrites every segment's segment.json (measured on tower 10-21, sometimes after the API returns), so
// counting it made each flush mark the next one dirty: a data change always also writes WAL / vector / payload files.
export const countsForDirty = (name) => name !== 'segment.json';
const newestMtime = (dir) => {
  let m = 0;
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (countsForDirty(e.name)) m = Math.max(m, statSync(p).mtimeMs); } };
  if (existsSync(dir)) walk(dir);
  return m;
};
const listDir = (d) => (existsSync(d) ? readdirSync(d) : []);

async function api(path, { method = 'GET' } = {}) {
  const r = await fetch(`${env('QRAM_URL', 'http://127.0.0.1:6335')}${path}`, { method, headers: { 'api-key': env('QDRANT__SERVICE__API_KEY', env('QDRANT_KEY', '')) }, signal: AbortSignal.timeout(30 * 60_000) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).result;
}

/** Snapshot every changed hot collection; a failure on one never stops the others. → { failed } */
export async function flush({ storage = env('QRAM_STORAGE', '/srv/qram/storage'), snapshotsDir = env('QRAM_SNAPSHOTS', '/faster/qram-snapshots'), log = console.log } = {}) {
  const stateFile = join(snapshotsDir, 'state.json');
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
  const { collections } = await api('/collections');
  let failed = 0;
  for (const { name: c } of collections) {
    const t0 = Date.now();
    try {
      const info = await api(`/collections/${c}`);
      const cur = { points: info.points_count, mtimeMs: newestMtime(join(storage, 'collections', c)) };
      if (!isDirty(state[c], cur)) { log(`qram-flush ${c}: clean (${cur.points} points)`); continue; }
      const snap = await api(`/collections/${c}/snapshots?wait=true`, { method: 'POST' });
      for (const old of toPrune(await api(`/collections/${c}/snapshots`))) await api(`/collections/${c}/snapshots/${old}?wait=true`, { method: 'DELETE' });
      state[c] = { ...cur, mtimeMs: newestMtime(join(storage, 'collections', c)), snapshot: snap.name, size: snap.size, at: new Date().toISOString() };
      writeFileSync(`${stateFile}.tmp`, JSON.stringify(state, null, 1)); renameSync(`${stateFile}.tmp`, stateFile);
      log(`qram-flush ${c}: snapshot ${snap.name} ${((snap.size || 0) / 1e9).toFixed(2)} GB in ${Math.round((Date.now() - t0) / 1000)} s`);
    } catch (err) { failed++; log(`qram-flush ${c}: FAILED ${err.message}`); }
  }
  return { failed };
}

/** The qdrant start args restoring every collection that has a complete snapshot but no storage on the RAM disk. */
export function restore({ storage = env('QRAM_STORAGE', '/srv/qram/storage'), snapshotsDir = env('QRAM_SNAPSHOTS', '/faster/qram-snapshots') } = {}) {
  const files = {};
  for (const c of listDir(snapshotsDir)) {
    const d = join(snapshotsDir, c);
    if (!statSync(d).isDirectory()) continue;
    files[c] = listDir(d).map((name) => ({ name, mtimeMs: statSync(join(d, name)).mtimeMs }));
  }
  return restoreArgs({ snapshotsDir, snapshots: newestComplete(files), present: listDir(join(storage, 'collections')) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'flush') { const { failed } = await flush(); process.exit(failed ? 1 : 0); }
  else if (cmd === 'restore' && process.argv.includes('--args')) process.stdout.write(restore().join(' '));
  else { console.error('usage: qram.mjs flush [--all-dirty] [--wait] | restore --args'); process.exit(2); }
}
