// Queue hardening — the fixes for the three race/weakness bugs that dogged the Persian run, exercised on fakes.
import { describe, it, expect } from 'vitest';
import { tryClaimGraphBand } from '../../api/lib/pipeline/lock.js';
import { reachedBound, boundStageOf } from '../../api/lib/pipeline/queue.js';

// A tiny in-memory stand-in for the ONE-row grounding_locks table + the single writer. It applies the atomic
// UPDATE-WHERE exactly as SQLite would, so two "processes" (sequential awaits, as the real writer serialises them)
// contend for real. Returns the {rows:[{changes}]} shape db.query yields for writes.
function fakeBand() {
  const row = { holder: null, acquired_at: null };
  let now = 1000;
  const q = async (sql, params) => {
    if (/UPDATE grounding_locks SET holder = \?, acquired_at = unixepoch\(\)/.test(sql)) {
      const [holder, , self, staleSec] = params;
      const free = row.holder === null || row.holder === self || row.acquired_at <= now - staleSec;
      if (!free) return { rows: [{ changes: 0 }] };
      row.holder = holder; row.acquired_at = now;
      return { rows: [{ changes: 1 }] };
    }
    throw new Error('unexpected sql');
  };
  return { q, row, tick: (s) => { now += s; } };
}

describe('graph-band mutex — atomic claim via the single writer', () => {
  it('grants the band to the first caller and refuses the second (concurrency serialised)', async () => {
    const b = fakeBand();
    expect(await tryClaimGraphBand(101, { query: b.q })).toBe(true);   // A claims
    expect(await tryClaimGraphBand(202, { query: b.q })).toBe(false);  // B blocked
    expect(b.row.holder).toBe(101);
  });

  it('is re-entrant: the holder can re-claim its own band', async () => {
    const b = fakeBand();
    await tryClaimGraphBand(101, { query: b.q });
    expect(await tryClaimGraphBand(101, { query: b.q })).toBe(true);
  });

  it('steals a STALE holder so a crashed run never wedges the band forever', async () => {
    const b = fakeBand();
    await tryClaimGraphBand(101, { query: b.q, staleMs: 60_000 });     // A holds
    expect(await tryClaimGraphBand(202, { query: b.q, staleMs: 60_000 })).toBe(false); // fresh → B blocked
    b.tick(120);                                                       // 120s later, A's hold is stale
    expect(await tryClaimGraphBand(202, { query: b.q, staleMs: 60_000 })).toBe(true);  // B steals
    expect(b.row.holder).toBe(202);
  });
});

// reachedBound with an injected queryOne returning a canned artifact snapshot.
const snap = (o) => ({ queryOne: async () => ({ prose: 100, disamb: 100, hyped: 0, mentions: 0, claims: 0, clusters: 0, decisions: 0, ...o }) });

describe('reachedBound — verifies the run\'s OWN bound stage, not just disambiguation', () => {
  it('bound stage = the last stage asked (only, else to, else verify)', () => {
    expect(boundStageOf({ only: 'hype' })).toBe('hype');
    expect(boundStageOf({ to: 'research' })).toBe('research');
    expect(boundStageOf({ from: 'project' })).toBe('verify');
    expect(boundStageOf({})).toBe('verify');
  });

  it('a read-half (to:research) is NOT done if reconcile produced no decisions (the Vols 6/7/9 bug)', async () => {
    // 100% disambiguated but 0 decisions against 500 clusters → reconcile never finished → FAILED, not done.
    expect(await reachedBound(1, { to: 'research' }, snap({ clusters: 500, decisions: 0, claims: 10, mentions: 50 }))).toBe(false);
    // decisions cover ≥85% of clusters → reconcile really completed → done.
    expect(await reachedBound(1, { to: 'research' }, snap({ clusters: 500, decisions: 450, claims: 10, mentions: 50 }))).toBe(true);
  });

  it('a claims-bounded run needs claims rows; a mentions-bounded run needs mentions', async () => {
    expect(await reachedBound(1, { to: 'claims' }, snap({ mentions: 50, claims: 0 }))).toBe(false);
    expect(await reachedBound(1, { to: 'claims' }, snap({ mentions: 50, claims: 10 }))).toBe(true);
    expect(await reachedBound(1, { to: 'mentions' }, snap({ mentions: 0 }))).toBe(false);
  });

  it('an only:hype run needs most prose to have questions', async () => {
    expect(await reachedBound(1, { only: 'hype' }, snap({ hyped: 40 }))).toBe(false);   // 40/100 < 90%
    expect(await reachedBound(1, { only: 'hype' }, snap({ hyped: 95 }))).toBe(true);
  });

  it('anything short of 98% disambiguated fails regardless of bound (the 6%/26% crash cases)', async () => {
    expect(await reachedBound(1, { to: 'research' }, snap({ disamb: 6, clusters: 10, decisions: 10 }))).toBe(false);
    expect(await reachedBound(1, {}, snap({ prose: 0 }))).toBe(false);   // empty doc
  });
});
