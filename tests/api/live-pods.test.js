// One live pod source (Chad 11-14): RunPod's list drives /media cards, pod-plan and the system-checks pod alert; a frozen state file never does.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { livePods, livePodsView, resetLivePods } from '../../api/lib/media/live-pods.js';
import { workerCards } from '../../api/lib/media/worker-cards.js';
import { podChecks } from '../../scripts/lib/pod-checks.mjs';

const now = 1_800_000_000_000, file = () => join(mkdtempSync(join(tmpdir(), 'lp-')), 'live-pods.json');
const json = (b, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(b), json: async () => b });
const frozen = { updated: now - 6 * 86400_000, pods: { a: { id: 'x1', name: 'sifter-unipase-525', status: 'ready', costPerHr: 0.5, created: now - 7 * 86400_000, idle_since: now - 6 * 86400_000 } } };
const asGpu = (v, st) => ({ running: true, lane_updated_s: v.lane_age_s, pods_source: v.source, lane_fresh: v.lane_fresh, pods_unknown_since: v.unknown_since, pods: v.pods.map(({ worker, gauge, entry, ...p }) => p), spent_usd: 1, cap_usd: 60 });
// REST answers `rest`, GraphQL answers `gql` (an Error → fetch rejects)
const fake = ({ rest, gql }) => async (url) => {
  const r = url.includes('rest.runpod.io') ? rest : gql;
  if (r instanceof Error) throw r;
  return r;
};
const pod = { id: 'x2', name: 'sifter-unipase-600', desiredStatus: 'RUNNING', costPerHr: 0.69, gpu: { displayName: 'NVIDIA GeForce RTX 4090' }, lastStartedAt: new Date(now - 30 * 60_000).toISOString() };
const ask = (o) => (resetLivePods(), livePods({ fetchFn: fake(o), now: () => now, file: file(), apiKey: 'k' }));
const bad = (g) => podChecks(g).filter((c) => !c.ok);

beforeEach(resetLivePods);
describe('live pods', () => {
  it('frozen state with a ready pod + RunPod [] → page cards, pod-plan view and podChecks all show 0 pods, no CRITICAL', async () => {
    const v = livePodsView(await ask({ rest: json([]) }), frozen, now);
    expect(v.source).toBe('runpod'); expect(v.pods).toEqual([]);
    expect(workerCards(frozen, now, { view: v }).map((c) => c.key)).toEqual(['tower', 'boss', 'aorus']);
    expect(workerCards(frozen, now, { view: v, paused: 'media paused' }).some((c) => c.name === 'Podpanda')).toBe(false);
    const checks = podChecks({ ...asGpu(v), queue: 0 });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.find((c) => c.name === 'GPU pods without a lane').detail).toMatch(/media service stopped, pod state unknown → checked RunPod: 0 pods/);
  });
  it('REST 429 falls back to GraphQL; only sifter-unipase-* RUNNING pods count', async () => {
    const gql = json({ data: { myself: { pods: [pod, { ...pod, id: 'o', name: 'other' }, { ...pod, id: 'e', desiredStatus: 'EXITED' }] } } });
    const l = await ask({ rest: json({}, 429), gql });
    expect(l.state).toBe('ok'); expect(l.pods.map((p) => p.id)).toEqual(['x2']);
  });
  it('RunPod pod, stale lane → lease unknown, CRITICAL with the "media service stopped" wording', async () => {
    const v = livePodsView(await ask({ rest: json([pod]) }), frozen, now);
    expect(v.pods[0]).toMatchObject({ name: 'sifter-unipase-600', cost_per_hr: 0.69, lease: null, idle_min: null });
    expect(workerCards(frozen, now, { view: v }).at(-1)).toMatchObject({ key: 'sifter-unipase-600', status: 'unknown' });
    const b = bad(asGpu(v));
    expect(b.map((c) => c.name)).toEqual(['GPU pods without a lane']);
    expect(b[0].detail).toBe('media service stopped, pod state unknown → checked RunPod: 1 pod(s) (sifter-unipase-600) billing');
  });
  it('RunPod pod, fresh lane, no lease → idle with its $/h (CRITICAL GPU pods idle)', async () => {
    const st = { updated: now - 5000, pods: {} };
    const v = livePodsView(await ask({ rest: json([pod]) }), st, now);
    expect(v.pods[0]).toMatchObject({ lease: 0, idle_min: 30, cost_per_hr: 0.69 });
    expect(workerCards(st, now, { view: v }).at(-1).status).toBe('starting')   // RunPod says RUNNING; only the lane's ledger can say 'ready';
    const b = bad(asGpu(v));
    expect(b.map((c) => c.name)).toEqual(['GPU pods idle']);
    expect(b[0].detail).toMatch(/idle 30 min \(\$0\.69\/h\)/);
  });
  it('RunPod unreachable (REST + GraphQL fail) → unknown since the last success, a warning not a CRITICAL, never the old list', async () => {
    const f = file();
    resetLivePods(); await livePods({ fetchFn: fake({ rest: json([pod]) }), now: () => now - 3600_000, file: f, apiKey: 'k' });
    resetLivePods();
    const l = await livePods({ fetchFn: fake({ rest: json({}, 429), gql: new Error('boom') }), now: () => now, file: f, apiKey: 'k' });
    expect(l).toMatchObject({ state: 'unknown', unknown_since: now - 3600_000, pods: [] });
    const v = livePodsView(l, frozen, now);
    expect(v.source).toBe('unknown');
    expect(workerCards(frozen, now, { view: v }).at(-1).status).toMatch(/^pod state unknown since \d\d:\d\dZ$/);
    const b = podChecks(asGpu(v));
    expect(b.filter((c) => !c.ok)).toEqual([expect.objectContaining({ level: 'warn', detail: expect.stringMatching(/pod state unknown since .*Z/) })]);
  });
  it('one memoised answer: a second reader inside the window does not call RunPod again', async () => {
    let n = 0;
    const fetchFn = async () => { n++; return json([pod]); };
    resetLivePods(); const o = { fetchFn, now: () => now, file: file(), apiKey: 'k' };
    await Promise.all([livePods(o), livePods(o)]); await livePods(o);
    expect(n).toBe(1);
  });
});

describe('podSnapshot (spend-watch)', () => {
  it('returns state, $/h total and pods; unknown → usd_per_hr null', async () => {
    const { podSnapshot } = await import('../../api/lib/media/live-pods.js');
    resetLivePods();
    const s = await podSnapshot({ fetchFn: fake({ rest: json([pod]) }), now: () => now, file: file(), apiKey: 'k' });
    expect(s).toMatchObject({ state: 'ok', usd_per_hr: 0.69, pods: [{ name: 'sifter-unipase-600', cost_per_hr: 0.69 }] });
    resetLivePods();
    const u = await podSnapshot({ fetchFn: fake({ rest: new Error('x'), gql: new Error('y') }), now: () => now, file: file(), apiKey: 'k' });
    expect(u).toMatchObject({ state: 'unknown', usd_per_hr: null, pods: [] });
  });
});
