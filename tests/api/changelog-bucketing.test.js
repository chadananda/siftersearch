// The changelog's "created" number is what the overnight watch reads to answer "are books landing?".
//
// It bucketed every row on deleted_at||updated_at||created_at — LAST TOUCH — while change_type says
// 'created' for anything created inside the window. So any later edit to a recently-created doc dragged it
// into today's bucket, still counted as "created". Relabelling 38 docs' language on 2026-08-14 moved 38
// books out of the 08-14 bucket and made the newest row read created=38 on a day when nothing was ingested.
// The metric reported arrivals that never happened.
import { describe, it, expect } from 'vitest';

// The grouping exactly as routes/admin.js performs it.
function groupByDate(changes) {
  const byDate = {};
  for (const change of changes) {
    const stamp = change.change_type === 'deleted' ? change.deleted_at
      : change.change_type === 'created' ? change.created_at
        : (change.updated_at || change.created_at);
    const date = String(stamp || '').slice(0, 10);
    if (!byDate[date]) byDate[date] = { date, created: 0, updated: 0, deleted: 0 };
    byDate[date][change.change_type]++;
  }
  return byDate;
}

describe('changelog bucketing', () => {
  it('a doc created yesterday and edited today stays in YESTERDAY\'s created count', () => {
    const by = groupByDate([
      { change_type: 'created', created_at: '2026-08-14T10:00:00Z', updated_at: '2026-08-15T03:00:00Z' },
    ]);
    expect(by['2026-08-14'].created).toBe(1);
    expect(by['2026-08-15']).toBeUndefined();     // the edit must not manufacture an arrival
  });

  it('the 38-relabel case: editing 38 recent docs adds ZERO to today', () => {
    const relabelled = Array.from({ length: 38 }, () => (
      { change_type: 'created', created_at: '2026-08-14T12:00:00Z', updated_at: '2026-08-15T03:10:00Z' }));
    const by = groupByDate(relabelled);
    expect(by['2026-08-14'].created).toBe(38);
    expect(by['2026-08-15']).toBeUndefined();
  });

  it('a genuinely new book today DOES count today', () => {
    const by = groupByDate([{ change_type: 'created', created_at: '2026-08-15T01:00:00Z', updated_at: '2026-08-15T01:00:00Z' }]);
    expect(by['2026-08-15'].created).toBe(1);
  });

  it('updates and deletions still bucket on their own timestamps', () => {
    const by = groupByDate([
      { change_type: 'updated', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-08-15T05:00:00Z' },
      { change_type: 'deleted', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-08-10T00:00:00Z', deleted_at: '2026-08-15T06:00:00Z' },
    ]);
    expect(by['2026-08-15'].updated).toBe(1);
    expect(by['2026-08-15'].deleted).toBe(1);
  });
});
