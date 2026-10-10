// The PM2 config must be one PM2 accepts. 10-10: one app's `max_restarts: -1` made PM2 6 reject the WHOLE file, the
// updater's delete+start fallback then left the API, writer and deep-research deleted for 30 minutes. This test fails
// the commit before such a file can reach tower.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { validateEcosystem, CRITICAL_APPS } from '../../api/lib/ops/ecosystem-check.js';

const require = createRequire(import.meta.url);
const config = require('../../ecosystem.config.cjs');

describe('ecosystem.config.cjs', () => {
  it('passes validation (what PM2 would accept, every critical app declared, scripts present)', () => {
    expect(validateEcosystem(config, { root: process.cwd() })).toEqual([]);
  });
  it('declares the API in cluster mode with a bounded wait_ready (zero-downtime reloads)', () => {
    const api = config.apps.find((a) => a.name === 'siftersearch-api');
    expect(api.exec_mode).toBe('cluster');
    expect(api.wait_ready).toBe(true);
    expect(api.listen_timeout).toBeGreaterThan(0);
    expect(api.env.API_PREBOOT).toBe('1');
  });
});

describe('validateEcosystem catches what took the site down', () => {
  const base = () => ({ apps: Object.keys(CRITICAL_APPS).map((name) => ({ name, script: '/bin/true', ...(CRITICAL_APPS[name].exec_mode ? { exec_mode: CRITICAL_APPS[name].exec_mode } : {}) })) });
  it('a negative max_restarts (PM2 rejects the whole file)', () => {
    const c = base(); c.apps[0].max_restarts = -1;
    expect(validateEcosystem(c, { checkFiles: false }).join()).toMatch(/max_restarts: -1 is below PM2's minimum 0/);
  });
  it('a missing critical app, a wrong API mode, a duplicate name, wait_ready without a timeout', () => {
    const c = base();
    c.apps = c.apps.filter((a) => a.name !== 'siftersearch-worker');
    c.apps.find((a) => a.name === 'siftersearch-api').exec_mode = 'fork';
    c.apps.push({ name: 'siftersearch-api', script: '/bin/true' });
    c.apps.push({ name: 'x', script: '/bin/true', wait_ready: true });
    const p = validateEcosystem(c, { checkFiles: false }).join('\n');
    expect(p).toMatch(/critical app 'siftersearch-worker' is not declared/);
    expect(p).toMatch(/exec_mode must be 'cluster'/);
    expect(p).toMatch(/duplicate name/);
    expect(p).toMatch(/wait_ready without a listen_timeout/);
  });
  it('a valid minimal config has no problems', () => {
    expect(validateEcosystem(base(), { checkFiles: false })).toEqual([]);
  });
});
