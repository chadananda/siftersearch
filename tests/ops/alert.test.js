// [ACTION REQUIRED] alerts: once per key per quiet window, re-armed by clearAlert on recovery.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { actionRequired, clearAlert } from '../../api/lib/ops/alert.js';

describe('actionRequired', () => {
  it('sends once per key in the window, again after clearAlert', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alert-'));
    const sent = [];
    const deps = { dir, to: 'chad@example.org', sendEmail: async (m) => sent.push(m), now: 1000 };
    const a = { key: 'api-down', subject: 'SifterSearch API is down', text: 'x', quietMs: 60_000 };
    expect(await actionRequired(a, deps)).toBe(true);
    expect(await actionRequired(a, { ...deps, now: 30_000 })).toBe(false);   // inside the window
    clearAlert('api-down', { dir });                                         // recovered
    expect(await actionRequired(a, { ...deps, now: 40_000 })).toBe(true);    // next incident alerts at once
    expect(sent[0].subject).toBe('[ACTION] SifterSearch API is down');
    expect(sent).toHaveLength(2);
  });
});

describe('alert severity (10-11: an alarm wakes only on [PAGE])', () => {
  it('prefixes [PAGE] for page and [ACTION] by default', async () => {
    const { actionRequired } = await import('../../api/lib/ops/alert.js');
    const { mkdtempSync } = await import('fs'); const { tmpdir } = await import('os'); const { join } = await import('path');
    const sent = [];
    const deps = { dir: mkdtempSync(join(tmpdir(), 'al-')), to: 'x@y', sendEmail: async (m) => sent.push(m.subject) };
    await actionRequired({ key: 'a', subject: 'down', text: 't', severity: 'page' }, deps);
    await actionRequired({ key: 'b', subject: 'credit', text: 't' }, deps);
    expect(sent).toEqual(['[PAGE] down', '[ACTION] credit']);
  });
  it('only visitor-facing critical-path failures page', async () => {
    const { isPublicFailure } = await import('../../scripts/ops/critical-path.mjs');
    expect(isPublicFailure('site: home')).toBe(true);
    expect(isPublicFailure('API health (public tunnel)')).toBe(true);
    expect(isPublicFailure('S3 gateway signed list')).toBe(false);
    expect(isPublicFailure('pm2: critical processes online')).toBe(false);
  });
});
