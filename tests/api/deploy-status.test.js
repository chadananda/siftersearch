// Deploy status recording + deploy-check verdicts/exit codes.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { recordDeploy, readDeployStatus, KEEP } from '../../api/lib/ops/deploy-status.js';
import { check, verdict } from '../../scripts/ops/deploy-check.mjs';

const file = () => join(mkdtempSync(join(tmpdir(), 'ds-')), 'run', 'deploy-status.json');

describe('recordDeploy', () => {
  it('tracks pending -> refused with reason, lastGood unchanged', () => {
    const f = file();
    recordDeploy(f, { commit: 'aaa111', status: 'deployed' });
    recordDeploy(f, { commit: 'bbb222', status: 'pending' });
    const s = recordDeploy(f, { commit: 'bbb222', status: 'refused', reason: 'syntax: x.js:3 SyntaxError' });
    expect(s.lastGood).toBe('aaa111'); expect(s.lastAttempt).toBe('bbb222'); expect(s.status).toBe('refused');
    expect(s.attempts).toHaveLength(2);
    expect(readDeployStatus(f).attempts[1].reason).toMatch(/SyntaxError/);
  });
  it('keeps the last 20 and survives a missing file', () => {
    const f = file();
    expect(readDeployStatus(f).attempts).toEqual([]);
    for (let i = 0; i < KEEP + 5; i++) recordDeploy(f, { commit: `c${i}`, status: 'deployed' });
    expect(readDeployStatus(f).attempts).toHaveLength(KEEP);
    expect(existsSync(`${f}.tmp`)).toBe(false);
  });
});

describe('deploy-check', () => {
  const st = (status, reason) => ({ lastAttempt: 'abc12345ff', attempts: [{ commit: 'abc12345ff', status, reason }] });
  it('verdict matches abbreviated shas', () => {
    expect(verdict(st('deployed'), 'abc12345').code).toBe(0);
    expect(verdict(st('pending'), 'abc12345')).toBeNull();
  });
  it('exit 0 deployed, 1 refused with reason, 2 pending', async () => {
    const fast = { everyMs: 1, sleep: async () => {} };
    expect((await check('abc12345ff', { ...fast, fetchStatus: async () => st('deployed') })).code).toBe(0);
    const r = await check('abc12345ff', { ...fast, fetchStatus: async () => st('refused', 'syntax: a.js: SyntaxError') });
    expect(r.code).toBe(1); expect(r.line).toMatch(/SyntaxError/);
    let t = 0;
    const p = await check('zzz', { sleep: async () => {}, now: () => (t += 100_000), timeoutMs: 300_000, fetchStatus: async () => st('pending') });
    expect(p.code).toBe(2);
  });
  it('turns pending into deployed when it flips mid-poll; unreachable status ends pending', async () => {
    let n = 0;
    const r = await check('abc12345ff', { sleep: async () => {}, fetchStatus: async () => st(++n < 3 ? 'pending' : 'deployed') });
    expect(r.code).toBe(0);
    let t = 0;
    const u = await check('abc', { sleep: async () => {}, now: () => (t += 200_000), timeoutMs: 300_000, fetchStatus: async () => { throw new Error('HTTP 502'); } });
    expect(u.code).toBe(2); expect(u.line).toMatch(/unreachable/);
  });
});
