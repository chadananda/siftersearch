// The critical-path checker reports a failing check as a failure (never throws), and its pm2 check catches what the
// 10-10 outage looked like: the API simply absent from pm2, or back in fork mode.
import { describe, it, expect } from 'vitest';
import { runChecks, localChecks, publicChecks } from '../../scripts/ops/critical-path.mjs';
import { CRITICAL_APPS } from '../../api/lib/ops/ecosystem-check.js';

const pm2 = (overrides = {}) => JSON.stringify(Object.keys(CRITICAL_APPS).filter((n) => overrides[n] !== null).map((name) => ({
  name, pm2_env: { status: 'online', exec_mode: name === 'siftersearch-api' ? 'cluster_mode' : 'fork_mode', ...(overrides[name] || {}) } })));
const pm2Check = (list) => localChecks({ run: async () => list }).find(([n]) => n.startsWith('pm2'));

describe('critical path', () => {
  it('runChecks records failures without throwing', async () => {
    const r = await runChecks([['ok', async () => 'fine'], ['bad', async () => { throw new Error('HTTP 502'); }]]);
    expect(r.ok).toBe(false);
    expect(r.results).toEqual([{ name: 'ok', ok: true, detail: 'fine' }, { name: 'bad', ok: false, detail: 'HTTP 502' }]);
  });
  it('pm2 check: all critical apps online with the API in cluster mode passes', async () => {
    expect((await runChecks([pm2Check(pm2())])).ok).toBe(true);
  });
  it('pm2 check fails when the API is missing (the 10-10 outage) or not in cluster mode', async () => {
    const missing = await runChecks([pm2Check(pm2({ 'siftersearch-api': null }))]);
    expect(missing.ok).toBe(false);
    expect(missing.results[0].detail).toMatch(/siftersearch-api/);
    const fork = await runChecks([pm2Check(pm2({ 'siftersearch-api': { exec_mode: 'fork_mode' } }))]);
    expect(fork.results[0].detail).toMatch(/want cluster/);
  });
  it('a 502 from the API health check is a failure', async () => {
    const fetchImpl = async () => new Response('bad gateway', { status: 502 });
    const check = publicChecks({ fetchImpl }).find(([n]) => n === 'API health (public tunnel)');
    const r = await runChecks([check]);
    expect(r.results[0]).toMatchObject({ ok: false, detail: 'HTTP 502' });
  });
});
