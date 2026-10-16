// The Observatory (home page) — pure helpers: ring geometry, number formatting, live interpolation between snapshots,
// which ring a running job feeds, and how a terminal line is coloured. Tested in tests/lib/observatory.test.js.

/** Point on a circle; angle in degrees, 0 = up (12 o'clock), clockwise. */
export function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** SVG path of an annular sector (a ring cell) from `a0` to `a1` degrees between radii r0 < r1. */
export function arcPath(cx, cy, r0, r1, a0, a1) {
  if (a1 - a0 <= 0.0001) return '';
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0);
  const f = (n) => n.toFixed(2);
  return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`;
}

/** Layout of the dial: traditions share the circle minus a gap at the top (where ring names sit); rings stack outward. */
export function dialLayout(traditions, rings, { inner = 128, outer = 432, gapDeg = 34, padDeg = 0.9, ringGap = 3 } = {}) {
  const span = 360 - gapDeg, per = span / Math.max(1, traditions.length);
  const width = (outer - inner) / Math.max(1, rings.length);
  return {
    sectors: traditions.map((t, i) => ({ id: t, a0: gapDeg / 2 + i * per + padDeg / 2, a1: gapDeg / 2 + (i + 1) * per - padDeg / 2 })),
    bands: rings.map((r, i) => ({ id: r, r0: inner + i * width + ringGap / 2, r1: inner + (i + 1) * width - ringGap / 2 })),
  };
}

/** Filled share of a cell: done/total, with a visible sliver for any non-zero progress. */
export function fillDeg(done, total, a0, a1, minDeg = 0.7) {
  if (!total || !done) return 0;
  return Math.min(a1 - a0, Math.max(minDeg, ((a1 - a0) * done) / total));
}

/** 8489697 → "8.49M"; 12345 → "12.3K"; exact when small. */
export function compact(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString('en-US');
}
export const exact = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
export const pct = (done, total, digits = 1) => (!total ? '—' : `${((100 * done) / total).toFixed(done && done / total < 0.001 ? 2 : digits)}%`);
export const rate = (perHour) => (!perHour ? '' : `${perHour > 0 ? '+' : '−'}${compact(Math.abs(perHour))}/h`);

/** A counter between snapshots: value + rate × hours since the snapshot (never below the measured value). */
export const interpolate = (value, perHour, sinceSec) => (value == null ? null : value + Math.max(0, perHour || 0) * Math.max(0, sinceSec) / 3600);

/** 3725 → "1h 02m"; 95 → "1m 35s". */
export function duration(sec) {
  if (sec == null) return '—';
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Which ring a running ops job is feeding (drives the particle streams). */
export function ringOfJob(name, label = '') {
  if (name === 'phrase-index') return /hype/.test(label) ? 'hype' : /concept/.test(label) ? 'concepts' : 'phrase';
  return { 'hype-index': 'hype', 'concept-index': 'concepts', 'section-index': 'sections', 'coverage-refresh': 'text', 'ingest-files': 'text', 'known-item': 'keyword' }[name] || null;
}

/** Colour class of a terminal line: by kind, and probes by outcome. */
export function lineTone(line) {
  if (line.kind === 'probe') return /→ #1\b/.test(line.text) ? 'hit1' : /→ #\d/.test(line.text) ? 'hit' : 'miss';
  if (line.kind === 'job') return /^✗/.test(line.text) ? 'error' : /^■/.test(line.text) ? 'warn' : 'job';
  return line.kind;
}

/** Sparkline path for values in a w×h box (flat line when constant). */
export function sparkPath(values, w = 120, h = 24) {
  const v = values.filter((x) => typeof x === 'number');
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  return v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * w).toFixed(1)} ${(h - ((x - min) / span) * (h - 2) - 1).toFixed(1)}`).join('');
}
