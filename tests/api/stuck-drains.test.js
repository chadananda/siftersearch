// A service draining longer than 10 min is named with the job holding it (10-22: #2819 held reports 30+ min).
import { describe, it, expect } from 'vitest';
import { stuckDrains } from '../../scripts/lib/stuck-drains.mjs';

const now = Date.parse('2026-10-23T06:50:00Z');
describe('stuckDrains', () => {
  it('names a service draining > 10 min and the job it holds; a short drain or a running one is fine', () => {
    const r = stuckDrains([
      { name: 'siftersearch-reports', pid: 1, health: 'draining', draining_since: '2026-10-23T06:22:53Z', doing: ['dewey-scout #2819'] },
      { name: 'siftersearch-indexer', pid: 2, health: 'draining', draining_since: '2026-10-23T06:45:00Z', doing: [] },
      { name: 'siftersearch-api', pid: 3, health: 'running' },
    ], { now });
    expect(r.stuck).toEqual([{ name: 'siftersearch-reports', minutes: 27, doing: ['dewey-scout #2819'] }]);
  });
  it('a heartbeat without draining_since (older code) is timed from when a check first saw it draining', () => {
    const svc = [{ name: 'siftersearch-reports', pid: 9, health: 'draining', doing: ['dewey-scout #2819'] }];
    const first = stuckDrains(svc, { now: now - 15 * 60_000 });
    expect(first.stuck).toEqual([]);
    const later = stuckDrains(svc, { now, seen: first.seen });
    expect(later.stuck).toMatchObject([{ name: 'siftersearch-reports', minutes: 15 }]);
    // a new pid (restarted) starts over
    expect(stuckDrains([{ ...svc[0], pid: 10 }], { now, seen: first.seen }).stuck).toEqual([]);
  });
});
