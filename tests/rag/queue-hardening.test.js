// Queue hardening — the fixes for the three race/weakness bugs that dogged the Persian run, exercised on fakes.
import { describe, it, expect } from 'vitest';
import { tryClaimGraphBand } from '../../api/lib/pipeline/lock.js';
import { reachedBound, boundStageOf, budgetStatus, providerForDoc, nowInPeak } from '../../api/lib/pipeline/queue.js';

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
const snap = (o) => ({ queryOne: async () => ({ prose: 100, disamb: 100, hyped: 0, hypeable: 100, mentions: 0, claims: 0, clusters: 0, decisions: 0, ...o }) });

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

  it('HYPE denominator = HYPEABLE paras, not all prose (the 426 false-fail: 185 hyped / 232 prose but complete)', async () => {
    // 47 short fragments (<MINLEN) are skipped by hype → 185 hyped of 185 hypeable = COMPLETE, though 185/232=80%.
    expect(await reachedBound(1, { only: 'hype' }, snap({ prose: 232, disamb: 232, hyped: 185, hypeable: 185 }))).toBe(true);
    // Genuinely incomplete hype still fails against the hypeable denominator.
    expect(await reachedBound(1, { only: 'hype' }, snap({ prose: 232, disamb: 232, hyped: 120, hypeable: 185 }))).toBe(false);
  });
});

// ── Server-side spend gate (the unattended budget backstop) ──────────────────────────────────────────────────
const fakeBudget = (rows, spendByProvider) => ({
  queryAll: async () => rows,
  queryOne: async (_sql, params) => ({ s: spendByProvider[params[0]] ?? 0 }),
});

describe('budgetStatus — per-provider ceiling measured incrementally over baseline', () => {
  it('a provider under its ceiling is neither over nor warn', async () => {
    const [b] = await budgetStatus(fakeBudget([{ provider: 'deepseek', ceiling_usd: 200, baseline_usd: 0, warn_frac: 0.8 }], { deepseek: 50 }));
    expect(b.over).toBe(false); expect(b.warn).toBe(false); expect(b.spent).toBe(50);
  });

  it('warns at warn_frac and blocks at the ceiling', async () => {
    const [warnB] = await budgetStatus(fakeBudget([{ provider: 'deepseek', ceiling_usd: 100, baseline_usd: 0, warn_frac: 0.8 }], { deepseek: 85 }));
    expect(warnB.warn).toBe(true); expect(warnB.over).toBe(false);
    const [overB] = await budgetStatus(fakeBudget([{ provider: 'deepseek', ceiling_usd: 100, baseline_usd: 0, warn_frac: 0.8 }], { deepseek: 105 }));
    expect(overB.over).toBe(true);
  });

  it('baseline is subtracted — a fresh $95 ceiling on top of prior spend', async () => {
    // raw spend 300, baseline 200 → net 100 ≥ ceiling 95 → over.
    const [b] = await budgetStatus(fakeBudget([{ provider: 'anthropic', ceiling_usd: 95, baseline_usd: 200, warn_frac: 0.8 }], { anthropic: 300 }));
    expect(b.spent).toBe(100); expect(b.over).toBe(true);
  });

  it('no budget rows → empty (fail-open on config; the gate only bites once a row exists)', async () => {
    expect(await budgetStatus(fakeBudget([], {}))).toEqual([]);
  });
});

describe('providerForDoc — routes the spend gate to the right ceiling', () => {
  const withLang = (lang) => ({ queryOne: async () => (lang == null ? null : { lang }) });
  it('Persian (fa*) bills to anthropic; everything else to deepseek', async () => {
    expect(await providerForDoc(1, withLang('fa'))).toBe('anthropic');
    expect(await providerForDoc(1, withLang('fa-IR'))).toBe('anthropic');
    expect(await providerForDoc(1, withLang('en'))).toBe('deepseek');
    expect(await providerForDoc(1, withLang('ar'))).toBe('deepseek');
    expect(await providerForDoc(1, withLang(null))).toBe('deepseek');   // unknown → deepseek (never mis-charge anthropic)
  });
});

// ── Off-peak scheduling (save $ across thousands of DeepSeek books) ───────────────────────────────────────────
const at = (utcHH, utcMM = 0) => new Date(Date.UTC(2026, 0, 1, utcHH, utcMM));

describe('nowInPeak — DeepSeek 2× windows in UTC', () => {
  const W = [['01:00', '04:00'], ['06:00', '10:00']];
  it('inside a window = peak; the gaps = off-peak', () => {
    expect(nowInPeak(W, at(2))).toBe(true);    // 02:00 → peak 1
    expect(nowInPeak(W, at(8))).toBe(true);    // 08:00 → peak 2
    expect(nowInPeak(W, at(5))).toBe(false);   // 05:00 → the off-peak gap
    expect(nowInPeak(W, at(15))).toBe(false);  // 15:00 → the long off-peak block
    expect(nowInPeak(W, at(4))).toBe(false);   // end is exclusive → 04:00 is off-peak
    expect(nowInPeak(W, at(1))).toBe(true);    // start is inclusive → 01:00 is peak
  });
  it('handles a window that wraps past UTC midnight', () => {
    const wrap = [['23:00', '03:00']];
    expect(nowInPeak(wrap, at(23, 30))).toBe(true);
    expect(nowInPeak(wrap, at(1))).toBe(true);
    expect(nowInPeak(wrap, at(12))).toBe(false);
  });
});

describe('budgetStatus.peakBlocked — the off-peak launch wall', () => {
  const budgetRow = (extra) => ({
    queryAll: async () => [{ provider: 'deepseek', ceiling_usd: 200, baseline_usd: 0, warn_frac: 0.8, offpeak_only: 1, peak_windows: null, ...extra }],
    queryOne: async () => ({ s: 10 }),
  });
  it('offpeak_only + currently peak → peakBlocked (books stay queued)', async () => {
    const [b] = await budgetStatus({ ...budgetRow(), now: at(2) });   // 02:00 UTC = peak
    expect(b.inPeak).toBe(true); expect(b.peakBlocked).toBe(true); expect(b.over).toBe(false);
  });
  it('offpeak_only but currently off-peak → NOT blocked (books launch)', async () => {
    const [b] = await budgetStatus({ ...budgetRow(), now: at(15) });  // 15:00 UTC = off-peak
    expect(b.inPeak).toBe(false); expect(b.peakBlocked).toBe(false);
  });
  it('flag OFF → never peak-blocked even during a peak window (opt-in)', async () => {
    const [b] = await budgetStatus({ ...budgetRow({ offpeak_only: 0 }), now: at(2) });
    expect(b.peakBlocked).toBe(false);
  });
});
