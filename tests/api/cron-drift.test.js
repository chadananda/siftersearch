// pm2 keeps its own copy of an app's config and does NOT refresh cron_restart on startOrReload, so the
// declared schedule and the live one drift silently. This is the comparison that catches it. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { declaredCrons, driftedApps } from '../../scripts/lib/cron-drift.mjs';

const ECO = `
module.exports = { apps: [
  { name: 'siftersearch-api', script: 'api/server.js', instances: 1 },
  { name: 'siftersearch-converter', script: 'scripts/convert-missing-books.mjs',
    args: '--apply --limit 40', autorestart: false, cron_restart: '5 * * * *' },
  { name: 'siftersearch-book-ingest', script: 'scripts/ingest-converted-books.mjs',
    autorestart: false, cron_restart: '35 * * * *' },
]};`;

describe('declaredCrons', () => {
  it('reads cron_restart per app from the ecosystem source', () => {
    expect(declaredCrons(ECO)).toEqual({
      'siftersearch-converter': '5 * * * *',
      'siftersearch-book-ingest': '35 * * * *',
    });
  });
  it('omits apps with no cron_restart — a long-running service must never be treated as a cron app', () => {
    expect(declaredCrons(ECO)['siftersearch-api']).toBeUndefined();
  });
  it('never bleeds one app\'s cron onto a previous app that declares none', () => {
    const eco = `{ name: 'siftersearch-api', script: 'a.js' }, { name: 'siftersearch-digest', cron_restart: '50 * * * *' }`;
    expect(declaredCrons(eco)['siftersearch-api']).toBeUndefined();
    expect(declaredCrons(eco)['siftersearch-digest']).toBe('50 * * * *');
  });
  it('returns an empty map for junk rather than throwing', () => {
    expect(declaredCrons('')).toEqual({});
    expect(declaredCrons(null)).toEqual({});
  });
});

describe('driftedApps', () => {
  const declared = { 'siftersearch-converter': '5 * * * *', 'siftersearch-book-ingest': '35 * * * *' };
  it('reports an app pm2 runs on a different schedule than declared', () => {
    const d = driftedApps(declared, [{ name: 'siftersearch-converter', cron: '*/5 * * * *' }]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ name: 'siftersearch-converter', live: '*/5 * * * *', declared: '5 * * * *' });
  });
  it('reports nothing when the schedules agree, ignoring surrounding whitespace', () => {
    expect(driftedApps(declared, [{ name: 'siftersearch-converter', cron: ' 5 * * * * ' }])).toEqual([]);
  });
  it('IGNORES a live app that declares no cron — deleting the API here would be downtime', () => {
    expect(driftedApps(declared, [{ name: 'siftersearch-api', cron: '*/5 * * * *' }])).toEqual([]);
  });
  it('ignores a declared app pm2 reports without a cron at all (never registered as a cron app)', () => {
    expect(driftedApps(declared, [{ name: 'siftersearch-book-ingest', cron: null }])).toEqual([]);
  });
  it('finds every drifted app, not just the first', () => {
    expect(driftedApps(declared, [
      { name: 'siftersearch-converter', cron: '*/5 * * * *' },
      { name: 'siftersearch-book-ingest', cron: '*/5 * * * *' },
    ])).toHaveLength(2);
  });
});
