// anis-jev-timeouts report (11-10): per day, how many Anís turns had a Jev call time out, by call (triage/strategy/lookup/…)
// and outcome (answered on retry | fail open), and what the backup (jev-backup.js) did — how often a turn would fail open.
// Deps: anis-threads-repo (anisJevTimeoutRows).
const parse = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

/** rows [{ day, timeouts, fallback }] → { days: [{ day, turns, timeout_turns, rate_pct, by_call: { call: { outcome: n } }, fallback: { by: n } }], totals }. Pure. */
export function jevTimeoutStats(rows = []) {
  const days = new Map();
  for (const r of rows) {
    const d = days.get(r.day) || { day: r.day, turns: 0, timeout_turns: 0, failed_open_turns: 0, by_call: {}, fallback: {} };
    d.turns++;
    const t = parse(r.timeouts);
    if (Array.isArray(t) && t.length) {
      d.timeout_turns++;
      if (t.some((x) => x?.outcome === 'fail open')) d.failed_open_turns++;
      for (const x of t) { const c = (d.by_call[x?.call || '?'] ||= {}); c[x?.outcome || '?'] = (c[x?.outcome || '?'] || 0) + 1; }
    }
    const f = parse(r.fallback);
    if (f?.by) d.fallback[f.by] = (d.fallback[f.by] || 0) + 1;
    days.set(r.day, d);
  }
  const list = [...days.values()].sort((a, b) => String(b.day).localeCompare(String(a.day))).map((d) => ({ ...d, rate_pct: pct(d.timeout_turns, d.turns), fail_open_pct: pct(d.failed_open_turns, d.turns) }));
  const sum = (k) => list.reduce((n, d) => n + d[k], 0);
  const totals = { turns: sum('turns'), timeout_turns: sum('timeout_turns'), failed_open_turns: sum('failed_open_turns') };
  return { days: list, totals: { ...totals, rate_pct: pct(totals.timeout_turns, totals.turns), fail_open_pct: pct(totals.failed_open_turns, totals.turns) } };
}

export async function anisJevTimeoutsReport({ days = 7 } = {}, { rowsFn = null } = {}) {
  const rows = await (rowsFn || (await import('../repos/anis-threads-repo.js')).anisJevTimeoutRows)({ days });
  return { window_days: Number(days) || 7, ...jevTimeoutStats(rows) };
}
