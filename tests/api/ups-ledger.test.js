// UPS ledger + confirmation report (api/lib/ops/ups-ledger.js): the report proves a SAFE SHUTDOWN step by step — good
// sequence ✓, a missing step ✗ at that step, an unclean shutdown ✗, the held path, low battery margin, and when confirm reports.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { appendStep, readLedger, currentEvent, buildUpsReport, confirmPlan, drillSequence, MIN_MARGIN_S } from '../../api/lib/ops/ups-ledger.js';

const T0 = Date.parse('2026-11-03T14:00:00Z');

describe('buildUpsReport', () => {
  it('good sequence → "safe shutdown ✓" with battery margin and downtime', () => {
    const r = buildUpsReport(drillSequence('good', T0));
    expect(r).toMatchObject({ path: 'shutdown', ok: true, failedAt: null, headline: 'safe shutdown ✓', subject: '[UPS] tower power event: safe shutdown ✓' });
    expect(r.text).toMatch(/Margin: 166 s of battery runtime left at power-off \(11% charge\)/);
    expect(r.text).toMatch(/Down for 72 min/);
    expect(r.steps.every((s) => s.ok !== false)).toBe(true);
    expect(r.html).toMatch(/<table/);
  });

  it('missing step → ✗ at that step (no WAL checkpoint recorded)', () => {
    const r = buildUpsReport(drillSequence('missing', T0));
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('db-flushed');
    expect(r.headline).toBe('safe shutdown ✗ at db-flushed — step missing from the ledger');
    expect(r.subject).toBe('UPS plan failed at db-flushed');
  });

  it('unclean shutdown (booted with no power-off) → ✗, power lost before the clean shutdown', () => {
    const r = buildUpsReport(drillSequence('unclean', T0));
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('services-stopped');
    expect(r.problems.map(([s]) => s)).toContain('poweroff');
    expect(r.text).toMatch(/power was lost before the clean shutdown started/);
    expect(r.text).toMatch(/does not end in a clean power-off/);
  });

  it('held path: mains back before low battery → "safe state held ✓"', () => {
    const r = buildUpsReport(drillSequence('held', T0));
    expect(r).toMatchObject({ path: 'held', ok: true, headline: 'safe state held ✓' });
    expect(r.text).toMatch(/no shutdown was needed/);
  });

  it('cut too fine: runtime below the margin at power-off fails at poweroff', () => {
    const ev = drillSequence('good', T0).map((l) => (l.step === 'poweroff' ? { ...l, battery: { charge: 2, runtime: MIN_MARGIN_S - 10 } } : l));
    const r = buildUpsReport(ev);
    expect(r.failedAt).toBe('poweroff');
    expect(r.why).toMatch(/only 20 s of battery left/);
  });

  it('a blocked WAL checkpoint (busy > 0) or a writer not read-only at power-off is not safe', () => {
    const busy = drillSequence('good', T0).map((l) => (l.step === 'db-flushed' ? { ...l, detail: { ok: true, content: { busy: 1, log: 40, checkpointed: 12 } } } : l));
    expect(buildUpsReport(busy).failedAt).toBe('db-flushed');
    const rw = drillSequence('good', T0).map((l) => (l.step === 'poweroff' ? { ...l, detail: { writer: { mode: 'normal' } } } : l));
    expect(buildUpsReport(rw).why).toMatch(/'normal' mode at power-off/);
  });

  it('drill reports carry the [DRILL] prefix', () => {
    expect(buildUpsReport(drillSequence('good', T0), { drill: true }).subject).toBe('[DRILL] [UPS] tower power event: safe shutdown ✓');
    expect(buildUpsReport(drillSequence('missing', T0), { drill: true }).subject).toBe('[DRILL] UPS plan failed at db-flushed');
  });
});

describe('ledger file + confirmPlan', () => {
  it('appends and reads lines; currentEvent starts after the last report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'upsl-')), file = join(dir, 'x', 'ledger.jsonl');
    try {
      appendStep({ step: 'onbatt' }, { file, now: T0 - 9e6 });
      appendStep({ step: 'reported' }, { file, now: T0 - 8e6 });
      appendStep({ step: 'onbatt' }, { file, now: T0 });
      appendStep({ step: 'readonly', ok: false }, { file, now: T0 + 10_000 });
      const lines = readLedger({ file });
      expect(lines).toHaveLength(4);
      expect(currentEvent(lines).map((l) => [l.step, l.ok])).toEqual([['onbatt', true], ['readonly', false]]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('appendStep never throws (unwritable path → null)', () => {
    expect(appendStep({ step: 'x' }, { file: '/dev/null/nope/ledger.jsonl' })).toBeNull();
  });

  const seq = drillSequence('good', T0).filter((l) => l.step !== 'healthy');
  const bootAt = seq.find((l) => l.step === 'boot').at;
  it('none without an event; boot when this boot is newer than the last step', () => {
    expect(confirmPlan([], {}).action).toBe('none');
    const noBoot = seq.filter((l) => l.step !== 'boot');
    expect(confirmPlan(noBoot, { bootAt, now: Date.parse(bootAt) + 60_000 }).action).toBe('boot');
  });
  it('waits while services settle, reports after, final after the max wait', () => {
    const b = Date.parse(bootAt);
    expect(confirmPlan(seq, { bootAt, now: b + 60_000 }).action).toBe('wait');
    expect(confirmPlan(seq, { bootAt, now: b + 10 * 60_000 })).toMatchObject({ action: 'report', finalIfUnhealthy: false });
    expect(confirmPlan(seq, { bootAt, now: b + 40 * 60_000 })).toMatchObject({ action: 'report', finalIfUnhealthy: true });
  });
  it('still on battery → wait; a blip under the debounce → quiet; mains back but read-only never started → report', () => {
    expect(confirmPlan(seq.slice(0, 4), { now: T0 + 5 * 60_000 }).action).toBe('wait');
    const blip = [{ at: new Date(T0).toISOString(), step: 'onbatt' }, { at: new Date(T0 + 6000).toISOString(), step: 'online' }];
    expect(confirmPlan(blip, { now: T0 + 5 * 60_000 }).action).toBe('quiet');
    const missed = [blip[0], { at: new Date(T0 + 60_000).toISOString(), step: 'online' }];
    expect(confirmPlan(missed, { now: T0 + 5 * 60_000 })).toMatchObject({ action: 'report', finalIfUnhealthy: true });
    expect(buildUpsReport(missed).failedAt).toBe('writers-stopped');
  });
});

describe('ups-drill.mjs --simulate (real ledger + report code, temp ledger)', { timeout: 30_000 }, () => {
  for (const [scenario, re] of [['good', /\[DRILL\] \[UPS\] tower power event: safe shutdown ✓/], ['missing', /\[DRILL\] UPS plan failed at db-flushed/], ['unclean', /\[DRILL\] UPS plan failed at services-stopped/]]) {
    it(scenario, () => {
      const r = spawnSync(process.execPath, ['scripts/ops/ups-drill.mjs', '--simulate', '--scenario', scenario], { encoding: 'utf8', env: { ...process.env, SIFTER_UPS_LEDGER: '/nonexistent/never-written' } });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(re);
    });
  }
});
