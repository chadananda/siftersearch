// GET /health — one schema for every machine that runs the queue agent (pods, CPU pods, boss, aorus, tower-finish). Chad 10-31: "a health check
// API on each pod image that reports all key stats including CPU, GPU, RAM, vRam, workload, percent completed … the coordinator polls it".
// Auth: x-queue-key = the agent's own MEDIA_QUEUE_KEY (no open endpoint). Tower's poller: api/lib/media/health-poll.js. Also: the snapshot ring
// (ROOT/health-ring.jsonl) and the agent's last words (pushed to the queue as it exits — the trail pod 389's vanish lacked).
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

export const HEALTH_SCHEMA = 1;
export const RING_N = 60;        // the ring holds the last 60 snapshots (one a minute: the last hour)
export const LAST_WORDS = { snapshots: 5, lines: 40, maxBytes: 32_768 };   // small JSON only (Chad: never audio, nothing big)
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

/** GPU now: { device, util, power_w, power_limit_w, vram_used_mb, vram_total_mb } — util = busy %; null on a CPU-only machine or unreadable. */
export function gpuStats(device, { run = spawnSync, read = (f) => readFileSync(f, 'utf8'), ls = readdirSync, has = existsSync } = {}) {
  try {
    if (device === 'cuda') {
      const r = run('nvidia-smi', ['--query-gpu=utilization.gpu,power.draw,power.limit,memory.used,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000 });
      const rows = String(r.stdout || '').split('\n').filter(Boolean).map((l) => l.split(',').map((x) => Number(x.trim())));
      if (r.status !== 0 || !rows.length) return null;
      const sum = (i) => rows.reduce((a, x) => a + (Number.isFinite(x[i]) ? x[i] : 0), 0);
      return { device, count: rows.length, util: Math.max(...rows.map((x) => x[0])), power_w: r1(sum(1)), power_limit_w: r1(sum(2)), vram_used_mb: sum(3), vram_total_mb: sum(4) };
    }
    if (device === 'rocm') {
      const dev = ls('/sys/class/drm').map((c) => `/sys/class/drm/${c}/device`).find((d) => has(`${d}/gpu_busy_percent`));
      if (!dev) return null;
      const n = (f) => { try { return Number(read(`${dev}/${f}`).trim()); } catch { return NaN; } };
      let power = NaN, cap = NaN;
      try { const hw = ls(`${dev}/hwmon`).map((h) => `${dev}/hwmon/${h}`)[0]; power = Number(read(`${hw}/power1_average`)) / 1e6; cap = Number(read(`${hw}/power1_cap`)) / 1e6; } catch {}
      const mb = (f) => n(f) / 1048576;
      // Strix Halo: unified memory — VRAM carve-out + GTT together are what a model can use
      const used = mb('mem_info_vram_used') + (mb('mem_info_gtt_used') || 0), total = mb('mem_info_vram_total') + (mb('mem_info_gtt_total') || 0);
      return { device, count: 1, util: n('gpu_busy_percent'), power_w: r1(power), power_limit_w: r1(cap), vram_used_mb: Math.round(used) || null, vram_total_mb: Math.round(total) || null };
    }
  } catch {}
  return null;
}

/** A job's stage + percent from its progress.json ({at, stage}, written by phases.mjs before each tool) and the contract's stage list. */
export function jobProgress(dir, type, contract, read = (f) => readFileSync(f, 'utf8')) {
  let p;
  try { p = JSON.parse(read(join(dir, 'progress.json'))); } catch { return { stage: null, pct: null, stage_at: null }; }
  const stages = contract?.types?.[type]?.stages || [], s = String(p.stage || '');
  if (s === 'complete') return { stage: s, pct: 100, stage_at: p.at || null };
  const i = stages.findIndex((x) => x === s || x.split(':')[0] === s || x.split(':')[1] === s);
  return { stage: s || null, pct: i >= 0 && stages.length ? Math.round((i / stages.length) * 100) : null, stage_at: p.at || null };
}

/** The snapshot. Pure: every reading is passed in. */
export function snapshot(x) {
  return {
    schema: HEALTH_SCHEMA, at: x.now, host: x.host, role: x.role,
    image: x.image || null, agent: { version: x.version, pid: x.pid, started_at: x.startedAt, uptime_s: Math.round((x.now - x.startedAt) / 1000), stopping: !!x.stopping, queue: x.queue },
    cpu: { pct: x.cpu == null ? null : Math.round(x.cpu * 100), cores: r1(x.cores), scope: x.cpuScope },
    ram: { used_gb: r1(x.ramTotalGb - x.ramAvailGb), total_gb: r1(x.ramTotalGb), avail_gb: r1(x.ramAvailGb), pressure: x.pressure ?? null },
    gpu: x.gpu || null,
    disk: { free_gb: r1(x.diskFreeGb), total_gb: r1(x.diskTotalGb), path: x.diskPath },
    slots: x.slots,
    jobs: x.jobs,
    profiles: x.profiles,
    last_error: x.lastError || null,
  };
}

/** A snapshot in one small record (the ring here, the coordinator's history: ~300 B): numbers only, jobs as [id, type, stage, pct]. Pure. */
export function compact(s) {
  if (!s) return null;
  const img = String(s.image || ''), d = /sha256:([0-9a-f]{12})/.exec(img)?.[1];
  return {
    at: s.at, host: s.host, cpu: s.cpu?.pct ?? null, ram: [s.ram?.used_gb ?? null, s.ram?.total_gb ?? null],
    gpu: s.gpu ? [s.gpu.util ?? null, s.gpu.vram_used_mb ?? null, s.gpu.vram_total_mb ?? null, s.gpu.power_w ?? null] : null,
    disk: s.disk?.free_gb ?? null,
    slots: Object.fromEntries(Object.entries(s.slots || {}).map(([t, v]) => [t, [v.used, v.allowed]])),
    jobs: (s.jobs || []).map((j) => [j.id, j.type, j.stage || j.phase || null, j.pct ?? null]),
    img: d || (img ? img.slice(-24) : null), ver: s.agent?.version ?? null, err: s.last_error ? String(s.last_error.msg || '').slice(0, 160) : null,
  };
}

const keyOk =(got, want) => { if (!want || typeof got !== 'string') return false; const a = Buffer.from(got), b = Buffer.from(want); return a.length === b.length && timingSafeEqual(a, b); };
/** GET /health with x-queue-key = key → the snapshot; anything else 401/404. Returns the server (listen errors are logged, never fatal). */
export function serveHealth({ port, key, get, onError = () => {} }) {
  const srv = createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET' || req.url.split('?')[0] !== '/health') return send(404, { error: 'not found' });
    if (!keyOk(req.headers['x-queue-key'], key)) return send(401, { error: 'unauthorized' });
    try { send(200, get()); } catch (e) { send(500, { error: String(e.message).slice(0, 300) }); }
  });
  srv.on('error', onError);
  srv.listen(port, '0.0.0.0');
  return srv;
}

/** The ring: the last RING_N snapshots, oldest first (one JSON per line). Rewritten whole each time — it is small. */
export function ringPush(ring, snap, n = RING_N) { const r = [...ring, snap]; return r.length > n ? r.slice(-n) : r; }
export function ringSave(file, ring) { try { writeFileSync(`${file}.tmp`, ring.map((s) => JSON.stringify(s)).join('\n') + '\n'); renameSync(`${file}.tmp`, file); } catch {} }
export function ringLoad(file) { try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }

/** The agent's last words: why it exits, its last snapshots and log lines — capped at LAST_WORDS.maxBytes (snapshots dropped first). Pure. */
export function lastWords({ host, reason, now, ring, lines }) {
  const w = { host, at: now, reason: String(reason || '').slice(0, 500), snapshots: ring.slice(-LAST_WORDS.snapshots), log: lines.slice(-LAST_WORDS.lines).map((l) => String(l).slice(0, 600)) };
  while (JSON.stringify(w).length > LAST_WORDS.maxBytes && (w.snapshots.length || w.log.length)) { if (w.snapshots.length) w.snapshots.shift(); else w.log.shift(); }
  return w;
}
