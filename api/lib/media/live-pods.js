// The ONE source of "which GPU pods exist": RunPod's live list (REST, GraphQL when REST 429s/5xx/times out). /media, `ops.mjs media pods` and the
// system-checks pod alert all read livePodsView(), so they cannot disagree (Chad 11-14: a frozen state file drove an [ACTION] for a pod gone 6 days).
// The lane's state file only ENRICHES a pod RunPod reports (leases, idle), and only while the lane is fresh. Unreachable → state 'unknown' + since.
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fetchRetry } from './cloud.js';
import { LEDGER, POD_PREFIX } from './pod-ledger.js';

const MEMO_MS = 90_000, CALL_MS = 1500;
let memo = null, inflight = null, firstFail = null;
export const resetLivePods = () => { memo = null; inflight = null; firstFail = null; };

const norm = (p) => ({ id: p.id, name: p.name, status: p.desiredStatus || 'RUNNING', cost_per_hr: p.costPerHr ?? null,
  gpu: p.gpu?.displayName || p.machine?.gpuDisplayName || null, started: Date.parse(p.lastStartedAt || p.createdAt || '') || null });
const ours = (list) => list.filter((p) => String(p.name || '').startsWith(POD_PREFIX) && (p.desiredStatus || 'RUNNING') === 'RUNNING').map(norm);

async function ask({ fetchFn, apiKey }) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, opt = { fetchFn, tries: 1, timeoutMs: CALL_MS };
  try {
    const r = await fetchRetry('https://rest.runpod.io/v1/pods', { headers }, opt), t = await r.text();
    if (!r.ok) throw new Error(`REST ${r.status}`);
    return ours(JSON.parse(t));
  } catch {
    const r = await fetchRetry('https://api.runpod.io/graphql', { method: 'POST', headers, body: JSON.stringify({ query: 'query { myself { pods { id name desiredStatus costPerHr lastStartedAt machine { gpuDisplayName } } } }' }) }, opt);
    const j = await r.json();
    if (j.errors || !Array.isArray(j.data?.myself?.pods)) throw new Error(`GraphQL ${j.errors?.map((e) => e.message).join(';') || r.status}`);
    return ours(j.data.myself.pods);
  }
}

/** RunPod's answer now → { state:'ok', as_of, pods } | { state:'unknown', unknown_since, error, pods:[] }. Memoised; the last SUCCESS time persists in `file`. */
export async function livePods({ fetchFn = fetch, now = Date.now, memoMs = MEMO_MS, file = join(dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'data', 'run', 'live-pods.json'), apiKey = process.env.RUNPOD_API_KEY } = {}) {
  if (memo && now() - memo.at < memoMs) return memo.value;
  if (inflight) return inflight;
  inflight = (async () => {
    let value;
    try {
      const pods = await ask({ fetchFn, apiKey });
      value = { state: 'ok', as_of: now(), pods };
      firstFail = null;
      await mkdir(dirname(file), { recursive: true }).then(() => writeFile(file, JSON.stringify({ ok_at: value.as_of }))).catch(() => {});
    } catch (e) {
      firstFail ??= now();
      const ok_at = (await readFile(file, 'utf8').then(JSON.parse).catch(() => null))?.ok_at;
      value = { state: 'unknown', as_of: now(), unknown_since: ok_at || firstFail, error: String(e.message).slice(0, 120), pods: [] };
    }
    memo = { at: now(), value };
    return value;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Pure. RunPod's answer + the lane's state → what every reader shows. Lane fields attach only when the lane is fresh (≤ laneStaleMs). */
export function livePodsView(live, st = {}, now = Date.now()) {
  const upd = st.updated || 0, laneAge = upd ? now - upd : Infinity, fresh = laneAge <= LEDGER.laneStaleMs;
  const entries = Object.values(st.pods || {});
  const pods = live.pods.map((p) => {
    const e = fresh ? entries.find((x) => x.id === p.id && !x.terminated) : null;
    const lease = fresh ? Object.values(st.jobs || {}).filter((j) => j.pod === p.id).length + (st.q_last?.leased?.[`pod-${p.name}`] || 0) + (st.q_lan?.leased?.[`pod-${p.name}`] || 0) : null;
    const idle_min = !fresh ? null : e?.idle_since ? Math.round((now - e.idle_since) / 60_000) : lease === 0 && p.started ? Math.max(0, Math.round((now - p.started) / 60_000)) : 0;
    return { id: p.id, name: p.name, gpu: e?.gpu || p.gpu, cost_per_hr: p.cost_per_hr ?? e?.costPerHr ?? null, live: true, status: e?.status || p.status, lease, idle_min,
      created: e?.created || p.started, worker: e?.worker || null, gauge: e?.gauge || null, entry: e || null, as_of: live.as_of };
  });
  return { source: live.state === 'ok' ? 'runpod' : 'unknown', as_of: live.as_of, unknown_since: live.unknown_since ?? null, lane_age_s: Number.isFinite(laneAge) ? Math.round(laneAge / 1000) : null, lane_fresh: fresh, pods };
}
