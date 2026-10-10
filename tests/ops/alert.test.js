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
    expect(sent[0].subject).toBe('[ACTION REQUIRED] SifterSearch API is down');
    expect(sent).toHaveLength(2);
  });
});
