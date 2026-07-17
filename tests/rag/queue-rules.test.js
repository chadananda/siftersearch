// Grounding queue — the concurrency rules that keep parallel books from corrupting the shared entity graph.
// These are executable statements of WHY the queue exists: books on different providers may run together, but
// only ONE may enter the graph-mutating tail (`merge` is global — it takes no docId).
import { describe, it, expect } from 'vitest';
import { ownsTail } from '../../api/lib/pipeline/queue.js';
import { GROUNDING_STAGES } from '../../api/lib/pipeline/run-grounding.js';

describe('grounding queue — one graph-mutating run at a time', () => {
  it('treats an UNBOUNDED run as owning the tail (a full run always reaches project/merge)', () => {
    expect(ownsTail({})).toBe(true);
    expect(ownsTail({ from: 'reconcile' })).toBe(true);   // still runs through to the end
  });

  it('treats a run bounded BEFORE project as tail-free (safe to co-run with a full book)', () => {
    expect(ownsTail({ to: 'research' })).toBe(false);     // the bound we used for Momen
    expect(ownsTail({ to: 'claims' })).toBe(false);
    expect(ownsTail({ to: 'disambiguate' })).toBe(false);
  });

  it('treats a run bounded AT or AFTER project as owning the tail', () => {
    expect(ownsTail({ to: 'project' })).toBe(true);
    expect(ownsTail({ to: 'link' })).toBe(true);
    expect(ownsTail({ to: 'verify' })).toBe(true);
  });

  // Intent, not position: a full run parked in disambiguate for hours will STILL collide at the tail later, so
  // eligibility must be decided by the bound. Deciding on current stage is how two books end up merging at once.
  it('decides by the run BOUND, not by how far along it currently is', () => {
    const fullRunEarly = { to: undefined };
    expect(ownsTail(fullRunEarly)).toBe(true);
  });

  it('project is the first graph-mutating stage, after the per-doc read stages', () => {
    const i = (s) => GROUNDING_STAGES.indexOf(s);
    expect(i('project')).toBeGreaterThan(i('research'));
    expect(i('merge')).toBeGreaterThan(i('project'));
    for (const s of ['disambiguate', 'mentions', 'claims', 'reconcile', 'research']) {
      expect(i(s)).toBeLessThan(i('project'));   // all tail-free
    }
  });
});
