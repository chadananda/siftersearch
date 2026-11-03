// Tower polls every machine's GET /health (scripts/media/worker/health.mjs; Chad 10-31: "a single API request that is the same for every machine
// and the coordinator polls it periodically"). Targets: tower-finish (127.0.0.1), home hosts (config/media-hosts.json address + health_port), agent
// pods created with the port (RunPod proxy https://<podId>-<port>.proxy.runpod.net). Latest per machine → st.machine_health (a failed poll keeps the
// last good snapshot and says since when it is unreachable). Every poll → one compact row in data/run/health/YYYY-MM-DD.jsonl (Chad 10-31: "log the
// health polls so we can reconstruct what went wrong"); agents' last words (from both queues) land in the same files. Size, up front: ~12 machines ×
// 1440 polls × ~350 B ≈ 6 MB/day raw; days before today are gzipped (~10×), KEEP_DAYS kept → ≈ 15 MB on disk. Read back: readHistory / ops.mjs
// media health-history. Pure except the History writer + readHistory (dir injected) and pollOne (fetch injected).
import { appendFile, mkdir, readdir, readFile, unlink, writeFile, rename } from 'fs/promises';
import { gzip as gzipCb, gunzip as gunzipCb } from 'zlib';
import { promisify } from 'util';
import { join } from 'path';
import { laneLog } from './lane-log.js';
import { compact } from '../../../scripts/media/worker/health.mjs';

const gzip = promisify(gzipCb), gunzip = promisify(gunzipCb);
export const HEALTH_PORT = 8788;     // = queue-agent.mjs's default --health-port
export const POLL_MS = 60_000;       // one poll per machine a minute (the agents' own ring ticks at the same pace)
export const TIMEOUT_MS = 10_000;    // a poll slower than this counts as failed (the RunPod proxy adds ~1 s)
export const KEEP_DAYS = 14;
export const CARD_POLLS = 10;        // the last N polls carried on each /media card
const day = (t) => new Date(t).toISOString().slice(0, 10);

/** Who to poll: [{ machine, url, key, pod? }]. hosts = config/media-hosts.json hosts (those with an address); pods = st.pods (live, created with the
 *  health port). towerKey = tower-finish's MEDIA_QUEUE_KEY (|| INTERNAL_API_KEY); machineKey = the LAN/edge machine key the other agents carry. Pure. */
export function targets({ hosts = [], pods = {}, towerKey, machineKey, tower = true }) {
  const out = [];
  if (tower && towerKey) out.push({ machine: 'tower', url: `http://127.0.0.1:${HEALTH_PORT}/health`, key: towerKey });
  if (machineKey) {
    for (const h of hosts) if (h.address) out.push({ machine: h.name, url: `http://${h.address}:${h.health_port || HEALTH_PORT}/health`, key: machineKey });
    for (const p of Object.values(pods)) if (!p.terminated && p.id && p.health_port && p.status !== 'booting') out.push({ machine: p.name, pod: p.id, url: `https://${p.id}-${p.health_port}.proxy.runpod.net/health`, key: machineKey });
  }
  return out;
}

/** One poll → { machine, pod?, at, ok, latency_ms, data | error }. Never throws. */
export async function pollOne(t, { fetchFn = fetch, now = Date.now, timeoutMs = TIMEOUT_MS } = {}) {
  const t0 = now(), base = { machine: t.machine, ...(t.pod ? { pod: t.pod } : {}), at: t0 };
  try {
    const r = await fetchFn(t.url, { headers: { 'x-queue-key': t.key }, signal: AbortSignal.timeout(timeoutMs) });
    const latency_ms = now() - t0;
    if (!r.ok) return { ...base, ok: false, latency_ms, error: `HTTP ${r.status}` };
    const data = await r.json();
    if (!data || typeof data !== 'object' || data.schema == null) return { ...base, ok: false, latency_ms, error: 'not a /health snapshot' };
    return { ...base, ok: true, latency_ms, data };
  } catch (e) { return { ...base, ok: false, latency_ms: now() - t0, error: String(e?.cause?.code || e?.name === 'TimeoutError' && 'timeout' || e?.message || e).slice(0, 160) }; }
}

/** Fold one round of polls into st.machine_health. A failed poll keeps the last good data, its age and the first failure time. Machines no
 *  longer targeted (a closed pod) are dropped after a day. Returns the pods that just went from reachable to failing (→ reconcile with RunPod now). */
export function store(st, results, now = Date.now()) {
  const mh = (st.machine_health ||= {}), newlyDown = [];
  for (const r of results) {
    const prev = mh[r.machine] || {};
    const polls = [...(prev.polls || []), [r.at, r.ok ? 1 : 0, r.latency_ms, r.ok ? r.data?.cpu?.pct ?? null : null]].slice(-CARD_POLLS);
    if (r.ok) mh[r.machine] = { at: r.at, ok: true, latency_ms: r.latency_ms, ok_at: r.at, data: r.data, error: null, down_since: null, ...(r.pod ? { pod: r.pod } : {}), polls };
    else {
      if (r.pod && prev.ok) newlyDown.push(r.pod);
      mh[r.machine] = { ...prev, at: r.at, ok: false, latency_ms: r.latency_ms, error: r.error, down_since: prev.down_since || r.at, ...(r.pod ? { pod: r.pod } : {}), polls };
    }
  }
  const seen = new Set(results.map((r) => r.machine));
  for (const [k, v] of Object.entries(mh)) if (!seen.has(k) && now - (v.at || 0) > 86_400_000) delete mh[k];
  st.machine_health_at = now;
  return { newlyDown };
}

/** One history row for a poll: ts, machine, ok + latency (+ error), and the compact snapshot (cpu, ram, gpu, disk, slots, jobs, image, version). Pure. */
export function historyRow(r) {
  const c = r.ok ? compact(r.data) : null;
  return { t: r.at, m: r.machine, ok: r.ok ? 1 : 0, ms: r.latency_ms ?? null, ...(r.ok ? {} : { e: r.error }), ...(c ? { cpu: c.cpu, ram: c.ram, gpu: c.gpu, disk: c.disk, slots: c.slots, jobs: c.jobs, img: c.img, ver: c.ver, ...(c.err ? { err: c.err } : {}) } : {}) };
}
/** A last-words row (an agent's exit trail, from the queue's last-words-list). Pure. */
export const lastWordsRow = (w, source) => ({ t: w.at, m: String(w.host || '').replace(/^pod-/, ''), lw: 1, src: source, reason: w.words?.reason || null, words: w.words });

/** Batched append-only writer: rows buffer in memory and land in one append per flush; old days are gzipped and days past keepDays removed. */
export function History(dir, { keepDays = KEEP_DAYS, now = Date.now } = {}) {
  let buf = [], rotatedFor = null;
  return {
    push: (...rows) => { buf.push(...rows); },
    pending: () => buf.length,
    async flush() {
      const t = now();
      if (buf.length) {
        const rows = buf; buf = [];
        await mkdir(dir, { recursive: true });
        const byDay = {};
        for (const r of rows) (byDay[day(r.t || t)] ||= []).push(JSON.stringify(r));
        for (const [d, lines] of Object.entries(byDay)) await appendFile(join(dir, `${d}.jsonl`), lines.join('\n') + '\n');
      }
      if (rotatedFor !== day(t)) { await rotate(dir, t, keepDays); rotatedFor = day(t); }
    },
  };
}
/** Gzip every day before today (.jsonl → .jsonl.gz) and delete days older than keepDays. */
export async function rotate(dir, now = Date.now(), keepDays = KEEP_DAYS) {
  const today = day(now), cut = day(now - keepDays * 86_400_000);
  let files; try { files = await readdir(dir); } catch { return; }
  for (const f of files) {
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(f); if (!m) continue;
    if (m[1] < cut) { await unlink(join(dir, f)).catch(() => {}); continue; }
    if (!m[2] && m[1] < today) {
      const src = join(dir, f), gz = `${src}.gz`;
      const prior = await readFile(gz).then((b) => gunzip(b)).catch(() => Buffer.alloc(0));   // a late append after rotation joins the day's archive
      await writeFile(`${gz}.tmp`, await gzip(Buffer.concat([prior, await readFile(src)])));
      await rename(`${gz}.tmp`, gz); await unlink(src);
    }
  }
}
/** Rows for one machine (or all) between from and to (ms), oldest first, from plain and gzipped days. machine matches m or a pod id, case-blind. */
export async function readHistory(dir, { machine = '', from, to = Date.now(), limit = 5000 } = {}) {
  const want = String(machine).toLowerCase(), out = [];
  for (let t = from; day(t) <= day(to); t += 86_400_000) {
    for (const f of [`${day(t)}.jsonl.gz`, `${day(t)}.jsonl`]) {
      const buf = await readFile(join(dir, f)).catch(() => null); if (!buf) continue;
      const text = (f.endsWith('.gz') ? await gunzip(buf).catch(() => Buffer.alloc(0)) : buf).toString('utf8');
      for (const line of text.split('\n')) {
        if (!line) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r.t >= from && r.t <= to && (!want || String(r.m).toLowerCase() === want || r.pod === machine)) out.push(r);
      }
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out.length > limit ? out.slice(-limit) : out;
}

/** One round: poll every target in parallel, store, log; pull new last words from the queues (sinceKey per queue in st). → { newlyDown }. */
export async function tick(st, { targets: ts, history, fetchFn, now = Date.now, queues = {} }) {
  const results = await Promise.all(ts.map((t) => pollOne(t, { fetchFn, now })));
  const r = store(st, results, now());
  for (const x of results) history?.push(historyRow(x));
  const seen = (st.last_words_seen ||= {});
  for (const [name, q] of Object.entries(queues)) {
    try {
      const got = await q.call('last-words-list', { since: seen[name] || now() - 86_400_000, limit: 100 });
      for (const w of got || []) { history?.push(lastWordsRow(w, name)); laneLog('pod', { event: 'last_words', queue: name, host: w.host, reason: w.words?.reason || null, words: w.words }); seen[name] = Math.max(seen[name] || 0, w.at); }
    } catch (e) { st.last_words_error = `${name}: ${String(e.message).slice(0, 160)}`; }
  }
  await history?.flush().catch((e) => { st.health_log_error = String(e.message).slice(0, 160); });
  return r;
}
