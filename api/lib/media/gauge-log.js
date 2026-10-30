// Load history per host (Chad 10-30: "I hope you are logging these so that we can look back and analyze the pattern"). The cloud lane
// appends one row per host per tick to data/run/gauges/YYYY-MM-DD.jsonl: CPU %, GPU % (power), VRAM, jobs by stage. Days > KEEP_DAYS pruned.
// Read back with `ops.mjs media gauges [--host x] [--hours n]` (GET /ops/media/gauges). Rows pure; file I/O injected-dir.
import { appendFile, mkdir, readdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { podName } from './worker-cards.js';

export const KEEP_DAYS = 14;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const stagesOf = (jobs = []) => jobs.reduce((a, j) => { const s = j.stage || '?'; a[s] = (a[s] || 0) + 1; return a; }, {});

/** One row per live host from the lane state: ready pods (their worker heartbeat) + home hosts (the gate's reading). Pure. */
export function gaugeRows(st = {}, now = Date.now(), fresh = 5 * 60_000) {
  const rows = [];
  for (const p of Object.values(st.pods || {})) {
    if (p.terminated || p.status !== 'ready' || !p.gauge || now - p.gauge.at > fresh) continue;
    const w = p.worker || {};
    rows.push({ t: now, host: podName(p.name), id: p.name, kind: 'pod', cpu: p.gauge.cpu ?? null, gpu: p.gauge.gpu ?? null,
      gpu_util: w.gpu_util ?? null, vram_gb: w.vram_used_gb ?? null, running: w.running ?? null, cpu_jobs: w.cpu_jobs ?? null,
      waiting: w.ready_jobs ?? null, load: w.load != null ? Math.round(w.load * 10) / 10 : null, stages: stagesOf(w.jobs), boot_v: p.boot_v || null });
  }
  const homeJobs = Object.keys(st.home || {});
  for (const [h, g] of Object.entries(st.host_gauge || {})) {
    if (!g?.at || now - g.at > fresh) continue;
    if (h === 'tower') { rows.push({ t: now, host: 'tower', kind: 'tower', cpus: g.cpus || null }); continue; }
    rows.push({ t: now, host: h, kind: 'home', cpu: g.cpu ?? null, gpu: g.gpu ?? null, running: homeJobs.filter((k) => k === h || k.startsWith(h + ':')).length });
  }
  return rows;
}

export async function appendGauges(rows, dir, now = Date.now(), keepDays = KEEP_DAYS) {
  if (!rows.length) return;
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, `${day(now)}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const cut = day(now - keepDays * 86_400_000);
  for (const f of await readdir(dir)) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < cut) await unlink(join(dir, f)).catch(() => {});
}

/** Rows since `sinceMs`, optionally one host (display name or pod id, case-blind). */
export async function readGaugeLog(dir, { sinceMs, host = '', now = Date.now() } = {}) {
  const want = String(host).toLowerCase(), out = [];
  for (let t = sinceMs - 86_400_000; day(t) <= day(now); t += 86_400_000) {
    const text = await readFile(join(dir, `${day(t)}.jsonl`), 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      if (!line) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (r.t >= sinceMs && (!want || r.host.toLowerCase() === want || r.id === want)) out.push(r);
    }
  }
  return out;
}

/** Per host: samples, mean CPU / GPU, share of samples with work running but GPU < 15 %, and which stages held those low samples. Pure. */
export function summarizeGauges(rows) {
  const by = {};
  for (const r of rows) {
    if (r.kind === 'tower') continue;
    const h = by[r.host] ||= { host: r.host, id: r.id || null, kind: r.kind, samples: 0, cpu: [], gpu: [], busy: 0, starved: 0, starved_stages: {}, first: r.t, last: r.t };
    h.samples++; h.last = r.t;
    if (r.cpu != null) h.cpu.push(r.cpu);
    if (r.gpu != null) h.gpu.push(r.gpu);
    if (r.running > 0) {
      h.busy++;
      if (r.gpu != null && r.gpu < 15) { h.starved++; for (const [s, n] of Object.entries(r.stages || {})) h.starved_stages[s] = (h.starved_stages[s] || 0) + n; }
    }
  }
  const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return Object.values(by).map(({ cpu, gpu, ...h }) => ({ ...h, cpu_avg: mean(cpu), gpu_avg: mean(gpu), gpu_starved_pct: h.busy ? Math.round((h.starved / h.busy) * 100) : null }));
}
