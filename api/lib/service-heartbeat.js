// SERVICE HEARTBEAT (docs/architecture/continuous-deploy.md; Chad 10-19: "a coordinator service and an internal API with
// health for each service" — macro-services, not micro). Each long-lived service writes data/run/services/<name>.json every
// 15 s: pid, the COMMIT it runs (its version — an unaffected service keeps an older one through deploys), state (running |
// draining), work in flight and what it is doing. GET /api/admin/ops/services reads them; the coordinator (updater) and
// Chad see every service at a glance. File-based: no writer, no DB. Deps: node:fs, drain.js.
import { mkdirSync, writeFileSync, renameSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isDraining } from './drain.js';

const DIR = () => join(process.cwd(), 'data', 'run', 'services');
const STALE_MS = 60_000;

/** The commit this checkout is on (read once at start = the version this process runs). */
export function headCommit(root = process.cwd()) {
  try {
    const head = readFileSync(join(root, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head.slice(0, 12);
    const ref = head.slice(5).trim();
    try { return readFileSync(join(root, '.git', ref), 'utf8').trim().slice(0, 12); } catch { /* packed */ }
    const packed = readFileSync(join(root, '.git', 'packed-refs'), 'utf8').split('\n').find((l) => l.endsWith(` ${ref}`));
    return packed ? packed.slice(0, 12) : null;
  } catch { return null; }
}

/** Start beating. state() → { inflight, doing, … } merged in each beat. → stop(). */
export function startHeartbeat({ name = process.env.name || 'unknown', every = 15_000, state = () => ({}), dir = DIR() } = {}) {
  const base = { name, pid: process.pid, commit: headCommit(), started_at: new Date().toISOString() };
  try { mkdirSync(dir, { recursive: true }); } catch { /* read-only: no heartbeat */ }
  const beat = () => {
    try {
      const rec = { ...base, beat_at: new Date().toISOString(), state: isDraining() ? 'draining' : 'running', ...state() };
      const f = join(dir, `${name}.json`);
      writeFileSync(`${f}.tmp`, JSON.stringify(rec)); renameSync(`${f}.tmp`, f);
    } catch { /* a missed beat shows as silent */ }
  };
  beat();
  const t = setInterval(beat, every);
  t.unref?.();
  return () => clearInterval(t);
}

/** Every service's last beat, with health: running | draining | silent (no beat for a minute) — and whether it runs HEAD. */
export function readServices({ dir = DIR(), now = Date.now(), head = headCommit() } = {}) {
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  return files.map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean).map((s) => ({
    ...s, health: now - Date.parse(s.beat_at) > STALE_MS ? 'silent' : s.state, on_head: !!head && s.commit === head,
    age_s: Math.round((now - Date.parse(s.beat_at)) / 1000),
  })).sort((a, b) => a.name.localeCompare(b.name));
}
