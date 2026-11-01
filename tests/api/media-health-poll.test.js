// Tower's poll of every machine's GET /health (api/lib/media/health-poll.js) + the /media card view (worker-cards.js healthView):
// targets, one poll, the latest per machine (unreachable keeps the last good data + since when), the append-only history (batched, gzipped
// old days, KEEP_DAYS retention, read back across plain + gz days), last words from the queues, and the card mapping.
import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as HP from '../../api/lib/media/health-poll.js';
import { healthView, workerCards } from '../../api/lib/media/worker-cards.js';
import { snapshot } from '../../scripts/media/worker/health.mjs';

const T0 = Date.parse('2026-10-31T12:00:00Z');
const snap = (o = {}) => snapshot({ now: T0, host: 'boss', role: 'home', image: 'ghcr.io/x/w@sha256:abcdef0123456789aa', version: 'v1', pid: 1, startedAt: T0 - 60_000,
  queue: 'lan', cpu: 0.42, cores: 32, cpuScope: 'host', ramTotalGb: 128, ramAvailGb: 100, gpu: { device: 'rocm', util: 80, power_w: 60, power_limit_w: 120, vram_used_mb: 2048, vram_total_mb: 4096 },
  diskFreeGb: 500, diskTotalGb: 1000, diskPath: '/data', slots: { 'cpu-prep': { used: 2, allowed: 5 } }, jobs: [{ id: 'j1', type: 'cpu-prep', stage: 'dfn', pct: 40 }], profiles: {}, ...o });
const res = (status, body) => ({ ok: status < 300, status, json: async () => body });

describe('targets', () => {
  it('tower-finish on 127.0.0.1, home hosts by their configured address, agent pods with the port through the RunPod proxy', () => {
    const ts = HP.targets({ towerKey: 'tk', machineKey: 'mk', hosts: [{ name: 'boss', address: 'boss', health_port: 8788 }, { name: 'nohost' }],
      pods: { a: { id: 'abc', name: 'p1', health_port: 8788, status: 'ready' }, b: { id: 'old', name: 'p2', status: 'ready' }, c: { id: 'x', name: 'p3', health_port: 8788, terminated: 1 }, d: { id: 'y', name: 'p4', health_port: 8788, status: 'booting' } } });
    expect(ts).toEqual([
      { machine: 'tower', url: 'http://127.0.0.1:8788/health', key: 'tk' },
      { machine: 'boss', url: 'http://boss:8788/health', key: 'mk' },
      { machine: 'p1', pod: 'abc', url: 'https://abc-8788.proxy.runpod.net/health', key: 'mk' },
    ]);
  });
});

describe('pollOne + store', () => {
  it('sends x-queue-key; ok → the snapshot; a refusal, a non-snapshot or a timeout → failed with why, never throws', async () => {
    let seen;
    const ok = await HP.pollOne({ machine: 'boss', url: 'u', key: 'k' }, { fetchFn: async (u, o) => { seen = o.headers; return res(200, snap()); } });
    expect(seen['x-queue-key']).toBe('k'); expect(ok).toMatchObject({ machine: 'boss', ok: true, data: { schema: 1, host: 'boss' } });
    expect(await HP.pollOne({ machine: 'b', url: 'u', key: 'k' }, { fetchFn: async () => res(401, {}) })).toMatchObject({ ok: false, error: 'HTTP 401' });
    expect(await HP.pollOne({ machine: 'b', url: 'u', key: 'k' }, { fetchFn: async () => res(200, { hi: 1 }) })).toMatchObject({ ok: false, error: 'not a /health snapshot' });
    const slow = await HP.pollOne({ machine: 'b', url: 'u', key: 'k' }, { timeoutMs: 20, fetchFn: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(o.signal.reason))) });
    expect(slow).toMatchObject({ ok: false, error: 'timeout' });
  });
  it('a failed poll keeps the last good data and says since when; a pod that just stopped answering is returned once', () => {
    const st = {};
    HP.store(st, [{ machine: 'p1', pod: 'abc', at: T0, ok: true, latency_ms: 900, data: snap() }], T0);
    let r = HP.store(st, [{ machine: 'p1', pod: 'abc', at: T0 + 60_000, ok: false, latency_ms: 10_000, error: 'timeout' }], T0 + 60_000);
    expect(r.newlyDown).toEqual(['abc']);
    expect(st.machine_health.p1).toMatchObject({ ok: false, error: 'timeout', down_since: T0 + 60_000, ok_at: T0, data: { host: 'boss' } });
    r = HP.store(st, [{ machine: 'p1', pod: 'abc', at: T0 + 120_000, ok: false, latency_ms: 10_000, error: 'timeout' }], T0 + 120_000);
    expect(r.newlyDown).toEqual([]); expect(st.machine_health.p1.down_since).toBe(T0 + 60_000);
    expect(st.machine_health.p1.polls.map((p) => p[1])).toEqual([1, 0, 0]);
    HP.store(st, [], T0 + 2 * 86_400_000);   // a machine no longer polled for a day is dropped
    expect(st.machine_health.p1).toBeUndefined();
  });
});

describe('history', () => {
  it('one compact row per poll (under 400 B), batched into one append per flush', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hh-'));
    const h = HP.History(dir, { now: () => T0 });
    const row = HP.historyRow({ machine: 'boss', at: T0, ok: true, latency_ms: 12, data: snap() });
    expect(row).toMatchObject({ t: T0, m: 'boss', ok: 1, ms: 12, cpu: 42, ram: [28, 128], gpu: [80, 2048, 4096, 60], disk: 500, slots: { 'cpu-prep': [2, 5] }, jobs: [['j1', 'cpu-prep', 'dfn', 40]], img: 'abcdef012345', ver: 'v1' });
    expect(JSON.stringify(row).length).toBeLessThan(400);
    h.push(row, HP.historyRow({ machine: 'p1', at: T0 + 1, ok: false, latency_ms: 10_000, error: 'timeout' }));
    expect(h.pending()).toBe(2);
    await h.flush(); expect(h.pending()).toBe(0);
    const lines = (await readFile(join(dir, '2026-10-31.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[1]).toEqual({ t: T0 + 1, m: 'p1', ok: 0, ms: 10_000, e: 'timeout' });
  });
  it('rotation gzips days before today and deletes days past KEEP_DAYS; reads span plain + gz days', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hr-'));
    const day = (d) => `2026-10-${String(d).padStart(2, '0')}`;
    await writeFile(join(dir, `${day(10)}.jsonl`), '{"t":1,"m":"x"}\n');   // 21 days old: gone
    await writeFile(join(dir, `${day(30)}.jsonl`), `${JSON.stringify({ t: T0 - 86_400_000, m: 'boss', ok: 1 })}\n`);
    const h = HP.History(dir, { now: () => T0 });
    h.push({ t: T0, m: 'boss', ok: 0, e: 'timeout' }, { t: T0, m: 'aorus', ok: 1 });
    await h.flush();
    expect((await readdir(dir)).sort()).toEqual([`${day(30)}.jsonl.gz`, `${day(31)}.jsonl`]);
    expect(gunzipSync(await readFile(join(dir, `${day(30)}.jsonl.gz`))).toString()).toContain('"boss"');
    const rows = await HP.readHistory(dir, { machine: 'BOSS', from: T0 - 2 * 86_400_000, to: T0 });
    expect(rows.map((r) => [r.t, r.ok])).toEqual([[T0 - 86_400_000, 1], [T0, 0]]);
    expect(await HP.readHistory(dir, { from: T0 - 3600_000, to: T0 })).toHaveLength(2);
    // a late append to an already-gzipped day joins its archive
    await writeFile(join(dir, `${day(30)}.jsonl`), `${JSON.stringify({ t: T0 - 86_400_000 + 5, m: 'boss', ok: 1 })}\n`);
    await HP.rotate(dir, T0);
    expect(await HP.readHistory(dir, { machine: 'boss', from: T0 - 2 * 86_400_000, to: T0 - 1 })).toHaveLength(2);
  });
  it('tick: polls, stores, logs each poll, and pulls new last words from each queue once', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ht-'));
    const st = {}, h = HP.History(dir, { now: () => T0 });
    let since = [];
    const q = { call: async (op, a) => { since.push(a.since); return [{ id: 1, host: 'pod-p1', at: T0 - 5, words: { host: 'pod-p1', reason: 'uncaughtException: boom', log: [] } }].filter((w) => w.at > a.since); } };   // = LW.list: at > since
    await HP.tick(st, { targets: [{ machine: 'boss', url: 'u', key: 'k' }], history: h, fetchFn: async () => res(200, snap()), now: () => T0, queues: { edge: q } });
    await HP.tick(st, { targets: [{ machine: 'boss', url: 'u', key: 'k' }], history: h, fetchFn: async () => res(200, snap()), now: () => T0, queues: { edge: q } });
    expect(since[1]).toBe(T0 - 5);
    const rows = await HP.readHistory(dir, { from: T0 - 3600_000, to: T0 });
    expect(rows.filter((r) => r.lw)).toEqual([expect.objectContaining({ m: 'p1', src: 'edge', reason: 'uncaughtException: boom' })]);
    expect(rows.filter((r) => r.m === 'boss')).toHaveLength(2);
    expect(st.machine_health.boss.ok).toBe(true);
  });
});

describe('the /media card', () => {
  it('dials from /health (GPU = power ÷ limit), unreachable with its age, the last polls; no last_error on the public card', () => {
    const now = T0 + 30_000;
    const v = healthView({ at: T0, ok: true, ok_at: T0, latency_ms: 50, data: snap({ lastError: { msg: '/secret/path' } }), polls: [[T0, 1, 50, 42]] }, now);
    expect(v.gauges).toEqual({ cpu: 42, gpu: 50 });
    expect(v.health).toMatchObject({ ok: true, image: 'abcdef012345', ram: [28, 128], vram: [2, 4], jobs: [{ type: 'cpu-prep', stage: 'dfn', pct: 40 }], polls: [[T0, 1, 50, 42]] });
    expect(JSON.stringify(v)).not.toContain('secret');
    const st = { machine_health: { boss: { at: now, ok: false, ok_at: T0 - 600_000, down_since: T0, error: 'timeout', data: snap(), polls: [] } },
      pods: { a: { id: 'abc', name: 'sifter-9', status: 'ready', created: T0 - 3600_000 } } };
    st.machine_health['sifter-9'] = { at: now, ok: true, ok_at: now, data: snap(), polls: [] };
    const cards = workerCards(st, now);
    const boss = cards.find((c) => c.key === 'boss'), pod = cards.find((c) => c.key === 'sifter-9');
    expect(boss).toMatchObject({ status: 'unreachable', gauges: null, health: { ok: false, down_s: 30, age_s: 630, error: 'timeout' } });
    expect(pod).toMatchObject({ status: 'idle', gauges: { cpu: 42, gpu: 50 } });
  });
});
