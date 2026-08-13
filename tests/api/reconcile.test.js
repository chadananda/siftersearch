// DECLARED vs ACTUAL. Each case here is a real deployment surprise from 2026-08-12 that cost an
// investigation; the point of the module is that each becomes one comparison reported out loud.
import { describe, it, expect } from 'vitest';
import { reconcile, EXPECTED_CRON_APPS } from '../../api/lib/reconcile.js';

const NOW = Date.parse('2026-08-13T06:00:00Z');
const healthy = () => ({
  now: NOW,
  processes: [
    ...EXPECTED_CRON_APPS.map((name) => ({ name, status: 'stopped', last_start: '2026-08-13T05:45:00Z', restarts: 0 })),
    { name: 'siftersearch-api', status: 'online', last_start: '2026-08-13T05:00:00Z' },
    { name: 'siftersearch-worker', status: 'online', last_start: '2026-08-13T05:00:00Z' },
  ],
  schemaVersion: { content: 107, user: 7 },
  expectedSchema: { content: 107, user: 7 },
  deployedVersion: '2.186.99', repoVersion: '2.186.99',
});

describe('reconcile', () => {
  it('reports no drift when reality matches intent', () => {
    const r = reconcile(healthy());
    expect(r.ok).toBe(true);
    expect(r.drift).toEqual([]);
  });

  it('catches a cron app declared but unknown to pm2 — the failure that wasted an evening', () => {
    const a = healthy();
    a.processes = a.processes.filter((p) => p.name !== 'siftersearch-converter');
    const r = reconcile(a);
    expect(r.ok).toBe(false);
    expect(r.drift[0]).toMatchObject({ kind: 'cron_app_missing', severity: 'critical' });
    expect(r.drift[0].detail).toContain('siftersearch-converter');
  });

  it('does NOT treat a stopped cron one-shot as broken — that is its normal resting state', () => {
    expect(reconcile(healthy()).ok).toBe(true);   // all cron apps are 'stopped' in the healthy fixture
  });

  it('catches a registered cron app that is not actually firing', () => {
    const a = healthy();
    a.processes = a.processes.map((p) =>
      p.name === 'siftersearch-book-ingest' ? { ...p, last_start: '2026-08-12T20:00:00Z' } : p);
    const r = reconcile(a);
    expect(r.drift.some((d) => d.kind === 'cron_app_stale' && d.detail.includes('book-ingest'))).toBe(true);
  });

  it('catches a migration written but never applied — the consent-column case', () => {
    const a = healthy();
    a.schemaVersion.user = 6;            // code expects 7
    const r = reconcile(a);
    expect(r.ok).toBe(false);
    expect(r.drift.some((d) => d.kind === 'migration_pending' && d.detail.includes('user db at v6'))).toBe(true);
  });

  it('flags a schema AHEAD of the code as a possible rollback', () => {
    const a = healthy();
    a.schemaVersion.content = 108;
    const r = reconcile(a);
    expect(r.drift.some((d) => d.kind === 'migration_ahead')).toBe(true);
    expect(r.ok).toBe(true);             // a warning, not a critical
  });

  it('catches a stuck or pending deploy', () => {
    const a = healthy();
    a.repoVersion = '2.187.0';
    expect(reconcile(a).drift.some((d) => d.kind === 'version_skew')).toBe(true);
  });

  it('catches a core worker that is down', () => {
    const a = healthy();
    a.processes = a.processes.map((p) => (p.name === 'siftersearch-worker' ? { ...p, status: 'errored' } : p));
    const r = reconcile(a);
    expect(r.ok).toBe(false);
    expect(r.drift.some((d) => d.kind === 'worker_down')).toBe(true);
  });

  it('says so when it cannot read pm2, instead of reporting all-clear', () => {
    const r = reconcile({ ...healthy(), processes: null });
    expect(r.drift.some((d) => d.kind === 'pm2_unreadable')).toBe(true);
  });

  it('skips version checks it has no data for rather than inventing drift', () => {
    const r = reconcile({ processes: healthy().processes, now: NOW });
    expect(r.drift).toEqual([]);
  });
});
