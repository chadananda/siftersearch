// Queue agent GPU pacing (Chad 10-31): one talk always on deck for the GPU, so it never idles while the others run CPU stages.
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { wantAnother, gpuLedger, reachedGpu, descends } from '../../scripts/media/worker/gpu-pace.mjs';

const base = { running: 1, cap: 12, onDeck: 0, memGb: 10, minGb: 5 };
it('one talk always on deck: claim the moment nothing is queued at the GPU or on its way there', () => {
  expect(wantAnother({ ...base, running: 0 })).toBe(true);
  expect(wantAnother(base)).toBe(true);
  expect(wantAnother({ ...base, onDeck: 1 })).toBe(false);
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
  expect(agent).toMatch(/wantAnother\(\{[^\n]*\}\)\) \{\n\s*const job = await q\.claim/);
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
