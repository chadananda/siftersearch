// The worker side of machine health (Chad 10-31): measured CPU admission (cpu-pace.mjs), GET /health's schema + auth, the snapshot ring and the
// last words (health.mjs), and the real agent serving /health and pushing its last words as it stops.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cgroupOf, readCgroup, track, summary, record, profileOf, memPressure, admitCpu, cpuAllowed, PROFILE_RUNS } from '../../scripts/media/worker/cpu-pace.mjs';
import { gpuStats, jobProgress, snapshot, compact, serveHealth, ringPush, lastWords, LAST_WORDS, HEALTH_SCHEMA } from '../../scripts/media/worker/health.mjs';

const G = 1073741824;
const files = (m) => (f) => { if (f in m) return m[f]; throw new Error(`ENOENT ${f}`); };
const dflt = { peakGb: 6, cores: 6 };

describe('cpu-pace: measuring a job container', () => {
  it('finds the container cgroup and reads its RAM and CPU', () => {
    expect(cgroupOf(42, files({ '/proc/42/cgroup': '0::/sifter-bulk.slice/docker-abc.scope\n' }))).toBe('/sys/fs/cgroup/sifter-bulk.slice/docker-abc.scope');
    expect(cgroupOf(42, files({ '/proc/42/cgroup': '12:cpu:/docker/abc\n' }))).toBe(null);
    const d = '/sys/fs/cgroup/x';
    expect(readCgroup(d, files({ [`${d}/cpu.stat`]: 'usage_usec 9000000\nuser_usec 1', [`${d}/memory.current`]: `${2 * G}`, [`${d}/memory.peak`]: `${3 * G}` }))).toEqual({ usec: 9e6, memGb: 2, peakGb: 3 });
    expect(readCgroup(d, files({ [`${d}/cpu.stat`]: 'usage_usec 1', [`${d}/memory.current`]: `${G}` }))).toEqual({ usec: 1, memGb: 1, peakGb: null });
    expect(readCgroup(null)).toBe(null);
  });
  it('tracks peak RAM and recent cores; the summary is CPU time over wall time', () => {
    let m = track(null, { usec: 0, memGb: 1, peakGb: null }, 0);
    m = track(m, { usec: 20e6, memGb: 3, peakGb: null }, 10_000);   // 2 cores over 10 s
    expect(m.cores).toBeCloseTo(2);
    m = track(m, { usec: 60e6, memGb: 2, peakGb: 4 }, 20_000);      // 4 cores in the last 10 s
    expect(m.peakGb).toBe(4);
    expect(summary(m)).toEqual({ peakGb: 4, cores: 3, run_s: 20 });
    expect(track(m, null, 30_000)).toBe(m);   // a vanished container changes nothing
    expect(summary(track(null, { usec: 0, memGb: 1 }, 0))).toBe(null);
  });
  it('a profile is the max peak and mean cores of the last runs; until measured, the starting values', () => {
    let p = {};
    expect(profileOf(p, 'cpu-finish', dflt)).toEqual({ peakGb: 6, cores: 6, n: 0, measured: false });
    for (let i = 0; i < 7; i++) p = record(p, 'cpu-finish', { peakGb: 1 + i, cores: 1, run_s: 60 }, i);
    expect(p['cpu-finish'].runs).toHaveLength(PROFILE_RUNS);
    expect(profileOf(p, 'cpu-finish', dflt)).toMatchObject({ peakGb: 7, cores: 1, n: 5, measured: true });
    expect(record(p, 'cpu-finish', null)).toBe(p);
  });
  it('memory pressure from PSI full avg10', () => {
    expect(memPressure(files({ '/proc/pressure/memory': 'some avg10=3.20 avg60=1 avg300=0 total=1\nfull avg10=1.50 avg60=0 avg300=0 total=1\n' }))).toBe(1.5);
    expect(memPressure(files({}))).toBe(null);
  });
});

describe('cpu-pace: admission', () => {
  const measured = { 'cpu-finish': { runs: [{ peak_gb: 2, cores: 1.5 }] }, 'cpu-prep': { runs: [{ peak_gb: 3, cores: 4 }] } };
  const prof = (t) => profileOf(measured, t, dflt);
  const base = { prof, running: [], busy: 0.1, allowed: 32, availGb: 20, marginGb: 5, slots: 3, pressure: 0 };
  it('admits past --slots once measured, while the projected CPU stays under 85 % and the RAM holds the peak + margin', () => {
    const running = Array.from({ length: 5 }, () => ({ type: 'cpu-finish', memGb: 1.5, cores: 1.5 }));
    expect(admitCpu({ ...base, type: 'cpu-finish', running, busy: 0.3 }).ok).toBe(true);
    // 0.8 × 32 = 25.6 busy + 1.5 > 27.2
    expect(admitCpu({ ...base, type: 'cpu-finish', running, busy: 0.82 })).toMatchObject({ ok: false, why: expect.stringMatching(/^cpu/) });
  });
  it('a job not yet at its profile still counts what it will use', () => {
    const fetching = Array.from({ length: 6 }, () => ({ type: 'cpu-prep', memGb: 0, cores: null }));   // 6 × 4 cores still to come
    expect(admitCpu({ ...base, type: 'cpu-prep', running: fetching, busy: 0.05 }).ok).toBe(false);
    expect(admitCpu({ ...base, type: 'cpu-finish', running: [{ type: 'cpu-prep', memGb: 0, cores: null }], availGb: 9 })).toMatchObject({ ok: false, why: expect.stringMatching(/^ram/) });
  });
  it('unmeasured types keep --slots; memory pressure or an unknown CPU holds', () => {
    const p2 = (t) => profileOf({}, t, dflt);
    expect(admitCpu({ ...base, prof: p2, availGb: 40, type: 'cpu-finish', running: [{ type: 'cpu-finish' }, { type: 'cpu-finish' }] }).ok).toBe(true);
    expect(admitCpu({ ...base, prof: p2, type: 'cpu-finish', running: [{ type: 'cpu-finish' }, { type: 'cpu-finish' }, { type: 'cpu-finish' }] }).why).toMatch(/unmeasured/);
    expect(admitCpu({ ...base, type: 'cpu-finish', pressure: 2 }).why).toMatch(/pressure/);
    expect(admitCpu({ ...base, type: 'cpu-finish', busy: null, running: [{ type: 'cpu-finish', cores: 1 }] }).why).toMatch(/unknown/);
    expect(admitCpu({ ...base, type: 'cpu-finish', busy: null }).ok).toBe(true);   // nothing in hand: start
  });
  it('tower: the slice (16 cores, 20 GB) is the ceiling', () => {
    const allowed = cpuAllowed(['cpu-finish'], { ...base, allowed: 16, availGb: 20, busy: 0 });
    // RAM: 20 - 5 margin = 15 / 2 GB peak → 7; CPU: 0.85 × 16 = 13.6 / 1.5 → 9: RAM binds
    expect(allowed['cpu-finish']).toBe(7);
  });
});

describe('health.mjs', () => {
  it('reads an NVIDIA GPU (util, power, VRAM) and a Strix Halo (busy %, VRAM + GTT); null without one', () => {
    const run = () => ({ status: 0, stdout: '97, 301.5, 450.0, 20000, 24564\n' });
    expect(gpuStats('cuda', { run })).toEqual({ device: 'cuda', count: 1, util: 97, power_w: 301.5, power_limit_w: 450, vram_used_mb: 20000, vram_total_mb: 24564 });
    const dev = '/sys/class/drm/card1/device', M = 1048576;
    const fs = { [`${dev}/gpu_busy_percent`]: '64', [`${dev}/mem_info_vram_used`]: `${512 * M}`, [`${dev}/mem_info_vram_total`]: `${512 * M}`, [`${dev}/mem_info_gtt_used`]: `${30000 * M}`,
      [`${dev}/mem_info_gtt_total`]: `${100000 * M}`, [`${dev}/hwmon/hwmon3/power1_average`]: '80000000', [`${dev}/hwmon/hwmon3/power1_cap`]: '120000000' };
    const ls = (d) => (d === '/sys/class/drm' ? ['card0', 'card1'] : ['hwmon3']);
    expect(gpuStats('rocm', { read: files(fs), ls, has: (f) => f in fs })).toEqual({ device: 'rocm', count: 1, util: 64, power_w: 80, power_limit_w: 120, vram_used_mb: 30512, vram_total_mb: 100512 });
    expect(gpuStats('none')).toBe(null);
    expect(gpuStats('cuda', { run: () => ({ status: 9, stdout: '' }) })).toBe(null);
  });
  it('percent complete from progress.json and the contract stage list', () => {
    const contract = { types: { 'cpu-finish': { stages: ['guard', 'assess', 'remaster', 'verify', 'realign', 'quiet', 'web', 'trim', 'waveform'] }, 'cpu-prep': { stages: ['archive', 'grade', 'enhance:metrics', 'enhance:light', 'waveform'] } } };
    const at = (stage) => files({ '/j/progress.json': JSON.stringify({ at: 5, stage }) });
    expect(jobProgress('/j', 'cpu-finish', contract, at('quiet'))).toEqual({ stage: 'quiet', pct: 56, stage_at: 5 });
    expect(jobProgress('/j', 'cpu-prep', contract, at('light'))).toMatchObject({ pct: 60 });
    expect(jobProgress('/j', 'cpu-prep', contract, at('complete'))).toMatchObject({ pct: 100 });
    expect(jobProgress('/j', 'cpu-prep', contract, at('mystery'))).toMatchObject({ stage: 'mystery', pct: null });
    expect(jobProgress('/j', 'cpu-prep', contract, files({}))).toEqual({ stage: null, pct: null, stage_at: null });
  });
  const snap = () => snapshot({ now: 61_000, host: 'boss', role: 'home', image: 'ghcr.io/x/w@sha256:e9bef996c75206df3c2b', version: 'abc', pid: 7, startedAt: 1000, queue: 'http://tower-nas:7843',
    cpu: 0.42, cores: 32, cpuScope: 'host', ramTotalGb: 31, ramAvailGb: 21, gpu: null, diskFreeGb: 400, diskTotalGb: 900, diskPath: '/r',
    slots: { 'cpu-prep': { used: 2, allowed: 5 } }, jobs: [{ id: 'j1', type: 'cpu-prep', phase: 'run', stage: 'grade', pct: 20 }], profiles: {}, lastError: null });
  it('one schema for every machine', () => {
    const s = snap();
    expect(s).toMatchObject({ schema: HEALTH_SCHEMA, at: 61_000, host: 'boss', role: 'home', agent: { uptime_s: 60, version: 'abc' }, cpu: { pct: 42, cores: 32 },
      ram: { used_gb: 10, total_gb: 31, avail_gb: 21 }, gpu: null, disk: { free_gb: 400 }, slots: { 'cpu-prep': { used: 2, allowed: 5 } }, last_error: null });
    expect(Object.keys(s).sort()).toEqual(['agent', 'at', 'cpu', 'disk', 'gpu', 'host', 'image', 'jobs', 'last_error', 'profiles', 'ram', 'role', 'schema', 'slots']);
    const c = compact(s);
    expect(c).toEqual({ at: 61_000, host: 'boss', cpu: 42, ram: [10, 31], gpu: null, disk: 400, slots: { 'cpu-prep': [2, 5] }, jobs: [['j1', 'cpu-prep', 'grade', 20]], img: 'e9bef996c752', ver: 'abc', err: null });
    expect(JSON.stringify(c).length).toBeLessThan(400);
  });
  it('the ring keeps the last N; the last words are capped small', () => {
    let r = [];
    for (let i = 0; i < 70; i++) r = ringPush(r, { i }, 60);
    expect(r).toHaveLength(60);
    expect(r[0].i).toBe(10);
    const big = Array.from({ length: 60 }, () => ({ pad: 'x'.repeat(2000) }));
    const w = lastWords({ host: 'pod-389', reason: 'idle exit', now: 1, ring: big, lines: Array.from({ length: 200 }, (_, i) => `line ${i}`) });
    expect(JSON.stringify(w).length).toBeLessThanOrEqual(LAST_WORDS.maxBytes);
    expect(w.log).toHaveLength(LAST_WORDS.lines);
    expect(w.log.at(-1)).toBe('line 199');
  });
  it('GET /health answers only with the queue key', async () => {
    const srv = serveHealth({ port: 0, key: 'sekret', get: () => snap() });
    await new Promise((r) => srv.once('listening', r));
    const u = `http://127.0.0.1:${srv.address().port}`;
    expect((await fetch(`${u}/health`)).status).toBe(401);
    expect((await fetch(`${u}/health`, { headers: { 'x-queue-key': 'wrong!' } })).status).toBe(401);
    expect((await fetch(`${u}/other`, { headers: { 'x-queue-key': 'sekret' } })).status).toBe(404);
    const r = await fetch(`${u}/health`, { headers: { 'x-queue-key': 'sekret' } });
    expect(r.status).toBe(200);
    expect((await r.json()).host).toBe('boss');
    srv.close();
  });
});

describe('the agent serves /health and leaves last words', () => {
  it('a CPU agent answers /health with its slots and profiles, and pushes its last words when stopped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qa-health-'));
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'cpu-profile.json'), JSON.stringify({ 'cpu-finish': { runs: [{ peak_gb: 2.5, cores: 1.2 }] } }));
    const words = [];
    const q = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { if (req.url.endsWith('/last-words')) words.push(JSON.parse(b)); res.statusCode = 204; res.end(); }); });
    await new Promise((r) => q.listen(0, '127.0.0.1', r));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const p = spawn(process.execPath, ['scripts/media/worker/queue-agent.mjs', '--host', 'tq', '--run', 'local', '--root', root, '--types', 'cpu-finish,cpu-prep', '--device', 'none', '--health-port', String(port)],
      { env: { ...process.env, MEDIA_QUEUE_KEY: 'k1', MEDIA_QUEUE_URL: `http://127.0.0.1:${q.address().port}` } });
    let out = ''; p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { out += c; });
    for (let i = 0; i < 100 && !/"msg":"health"/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(401);
    const h = await (await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'x-queue-key': 'k1' } })).json();
    expect(h).toMatchObject({ schema: 1, host: 'tq', role: 'home', gpu: null, jobs: [], slots: { 'cpu-finish': { used: 0 }, 'cpu-prep': { used: 0 } } });
    expect(h.profiles['cpu-finish']).toEqual({ peak_gb: 2.5, cores: 1.2, runs: 1, measured: true });
    expect(h.cpu.cores).toBeGreaterThan(0);
    p.kill('SIGTERM');
    const code = await new Promise((r) => p.on('close', r));
    q.close();
    expect(code).toBe(0);
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ host: 'tq', reason: 'stopped (signal)' });
    expect(words[0].snapshots.at(-1)).toMatchObject({ host: 'tq', jobs: [] });
    expect(words[0].log.some((l) => /"msg":"start"/.test(l))).toBe(true);
  }, 30_000);
});
