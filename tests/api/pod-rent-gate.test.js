// Pods are rented only for work they can claim (11-03): LAN-only gpu hours are not pod work; no rent when the edge has nothing claimable.
import { describe, it, expect } from 'vitest';
import * as Q from '../../worker/queue/core.js';
import { gpuMovable } from '../../api/lib/media/queue-feed.js';

const lan = (gpuH) => ({ by_type: { gpu: { queued_audio_h: gpuH, home_rate: 2, throughput: 2 }, 'cpu-prep': { queued_audio_h: 0, rate: 6, throughput: 40 }, 'cpu-finish': { queued_audio_h: 1, rate: 1, throughput: 40 } } });
const edge = (h, n) => ({ by_type: { gpu: { queued_audio_h: h, queued: n, pod_throughput: 4 }, 'cpu-prep': {}, 'cpu-finish': {} } });

describe('podPlan: pod work = what a pod can claim', () => {
  it('255 audio-h of LAN-only gpu work (the 11-02 WAV chains) is not pod work: no pods wanted for it', () => {
    const old = Q.podPlan([lan(255), edge(0, 0)]), fixed = Q.podPlan([lan(255), edge(0, 0)], { lanOnlyH: 255 });
    expect(old.target).toBeGreaterThan(0);   // what the plan did overnight: pods for hours they could not take
    expect(fixed).toMatchObject({ gpu_queued_h: 0, gpu_queued_all_h: 255, lan_only_h: 255, target: 0, pods: 0 });
  });
  it('movable hours still count; LAN-only is clamped to what is queued', () => {
    const p = Q.podPlan([lan(100), edge(8, 5)], { lanOnlyH: 60 });
    expect(p).toMatchObject({ gpu_queued_h: 48, lan_only_h: 60, staged_h: 8, staged_n: 5 });
    expect(Q.podPlan([lan(10), edge(0, 0)], { lanOnlyH: 99 }).lan_only_h).toBe(10);
  });
  it('the home GPU buffer still sees the LAN-only hours (Aorus takes them)', () => {
    const p = Q.podPlan([lan(255), edge(0, 0)], { lanOnlyH: 255 });
    expect(Q.bufferPolicy(p, { pods: 0, rent: false })).toMatchObject({ where: 'lan', buffer_h: 255 });
  });
});

describe('rentGate', () => {
  const plan = (staged_n, extra = {}) => ({ staged_n, lan_only_h: 0, ...extra });
  it('no rent when the edge has 0 claimable and nothing is movable (a pod that ended idle is not replaced)', () => {
    const g = Q.rentGate(plan(0, { lan_only_h: 255 }), { pods: [], movableH: 0, moving: false });
    expect(g.ok).toBe(false); expect(g.reason).toMatch(/nothing for a new pod to claim.*255 h LAN-only/);
  });
  it('no rent while live pods have open slots for everything queued', () => {
    expect(Q.rentGate(plan(2), { pods: [{ ready: true, leased: 0 }, { ready: false, leased: 0 }] }).ok).toBe(false);
    expect(Q.rentGate(plan(6), { pods: [{ leased: 3 }, { leased: 3 }] }).ok).toBe(true);   // both pods full (slots measured = 3 each), 6 queued behind them
  });
  it('rent when claimable work exceeds the live pods\' slots; the first pod when the edge holds work', () => {
    expect(Q.rentGate(plan(3), { pods: [{ leased: 1 }, { leased: 1 }] })).toMatchObject({ ok: true, claimable: 3, headroom: 0 });
    expect(Q.rentGate(plan(1), { pods: [] }).ok).toBe(true);
  });
  it('movable LAN work counts only while the move pass is delivering', () => {
    expect(Q.rentGate(plan(0), { pods: [], movableH: 5, moving: false }).ok).toBe(false);
    expect(Q.rentGate(plan(0), { pods: [], movableH: 5, moving: true })).toMatchObject({ ok: true, reason: expect.stringMatching(/move pass is delivering/) });
  });
});

describe('gpuMovable', () => {
  it('splits waiting LAN gpu steps: movable (prep files, Opus input) vs LAN-only (decoded input, no prep); leased and edge steps excluded', () => {
    const st = { chains: { 1: { input: 'in.opus', 'cpu-prep': {} }, 2: { input: 'in.wav', 'cpu-prep': {} }, 3: { input: 'in.opus' }, 4: { input: 'in.opus', 'cpu-prep': {} }, 5: { input: 'in.opus', 'cpu-prep': {} } },
      qjobs: { g1: { kind: 'typed', type: 'gpu', itemId: 1, audio_s: 3600 }, g2: { kind: 'typed', type: 'gpu', itemId: 2, audio_s: 7200 }, g3: { kind: 'typed', type: 'gpu', itemId: 3, audio_s: 1800 },
        g4: { kind: 'typed', type: 'gpu', itemId: 4, audio_s: 3600 }, g5: { kind: 'typed', type: 'gpu', itemId: 5, audio_s: 3600, where: 'edge' }, p1: { kind: 'typed', type: 'cpu-prep', itemId: 1, audio_s: 3600 } } };
    expect(gpuMovable(st, new Set(['g4']))).toEqual({ movable_h: 1, movable_n: 1, lan_only_h: 2.5, lan_only_n: 2 });
  });
});
