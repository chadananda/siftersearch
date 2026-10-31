// Queue agent GPU pacing (Chad 10-31): one talk always on deck for the GPU, so it never idles while the others run CPU stages.
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RAMP_MS, wantAnother, gpuLedger, reachedGpu, descends, cgroupMemGb, cpuSample, cpuBusy } from '../../scripts/media/worker/gpu-pace.mjs';

const base = { running: 1, cap: 12, onDeck: 0, memGb: 10, minGb: 5 };
it('one talk always on deck: claim the moment nothing is queued at the GPU or on its way there', () => {
  expect(wantAnother({ ...base, running: 0 })).toBe(true);
  expect(wantAnother(base)).toBe(true);
  expect(wantAnother({ ...base, onDeck: 1 })).toBe(false);
});
it('GPU idle, nothing queued at it, talks still in CPU prep: one more per RAMP_MS (10-31 pod 372)', () => {
  const prep = { ...base, onDeck: 1, waiting: 0, gpuIdle: true, sinceClaimMs: RAMP_MS };
  expect(wantAnother(prep)).toBe(true);
  expect(wantAnother({ ...prep, sinceClaimMs: RAMP_MS - 1 })).toBe(false);
  expect(wantAnother({ ...prep, gpuIdle: false })).toBe(false);
  expect(wantAnother({ ...prep, waiting: 1 })).toBe(false);
  expect(wantAnother({ ...prep, cpu: 0.95 })).toBe(false);
  expect(wantAnother({ ...prep, diskGb: 5, minDiskGb: 8 })).toBe(false);
  expect(wantAnother({ ...base, diskGb: 5, minDiskGb: 8 })).toBe(false);
});
it('the machine capacity (slots) and free RAM still bound it', () => {
  expect(wantAnother({ ...base, running: 12 })).toBe(false);
  expect(wantAnother({ ...base, memGb: 4 })).toBe(false);
});
it('gpuLedger: fresh waiters + lease holders; no files = empty', () => {
  const d = mkdtempSync(join(tmpdir(), 'lease-')), now = 1_800_000_000_000;
  expect(gpuLedger(d, now)).toEqual({ waiting: [], holding: [] });
  writeFileSync(join(d, 'leases.json.wait'), JSON.stringify({ 'pid:[1]:5': { since: 1, at: now / 1000 - 2 }, 'pid:[2]:6': { since: 1, at: now / 1000 - 30 } }));
  writeFileSync(join(d, 'leases.json'), JSON.stringify({ 'pid:[3]:7': { at: now / 1000 } }));
  expect(gpuLedger(d, now)).toEqual({ waiting: ['pid:[1]:5'], holding: ['pid:[3]:7'] });
  // grade/guard lease for RAM admission and run on the CPU: not "at the GPU" (10-31 pod 371)
  writeFileSync(join(d, 'leases.json'), JSON.stringify({ 'pid:[3]:7': { at: now / 1000, stage: 'grade' }, 'pid:[3]:8': { at: now / 1000, stage: 'dfn' } }));
  writeFileSync(join(d, 'leases.json.wait'), JSON.stringify({ 'pid:[1]:5': { at: now / 1000, stage: 'guard' } }));
  expect(gpuLedger(d, now)).toEqual({ waiting: [], holding: ['pid:[3]:8'] });
});
it('a talk has reached the GPU once a ledger key is its own: container namespace, or a pid under its process', () => {
  const ledger = { waiting: ['pid:[11]:296'], holding: ['pid:[4026]:900'] };
  expect(reachedGpu(ledger, (k) => k.startsWith('pid:[11]:'))).toBe(true);
  expect(reachedGpu(ledger, (k) => k.startsWith('pid:[12]:'))).toBe(false);
  const parent = { 900: 850, 850: 800, 800: 1 };
  expect(descends('900', 800, (p) => parent[p])).toBe(true);
  expect(descends('900', 700, (p) => parent[p])).toBe(false);
});
it('the agent asks wantAnother before every claim', () => {
  const agent = readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8');
  expect(agent).toMatch(/wantAnother\(\{[^}]*\}\)\) \{\n\s*const job = await q\.claim/);
  expect(agent).toMatch(/toGpu\.set\(job\.id/);
});
it('containers are capped at the host RAM, not 10 GB: the lease ledger sums every talk against that cap (10-31 boss)', () => {
  const agent = readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8');
  expect(agent).not.toMatch(/'--memory', '10g'/);
  expect(agent).toMatch(/'--memory', `\$\{containerMemGb\(memTotalGb\(\)\)\}g`/);
  const f = new Function(`return ${/containerMemGb = (\(totalGb\) => [^;]+);/.exec(agent)[1]}`)();
  expect([f(15), f(31), f(8)]).toEqual([12, 26, 10]);
});
it('agent pods: tower keeps a pod alive while its queue heartbeats arrive; slots = the pod capacity (10-31 pod 367)', async () => {
  const jobs = readFileSync('api/lib/ops/media-jobs.js', 'utf8');
  expect(jobs).toMatch(/p\.agent && st\.q_last\?\.beat\?\.\[`pod-\$\{p\.name\}`\]/);
  expect(jobs).toMatch(/agentEnv\(agentKey, `pod-\$\{p\.name\}`, p\.max_jobs\)/);
  const feed = readFileSync('api/lib/media/queue-feed.js', 'utf8');
  expect(feed).toMatch(/out\.beat\[j\.host\] = Math\.max\(out\.beat\[j\.host\] \|\| 0, j\.updated \|\| 0\)/);
  const { CLOUD } = await import('../../api/lib/media/cloud.js');
  expect(CLOUD.agentDeadAfterMs).toBeGreaterThan(CLOUD.deadAfterMs);
});
it('pod gauge reads cgroup v1 CPU time too (10-31: RunPod hosts without cpu.stat showed 0 % CPU), without 32-bit awk overflow', () => {
  const jobs = readFileSync('api/lib/ops/media-jobs.js', 'utf8');
  expect(jobs.match(/cpuacct\/cpuacct\.usage/g)?.length).toBe(2);
  expect(jobs.match(/cpu\/cpu\.cfs_quota_us/g)?.length).toBe(2);
  expect(jobs).not.toMatch(/printf "%d", \$1\/1000/);
});
it('RAM comes from the cgroup when it has a limit (10-31: a pod\'s /proc/meminfo is the host\'s; pods 367+368 took 12 talks and died)', () => {
  const G = 1073741824, files = (m) => (f) => { if (f in m) return m[f]; throw new Error('ENOENT'); };
  expect(cgroupMemGb(files({ '/sys/fs/cgroup/memory.max': `${64 * G}\n`, '/sys/fs/cgroup/memory.current': `${40 * G}`, '/sys/fs/cgroup/memory.stat': `anon 1\ninactive_file ${8 * G}\n` })))
    .toEqual({ limitGb: 64, availGb: 32 });
  expect(cgroupMemGb(files({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': `${100 * G}`, '/sys/fs/cgroup/memory/memory.usage_in_bytes': `${90 * G}`, '/sys/fs/cgroup/memory/memory.stat': `cache 5\ntotal_inactive_file ${10 * G}` })))
    .toEqual({ limitGb: 100, availGb: 20 });
  expect(cgroupMemGb(files({ '/sys/fs/cgroup/memory.max': 'max\n' }))).toBe(null);
  expect(cgroupMemGb(files({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': '9223372036854771712' }))).toBe(null);
  expect(cgroupMemGb(files({}))).toBe(null);
  const agent = readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8');
  expect(agent).toMatch(/cgroupMemGb\(\)\?\.availGb/);
  expect(agent).toMatch(/cap: CAP,/);
});
it('a full CPU holds claims: more talks only slow the CPU stages feeding the GPU (10-31 pod 370: load 78 on 31 CPUs, GPU 0 %)', () => {
  expect(wantAnother({ ...base, cpu: 0.95 })).toBe(false);
  expect(wantAnother({ ...base, cpu: 0.5 })).toBe(true);
  expect(wantAnother({ ...base, cpu: null })).toBe(true);
  const files = (m) => (f) => { if (f in m) return m[f]; throw new Error('ENOENT'); };
  expect(cpuSample(files({ '/sys/fs/cgroup/cpu.stat': 'usage_usec 5000\nuser_usec 1', '/sys/fs/cgroup/cpu.max': '3200000 100000\n' }), 256)).toEqual({ usec: 5000, cores: 32 });
  expect(cpuSample(files({ '/sys/fs/cgroup/cpuacct/cpuacct.usage': '15347867605000', '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '3112500', '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000' }), 256))
    .toEqual({ usec: 15347867605, cores: 31.125 });
  expect(cpuSample(files({ '/sys/fs/cgroup/cpu.stat': 'usage_usec 7', '/sys/fs/cgroup/cpu.max': 'max 100000' }), 16)).toEqual({ usec: 7, cores: 16 });
  expect(cpuSample(files({ '/proc/stat': 'cpu  100 0 50 1000 10 0 0 0 0 0\ncpu0 1' }), 8)).toEqual({ usec: 1_500_000, cores: 8 });
  const S = [{ t: 0, usec: 0, cores: 4 }, { t: 30_000, usec: 60e6, cores: 4 }, { t: 60_000, usec: 216e6, cores: 4 }];
  expect(cpuBusy(S)).toBeCloseTo(0.9);
  expect(cpuBusy(S.slice(0, 1))).toBe(null);
  expect(readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8')).toMatch(/minGb: MIN_AVAIL_GB, cpu,\n\s*gpuIdle, sinceClaimMs: Date\.now\(\) - claimedAt, diskGb: diskFreeGb\(\), minDiskGb: DISK_PER_TALK \}\)/);
});
