import { describe, it, expect } from 'vitest';
import { recordWrite, drainWriteStats, peekWriteStats } from '../../api/lib/write-stats.js';

describe('write stats (single-writer observability)', () => {
  it('aggregates per minute × caller × name, then drains as upserts', () => {
    const at = Date.parse('2026-10-11T19:00:10Z');
    recordWrite({ caller: 'deep-research', name: 'heartbeat', statements: 1, changes: 1, ms: 3, at });
    recordWrite({ caller: 'deep-research', name: 'heartbeat', statements: 1, changes: 1, ms: 9, at });
    recordWrite({ caller: 'reingest-document.js', name: 'replace', statements: 500, changes: 500, ms: 40, error: true, at });
    const view = peekWriteStats();
    expect(view.find((r) => r.caller === 'deep-research')).toMatchObject({ minute: '2026-10-11T19:00', batches: 2, ms_total: 12, ms_max: 9 });
    const stmts = drainWriteStats();
    expect(stmts).toHaveLength(2);
    expect(stmts[0].sql).toMatch(/ON CONFLICT \(minute, caller, name\)/);
    expect(peekWriteStats()).toEqual([]);
  });
});
