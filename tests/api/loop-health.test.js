// The media lane's liveness + progress checks (api/lib/media/loop-health.js): judged by each section's own cadence and by work, injected clocks.
import { describe, it, expect } from 'vitest';
import * as LH from '../../api/lib/media/loop-health.js';

const M = 60_000;
// a section run every `every` ms, `dur` long, `n` times, ending at `end`
function cadence(st, name, { every, dur = 1000, n = 6, end }) {
  for (let i = n - 1; i >= 0; i--) { const t = end - i * every; LH.beatStart(st, name, t - dur); LH.beat(st, name, { n: 1 }, t); }
}

describe('sections: judged by their own cadence', () => {
  it('learning until enough intervals are measured, then ok, then stale after K missed passes', () => {
    const st = {};
    cadence(st, 'q_lan', { every: M, n: 2, end: 0 });
    expect(LH.sectionState(st.loop_beats.q_lan, 10 * M).state).toBe('learning');
    cadence(st, 'q_lan', { every: M, n: 5, end: 10 * M });
    expect(LH.sectionState(st.loop_beats.q_lan, 10 * M + 3 * M).state).toBe('ok');
    const s = LH.sectionState(st.loop_beats.q_lan, 10 * M + 5 * M);
    expect(s).toMatchObject({ state: 'stale', missed: 5, cadence_ms: M });
  });
  it('a slow section is not stale at a time that would be stale for a fast one', () => {
    const st = {};
    cadence(st, 'fast', { every: M, end: 0 }); cadence(st, 'slow', { every: 30 * M, end: 0 });
    expect(LH.sectionState(st.loop_beats.fast, 10 * M).state).toBe('stale');
    expect(LH.sectionState(st.loop_beats.slow, 10 * M).state).toBe('ok');
  });
  it('hung: running far past its own norm (the 10-31 stall: a pass sat 50 min in one phase)', () => {
    const st = {};
    cadence(st, 'q_pass', { every: 75_000, dur: 20_000, n: 6, end: 0 });
    LH.beatStart(st, 'q_pass', M);
    expect(LH.sectionState(st.loop_beats.q_pass, 3 * M).state).toBe('ok');   // a long pass, not yet K× its norm
    expect(LH.sectionState(st.loop_beats.q_pass, 50 * M)).toMatchObject({ state: 'hung' });
  });
  it('failing after K errors in a row; one ok clears it; a finished lane is ended, not stale', () => {
    const st = {};
    cadence(st, 'pod_plan', { every: M, end: 0 });
    for (let i = 1; i <= 4; i++) LH.beat(st, 'pod_plan', { ok: false, err: 'no capacity' }, i * M);
    expect(LH.sectionState(st.loop_beats.pod_plan, 4 * M)).toMatchObject({ state: 'failing', fails: 4, err: 'no capacity' });
    LH.beat(st, 'pod_plan', {}, 5 * M);
    expect(LH.sectionState(st.loop_beats.pod_plan, 5 * M).state).toBe('ok');
    expect(LH.sectionState(st.loop_beats.pod_plan, 99 * M, { ended: 6 * M }).state).toBe('ended');
  });
});

describe('self-heal backs off by its own failures', () => {
  it('heals at twice the hung bar, then doubles per heal without a good pass; a good pass resets', () => {
    const st = {};
    cadence(st, 'q_pass', { every: M, dur: 10_000, end: 0 });
    LH.beatStart(st, 'q_pass', 0);
    expect(LH.shouldHeal(st.loop_beats.q_pass, 7 * M)).toBe(false);
    expect(LH.shouldHeal(st.loop_beats.q_pass, 9 * M)).toBe(true);   // 2 × 4 × 1 min
    LH.noteHeal(st, 'q_pass', 9 * M, 'hung in lan');
    expect(st.loop_heals).toHaveLength(1);
    LH.beatStart(st, 'q_pass', 9 * M);
    expect(LH.shouldHeal(st.loop_beats.q_pass, 9 * M + 9 * M)).toBe(false);   // now 16 min
    expect(LH.shouldHeal(st.loop_beats.q_pass, 9 * M + 17 * M)).toBe(true);
    LH.beat(st, 'q_pass', {}, 30 * M);
    expect(st.loop_beats.q_pass.heals_in_row).toBe(0);
  });
  it('heals by progress, not age: a long pass that keeps stepping is never abandoned', () => {
    const st = {};
    cadence(st, 'q_pass', { every: M, dur: 10_000, end: 0 });
    LH.beatStart(st, 'q_pass', 0);
    expect(LH.shouldHeal(st.loop_beats.q_pass, 60 * M, { progressAt: 59 * M })).toBe(false);   // 60 min old, stepped a minute ago
    expect(LH.shouldHeal(st.loop_beats.q_pass, 60 * M, { progressAt: 50 * M })).toBe(true);    // silent for 10 min (bar is 8)
  });
  it('never heals without a measured norm', () => {
    const st = {}; LH.beatStart(st, 'q_pass', 0);
    expect(LH.shouldHeal(st.loop_beats.q_pass, 1e9)).toBe(false);
  });
  it('guarded: an abandoned pass can make no further queue call, and a call in flight resolves to an error', async () => {
    let alive = true;
    const q = { enqueue: async (x) => x, sync: () => 7 };
    const g = LH.guarded(q, () => alive);
    expect(await g.enqueue(1)).toBe(1);
    expect(g.sync()).toBe(7);
    const p = g.enqueue(2); alive = false;
    await expect(p).rejects.toMatchObject({ code: 'ABANDONED' });
    expect(() => g.enqueue(3)).toThrow(/abandoned/);
  });
});

describe('step durations measured from the chains', () => {
  it('a step adopted in this pass is measured from the chain\'s previous mark; a typed talk finished through the queue too', () => {
    const st = { chains: { 5: { at: 0, 'cpu-prep': { adopted: 10 * M } }, 6: { at: 0, 'cpu-prep': { adopted: 5 * M }, gpu: { adopted: 20 * M } } }, done: [] };
    const marks = LH.chainMarks(st);
    expect(marks).toEqual({ 5: 10 * M, 6: 20 * M });
    st.chains[5].gpu = { adopted: 40 * M };
    delete st.chains[6]; st.done.push({ id: 6, at: 41 * M, via: 'queue', mode: 'typed' });
    expect(LH.recordSteps(st, marks, 39 * M, 41 * M)).toBe(2);
    expect(st.step_durs.sort()).toEqual([21 * M, 30 * M].sort());
    expect(st.progress_at).toBe(41 * M);
  });
});

describe('progress checks (work, not time)', () => {
  const base = (now) => {
    const st = { step_durs: [10 * M, 12 * M, 14 * M], done: [{ id: 1, at: now - 60 * M }], q_lan: { leased: { aorus: 2 } }, home: {}, jobs: {}, pods: {},
      host_gauge: { aorus: { gpu: 0, at: now }, boss: { gpu: 0, at: now }, tower: { cpus: [1, 1], at: now } }, pod_plan: { gpu_queued_h: 5, staged_h: 0, staged_n: 0, target: 0 } };
    cadence(st, 'tick', { every: 15_000, end: now });
    return st;
  };
  const tick = (st, t) => { LH.beat(st, 'tick', {}, t); return LH.evaluate(st, t, { update: true }); };
  const find = (h, name) => h.checks.find((c) => c.name === name);
  it('(a) work in flight but no step adopted for K× the median step: CRITICAL after STREAK ticks; a fresh step clears it', () => {
    const now = 100 * M, st = base(now);
    let h;
    for (let i = 1; i <= 3; i++) h = tick(st, now + i * 15_000);
    expect(find(h, 'Media progress')).toMatchObject({ ok: false, level: 'critical' });
    expect(find(h, 'Media progress').detail).toMatch(/STOPPED.*2 leases/);
    st.progress_at = now + 46_000;
    expect(find(tick(st, now + 60_000), 'Media progress').ok).toBe(true);
  });
  it('(a) nothing in flight is not a stall; no measured steps is learning', () => {
    const now = 100 * M, st = base(now); st.q_lan.leased = {};
    st.pod_plan.gpu_queued_h = 0;
    for (let i = 1; i <= 3; i++) tick(st, now + i * 15_000);
    expect(find(LH.evaluate(st, now + 45_000), 'Media progress').ok).toBe(true);
    st.step_durs = [];
    expect(find(LH.evaluate(st, now + 45_000), 'Media progress').detail).toMatch(/learning/);
  });
  it('(b) GPU work queued while every reporting GPU is idle; one busy GPU clears it; stale gauges are not "idle"', () => {
    const now = 100 * M, st = base(now);
    let h; for (let i = 1; i <= 3; i++) h = tick(st, now + i * 15_000);
    expect(find(h, 'Media GPUs idle with work queued')).toMatchObject({ ok: false, level: 'critical' });
    st.host_gauge.aorus.gpu = 80;
    expect(find(tick(st, now + 60_000), 'Media GPUs idle with work queued').ok).toBe(true);
    const old = base(now); for (const g of Object.values(old.host_gauge)) g.at = now - 60 * M;
    for (let i = 1; i <= 3; i++) h = tick(old, now + i * 15_000);
    expect(find(h, 'Media GPUs idle with work queued').ok).toBe(true);
  });
  it('(c) pods wanted with staged work and none rented: WARN — unless a refusal was recorded or rentals are held', () => {
    const now = 100 * M, st = base(now); st.pods_wanted = 2; st.pod_plan.staged_n = 3;
    let h; for (let i = 1; i <= 3; i++) h = tick(st, now + i * 15_000);
    expect(find(h, 'Media pods wanted, none rented')).toMatchObject({ ok: false, level: 'warn' });
    st.rental_refusals = [{ at: now, why: 'no capacity' }];
    expect(find(tick(st, now + 60_000), 'Media pods wanted, none rented').ok).toBe(true);
    const held = base(now); held.pods_wanted = 2; held.rental_pause = 'Chad: hold';
    for (let i = 1; i <= 3; i++) h = tick(held, now + i * 15_000);
    expect(find(h, 'Media pods wanted, none rented')).toMatchObject({ ok: true });
    expect(find(h, 'Media pods wanted, none rented').detail).toMatch(/rentals held/);
  });
  it('(b) a home host whose profile excludes gpu (Boss, CPU+LLM) is not a GPU: its 0 % never counts as idle or busy', () => {
    const now = 100 * M, st = base(now);
    const h = LH.evaluate(st, now);
    expect(h.facts.gpu_list.map((g) => g.name)).toEqual(['aorus']);
  });
  describe('(d) a rented pod idle while GPU work waits — CRITICAL, with the pod, its $/h and the cause', () => {
    const withPod = (now, { gpu = 2, staged = 0 } = {}) => {
      const st = base(now); st.host_gauge.aorus.gpu = 90;
      st.pods = { p1: { id: 'p1', name: 'sifter-unipase-377', status: 'ready', costPerHr: 0.89, gauge: { gpu, at: now } } };
      st.pod_plan.staged_n = staged; st.q_last = { leased: {}, beat: {} };
      return st;
    };
    const idle = (st, now) => { let h; for (let i = 1; i <= 3; i++) { st.pods.p1.gauge.at = now + i * 15_000; h = tick(st, now + i * 15_000); } return find(h, 'Media rented pod idle'); };
    it('nothing staged', () => {
      const now = 100 * M, st = withPod(now);
      const c = idle(st, now);
      expect(c).toMatchObject({ ok: false, level: 'critical' });
      expect(c.detail).toMatch(/sifter-unipase-377 \$0\.89\/h at 2% GPU for 3 ticks · nothing staged/);
      expect(find(LH.evaluate(st, now + 45_000), 'Media GPUs idle with work queued').ok).toBe(true);   // aorus is busy: (b) alone missed this
    });
    it('agent not claiming: work staged, the pod holds none', () => {
      const now = 100 * M, st = withPod(now, { staged: 4 });
      st.q_last.beat['pod-sifter-unipase-377'] = now - 12 * M;
      expect(idle(st, now).detail).toMatch(/agent not claiming — 4 staged on R2, it holds none \(agent beat 1[23] min ago\)/);
    });
    it('claiming but stuck: the pod holds a lease and its GPU stays idle', () => {
      const now = 100 * M, st = withPod(now, { staged: 4 });
      st.q_last.leased['pod-sifter-unipase-377'] = 1;
      expect(idle(st, now).detail).toMatch(/claiming but stuck — holds 1 lease/);
    });
    it('busy pod, too few ticks, or no GPU work queued: ok; a gone pod drops its streak', () => {
      const now = 100 * M;
      expect(idle(withPod(now, { gpu: 70 }), now).ok).toBe(true);
      const st = withPod(now); st.pods.p1.gauge.at = now + 15_000;
      expect(find(tick(st, now + 15_000), 'Media rented pod idle').ok).toBe(true);
      const none = withPod(now); none.pod_plan.gpu_queued_h = 0;
      expect(idle(none, now).ok).toBe(true);
      const gone = withPod(now); idle(gone, now); gone.pods.p1.terminated = now + 50_000;
      tick(gone, now + 60_000);
      expect(Object.keys(gone.health_cond).some((k) => k.startsWith('pod_idle:'))).toBe(false);
    });
  });
  it('a stale work section is CRITICAL with its evidence; other callers never advance a streak', () => {
    const now = 100 * M, st = base(now);
    cadence(st, 'q_lan', { every: M, end: now - 50 * M });
    const h = LH.evaluate(st, now);
    expect(find(h, 'Media loop: q_lan')).toMatchObject({ ok: false, level: 'critical' });
    expect(find(h, 'Media loop: q_lan').detail).toMatch(/last ran 50 min ago, normally every 1 min/);
    for (let i = 0; i < 5; i++) LH.evaluate(st, now + i);
    expect(st.health_cond?.no_progress).toBeUndefined();
  });
});

describe('the pipeline END: talks adopted, judged by evidence', () => {
  const end = (h) => h.checks.find((c) => c.name === 'Media pipeline end (talks adopted)');
  const T0 = 1_800_000_000_000;
  // 10-31: prep and gpu flow (step_log, progress_at fresh), every cpu-finish refused, nothing adopted
  const today = () => ({
    done: [{ id: 1, mode: 'whole', at: T0 }], progress_at: T0 + 60 * M,
    step_log: [...Array.from({ length: 6 }, (_, i) => ({ type: 'cpu-prep', host: 'boss', at: T0 + (i + 1) * M })), ...Array.from({ length: 5 }, (_, i) => ({ type: 'gpu', host: 'pod-379', at: T0 + (i + 10) * M }))],
    qjobs: { 'cpu-finish-1951-a': { type: 'cpu-finish', itemId: 1951 }, 'cpu-prep-2650-b': { type: 'cpu-prep', itemId: 2650 } },
    pull_errors: ['1981', '1948', '1934'].map((id, i) => ({ at: T0 + (20 + i) * M, job: `cpu-finish-${id}-2ef0bd10f06e`, error: 'typed cpu-finish from boss: cpu-finish result refused: missing enhanced/pod/post.json' })),
  });
  it('every finish refused while prep and gpu flow → CRITICAL, naming the refusal and the dropped gpu work', () => {
    const c = end(LH.evaluate(today(), T0 + 61 * M));
    expect(c).toMatchObject({ ok: false, level: 'critical' });
    expect(c.detail).toMatch(/5 gpu steps done, 1 finishes waiting, 3 finish results refused\/failed, 4 gpu results dropped/);
    expect(c.detail).toMatch(/missing enhanced\/pod\/post\.json/);
  });
  it('one finish refused with nothing dropped is a talk, not the pipeline; an adoption after the refusals clears it', () => {
    const one = { ...today(), step_log: [{ type: 'gpu', at: T0 + 10 * M }], pull_errors: today().pull_errors.slice(0, 1), qjobs: { 'cpu-finish-1951-a': { type: 'cpu-finish' } } };
    expect(end(LH.evaluate(one, T0 + 61 * M)).ok).toBe(true);
    const fixed = { ...today(), done: [...today().done, { id: 1951, mode: 'typed', at: T0 + 30 * M }] };
    expect(end(LH.evaluate(fixed, T0 + 61 * M))).toMatchObject({ ok: true });
  });
});

describe('podsProven: the typed pool grows past one pod only on evidence of talks', () => {
  it('no pure pod remaster adopted → one pod; a held (review) adoption is not proof; a pure one from a pod is', () => {
    expect(LH.podsProven({ done: [] }).ok).toBe(false);
    expect(LH.podsProven({ done: [{ mode: 'typed', remaster: 'review', swapped: 0, gpu: 'pod-379', at: 5 }] }).ok).toBe(false);
    expect(LH.podsProven({ done: [{ mode: 'typed', remaster: 'done', swapped: 0, gpu: 'aorus', at: 5 }] }).ok).toBe(false);
    expect(LH.podsProven({ done: [{ mode: 'typed', remaster: 'done', swapped: 0, gpu: 'pod-379', at: 5 }] }).ok).toBe(true);
  });
  it('podOutput: the pool ramps on talks out, not the plan (10-31: r_pod 7.7, plan 7 pods, 2 talks from 382 in ~50 min)', () => {
    const H = 3600e3, now = 10 * H, pod = (h) => `pod-sifter-unipase-${h}`;
    const st = { pods: { a: { name: 'sifter-unipase-382', ready_at: now - 0.8 * H } },
      done: [{ mode: 'typed', gpu: pod(382), remaster: 'review', audio_s: 4000, at: now - 0.5 * H }, { mode: 'typed', gpu: pod(382), remaster: 'done', swapped: 0, audio_s: 5400, at: now - 0.5 * H },
        { mode: 'typed', gpu: 'aorus', remaster: 'done', audio_s: 9e5, at: now - 0.1 * H }],
      qjobs: { f: { type: 'cpu-finish', itemId: 9 } }, chains: { 9: { gpu: { host: pod(382) } } } };
    st.qjobs.f.audio_s = 3600;
    const r = LH.podOutput(st, { now, horizonH: 2, rPod: 7.7 });
    // pod time counts from the pod's FIRST output (now − 0.5 h), not ready_at: the fill (~50 min of download+first step) is not a rate
    expect(r).toMatchObject({ ok: false, pod_h: 0.5, expect_h: 3.85, out_h: 2.61, pure_h: 1.5, wait_h: 1, talks: 2, published: 1 });   // home GPU talks never count
    expect(LH.podOutput(st, { now, horizonH: 2, rPod: 4 }).ok).toBe(true);   // 3.61 h out+waiting ≥ 0.5 × 4
    expect(LH.podOutput({ pods: {} }, { now, rPod: 7.7 }).ok).toBe(false);   // no pod time, no evidence
  });
  it('podOutput: a pod still filling (no gpu step out yet) adds no pod-hours (10-31: 387 filled ~50 min; the ramp held on it)', () => {
    const H = 3600e3, now = 10 * H;
    const st = { pods: { a: { name: 'sifter-unipase-382', ready_at: now - 1 * H }, b: { name: 'sifter-unipase-387', ready_at: now - 0.9 * H } },
      done: [{ mode: 'typed', gpu: 'pod-sifter-unipase-382', remaster: 'done', swapped: 0, audio_s: 7200, at: now - 0.5 * H }] };
    expect(LH.podOutput(st, { now, horizonH: 2, rPod: 4 }).pod_h).toBe(0.5);
    expect(LH.podOutput({ ...st, step_log: [{ type: 'gpu', host: 'pod-sifter-unipase-387', audio_s: 3600, at: now - 0.25 * H }] }, { now, horizonH: 2, rPod: 4 }).pod_h).toBe(0.75);
  });
  it('rampGrowth: one more pod only while talks/h rose since the last rental at this pool size', () => {
    const H = 3600e3, now = 10 * H, d = (n) => Array.from({ length: n }, () => ({ mode: 'typed', remaster: 'done', swapped: 0, at: now - H }));
    expect(LH.talksPerHour({ done: [...d(8), { mode: 'typed', remaster: 'review', at: now - H }] }, { now, horizonH: 2 })).toBe(4);
    expect(LH.rampGrowth({ done: d(8) }, { now, pods: 2 })).toMatchObject({ ok: true, talks_h: 4, ref_talks_h: null });
    expect(LH.rampGrowth({ done: d(8), ramp_log: [{ pods: 2, talks_h: 3 }] }, { now, pods: 2 })).toMatchObject({ ok: true, ref_talks_h: 3 });
    expect(LH.rampGrowth({ done: d(8), ramp_log: [{ pods: 2, talks_h: 4 }] }, { now, pods: 2 }).ok).toBe(false);   // flat → hold
    // a replacement at the same size is no baseline: the ref is the rental that first reached this size (10-31: 6.5, then replacements at 18, 22)
    const log = [{ pods: 1, talks_h: 1 }, { pods: 2, talks_h: 2 }, { pods: 2, talks_h: 5 }, { pods: 2, talks_h: 6 }];
    expect(LH.rampGrowth({ done: d(8), ramp_log: log }, { now, pods: 2 })).toMatchObject({ ok: true, ref_talks_h: 2 });
    // the pool shrank to 1 and regrew: the newest growth to 2 is the baseline
    expect(LH.rampGrowth({ done: d(8), ramp_log: [...log, { pods: 1, talks_h: 3 }, { pods: 2, talks_h: 4 }] }, { now, pods: 2 })).toMatchObject({ ok: false, ref_talks_h: 4 });
  });
  it('podRampCap: proven with no pod live → one pod, never zero (the old min(earned+1, live) stalled the pool at 0 forever)', () => {
    expect(LH.podRampCap({ proven: true, earned: 0, live: 0, rampOk: false })).toBe(1);
    expect(LH.podRampCap({ proven: false, earned: 5, live: 3, rampOk: true })).toBe(1);
    expect(LH.podRampCap({ proven: true, earned: 2, live: 2, rampOk: true })).toBe(3);
    expect(LH.podRampCap({ proven: true, earned: 2, live: 2, rampOk: false })).toBe(2);
    expect(LH.podRampCap({ proven: true, earned: 1, live: 3, rampOk: true })).toBe(2);
  });
  it('a pool size proven within the horizon is refilled at once: two earned pods lost together leave 389 alone no longer (10-31)', () => {
    const H = 3600e3, now = 10 * H, ok = (n) => ({ mode: 'typed', remaster: 'done', swapped: 0, gpu: `pod-sifter-unipase-${n}` });
    const st = { done: [ok(387), ok(388), ok(370)], pods: {
      a: { name: 'sifter-unipase-387', ready_at: now - 2.5 * H, terminated: now - 0.6 * H },
      b: { name: 'sifter-unipase-388', ready_at: now - 1.7 * H, terminated: now - 0.2 * H },
      c: { name: 'sifter-unipase-389', ready_at: now - 0.5 * H },                       // not earned yet
      d: { name: 'sifter-unipase-370', ready_at: now - 6 * H, terminated: now - 5 * H } } };   // outside the horizon
    expect(LH.provenPoolSize(st, { now, horizonH: 2 })).toBe(2);
    expect(LH.podRampCap({ proven: true, earned: 0, live: 1, rampOk: false, provenSize: 2 })).toBe(2);   // was 1: the replacement waited on 389
    expect(LH.podRampCap({ proven: true, earned: 2, live: 2, rampOk: false, provenSize: 2 })).toBe(2);   // growth past it still needs rampOk
    expect(LH.provenPoolSize({ ...st, pods: { a: st.pods.a, x: { name: 'sifter-unipase-388', ready_at: now - 0.5 * H } } }, { now, horizonH: 2 })).toBe(1);   // never together: one
  });
  it('podEarned: a pod counts only once a pure remaster from ITS gpu step is adopted (10-31: 383 rented 30 s after 382 was ready)', () => {
    const pod = { name: 'sifter-unipase-382' };
    expect(LH.podEarned({ done: [{ mode: 'typed', remaster: 'done', swapped: 0, gpu: 'pod-sifter-unipase-378' }] }, pod)).toBe(false);
    expect(LH.podEarned({ done: [{ mode: 'typed', remaster: 'review', swapped: 0, gpu: 'pod-sifter-unipase-382' }] }, pod)).toBe(false);
    expect(LH.podEarned({ done: [{ mode: 'typed', remaster: 'done', swapped: 2, gpu: 'pod-sifter-unipase-382' }] }, pod)).toBe(false);
    expect(LH.podEarned({ done: [{ mode: 'typed', remaster: 'done', swapped: 0, gpu: 'pod-sifter-unipase-382' }] }, pod)).toBe(true);
  });
  it('a dead pipeline end revokes the proof', () => {
    const st = { done: [{ mode: 'typed', remaster: 'done', swapped: 0, gpu: 'pod-379', at: 5 }], step_log: [{ type: 'gpu', at: 10 }], qjobs: {},
      pull_errors: [{ at: 11, job: 'cpu-finish-9-ab12', error: 'refused' }, { at: 12, job: 'cpu-finish-8-ab12', error: 'refused' }] };
    expect(LH.podsProven(st)).toMatchObject({ ok: false, why: expect.stringMatching(/pipeline end dead/) });
  });
});

describe('scale-mode home sentinel (Chad 11-01: Boss pegged with GPU work instead of CPU)', () => {
  const env = { MEDIA_POD_TYPED: '1' };
  const pick = (h, name) => h.checks.find((c) => c.name === name);
  const GPU = 'Media home host on GPU work in scale mode', IDLE = 'Media home CPU idle with CPU work queued';
  it('names the host, item and order of a home GPU/whole job in scale mode; small mode is quiet', () => {
    const st = { pod_plan: { mode: 'scale', buffer: { home_gpu: false } }, home: { boss: { itemId: 2459, since: 1 }, aorus: { itemId: 7, since: 1 } },
      items: { 2459: { mode: 'restore' }, 7: { mode: 'post' } } };
    const c = pick(LH.evaluate(st, 10, { env }), GPU);
    expect(c).toMatchObject({ ok: false, level: 'critical' });
    expect(c.detail).toMatch(/boss #2459 restore/);
    expect(c.detail).not.toMatch(/aorus/);
    st.items[2459] = { kind: 'whole' };
    expect(pick(LH.evaluate(st, 10, { env }), GPU).detail).toMatch(/boss #2459 whole/);
    expect(pick(LH.evaluate({ ...st, pod_plan: { mode: 'small', buffer: { home_gpu: true } } }, 10, { env }), GPU).ok).toBe(true);
    expect(pick(LH.evaluate(st, 10, { env: {} }), GPU).ok).toBe(true);   // pods not typed: no scale mode
  });
  it('flags home CPU hosts leasing no CPU work while cpu-prep/cpu-finish wait (after the streak), never pods', () => {
    const now = 1_000_000;
    const st = { loop_beats: { tick: { runs: 1 } }, lan_cap: { at: now, queued: { 'cpu-finish': { n: 40, audio_h: 119.9 }, 'cpu-prep': { n: 0, audio_h: 0 } },
      hosts: [{ host: 'boss', types: ['cpu-prep', 'cpu-finish'], leased: { gpu: 1 } }, { host: 'aorus', types: ['cpu-prep', 'cpu-finish', 'gpu'], leased: { 'cpu-finish': 2 } },
        { host: 'pod-sifter-cpu-x', types: ['cpu-finish'], leased: {} }] } };
    let c;
    for (let i = 1; i <= 3; i++) { st.loop_beats.tick.runs = i; c = pick(LH.evaluate(st, now, { update: true, env }), IDLE); }
    expect(c).toMatchObject({ ok: false, level: 'warn' });
    expect(c.detail).toMatch(/cpu-finish 40 queued \(119.9 audio-h\).*idle home CPU: boss for 3 ticks/);
    expect(c.detail).not.toMatch(/aorus|pod-sifter/);
    st.lan_cap.hosts[0].leased = { 'cpu-finish': 1 };
    expect(pick(LH.evaluate(st, now, { update: true, env }), IDLE).ok).toBe(true);
    expect(pick(LH.evaluate({ lan_cap: { ...st.lan_cap, at: now - 3_600_000 } }, now, { env }), IDLE)).toMatchObject({ ok: true, detail: expect.stringMatching(/no fresh/) });
  });
  it('flags a deep CPU queue a home host skips while it spends its slots on a shallower one (11-01: finish 12 h, prep 0.01 h), never pods', () => {
    const DEEP = 'Media deep CPU queue skipped by a capable host', now = 1_000_000;
    const st = { loop_beats: { tick: { runs: 1 } }, lan_cap: { at: now, queued: { 'cpu-finish': { n: 129, audio_h: 135.4, backlog_h: 12.15 }, 'cpu-prep': { n: 1, audio_h: 1.2, backlog_h: 0.01 } },
      hosts: [{ host: 'boss', types: ['cpu-prep', 'cpu-finish'], leased: { 'cpu-prep': 4 } }, { host: 'aorus', types: ['cpu-prep', 'cpu-finish', 'gpu'], leased: { 'cpu-prep': 4 } },
        { host: 'tower', types: ['cpu-finish'], leased: { 'cpu-finish': 2 } }, { host: 'pod-cpu-x', types: ['cpu-prep', 'cpu-finish'], leased: { 'cpu-prep': 1 } }] } };
    let c;
    for (let i = 1; i <= 3; i++) { st.loop_beats.tick.runs = i; c = pick(LH.evaluate(st, now, { update: true, env }), DEEP); }
    expect(c).toMatchObject({ ok: false, level: 'warn' });
    expect(c.detail).toMatch(/cpu-finish backlog 12.15 h \(129 queued.*cpu-finish skipped by boss \(holds 4 cpu-prep\), aorus \(holds 4 cpu-prep\) for 3 ticks/);
    expect(c.detail).not.toMatch(/tower|pod-cpu/);
    st.lan_cap.hosts[0].leased = { 'cpu-prep': 2, 'cpu-finish': 1 }; st.lan_cap.hosts[1].leased = { 'cpu-finish': 3 };
    expect(pick(LH.evaluate(st, now, { update: true, env }), DEEP).ok).toBe(true);
    // peers level (or the deep one is prep): no verdict against hosts on finish; a queue with no drain yet counts as deepest
    const lv = { ...st.lan_cap, queued: { 'cpu-finish': { n: 3, audio_h: 3, backlog_h: 0.5 }, 'cpu-prep': { n: 4, audio_h: 4, backlog_h: null } },
      hosts: [{ host: 'boss', types: ['cpu-prep', 'cpu-finish'], leased: { 'cpu-finish': 2 } }] };
    expect(pick(LH.evaluate({ loop_beats: { tick: { runs: 1 } }, lan_cap: lv }, now, { update: true, env, streakN: 1 }), DEEP)).toMatchObject({ ok: false, detail: expect.stringMatching(/cpu-prep backlog no drain.*cpu-prep skipped by boss/) });
  });
});
