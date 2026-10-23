// SILENCE TRIM (Chad 10-23: "many scanned cassettes had very long silences at the beginning. we need to somehow trim these
// without damaging the audio"). Non-destructive: the archive master is never touched; only the WEB copies start at the
// cut (offset `start_s`) and end at `end_s`, with a 300 ms fade-in / 500 ms fade-out. Every stored time (words, paragraphs,
// moments, links, sections, ?t= links) stays in ORIGINAL time; the one conversion is webTime()/originalTime() at the
// three places that read a web copy (player, clip cut, short cut). Long inner gaps (a tape flip) are never cut — the
// player skips them and the transcript shows a divider. Pure.

export const LEAD_PAD_S = 1.0, TAIL_PAD_S = 2.0, FADE_IN_S = 0.3, FADE_OUT_S = 0.5, MIN_TRIM_S = 5, GAP_MIN_S = 20;

/** Original (master) time → the web copy's time, and back. trim: meta.trim (or null). */
export const webTime = (t, trim) => Math.max(0, Number(t) - (trim?.start_s || 0));
export const originalTime = (t, trim) => Number(t) + (trim?.start_s || 0);

/** Where speech energy is: indexes of peaks (0–1, `pps` per second) above a level set from the loud part of the talk
 *  (25 % of its 95th percentile, at least 0.05) — tape hiss sits far below that. → { first, last } seconds, or null. */
export function energySpan(peaks = [], pps = 20) {
  const v = (peaks || []).map((x) => Math.abs(Array.isArray(x) ? Math.max(Math.abs(x[0] || 0), Math.abs(x[1] || 0)) : Number(x) || 0));
  if (!v.length) return null;
  const sorted = [...v].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const lvl = Math.max(0.05, p95 * 0.25);
  // sustained: at least 0.3 s above the level in a 0.5 s window (a click or a tape thump is not speech)
  const win = Math.max(1, Math.round(pps * 0.5)), need = Math.max(1, Math.round(pps * 0.3));
  const loud = (i) => { let n = 0; for (let k = i; k < Math.min(v.length, i + win); k++) if (v[k] >= lvl) n++; return n >= need; };
  let first = -1, last = -1;
  for (let i = 0; i < v.length; i++) if (v[i] >= lvl && loud(i)) { first = i; break; }
  for (let i = v.length - 1; i >= 0; i--) if (v[i] >= lvl && loud(Math.max(0, i - win + 1))) { last = i; break; }
  return first < 0 ? null : { first: first / pps, last: (last + 1) / pps, level: lvl };
}

/** The trim plan from the aligned words (original time) + the energy envelope: the cut is at the earlier of the first
 *  word and the first sustained speech energy (an untranscribed spoken announcement is never cut) minus 1 s; the end at
 *  the later of the last word and the last energy plus 2 s. Inner gaps ≥ 20 s between words with no speech energy are
 *  marked to skip (never cut). A leading or trailing silence under 5 s is left alone. → { start_s, end_s, gaps, lead_s, tail_s } */
export function trimPlan({ words = [], peaks = [], pps = 20, duration = null } = {}) {
  const ws = words.filter((w) => w && w.s != null && w.e != null && String(w.w ?? '').trim()).sort((a, b) => a.s - b.s);
  const dur = Number(duration) || (peaks.length ? peaks.length / pps : ws.length ? ws[ws.length - 1].e : 0);
  if (!ws.length || !dur) return { start_s: 0, end_s: null, gaps: [], lead_s: 0, tail_s: 0 };
  const en = energySpan(peaks, pps);
  const onset = Math.min(ws[0].s, en ? en.first : Infinity), offset = Math.max(ws[ws.length - 1].e, en ? en.last : -Infinity);
  const cut = Math.max(0, onset - LEAD_PAD_S), stop = Math.min(dur, offset + TAIL_PAD_S);
  const start_s = cut >= MIN_TRIM_S ? Math.round(cut * 100) / 100 : 0;
  const end_s = dur - stop >= MIN_TRIM_S ? Math.round(stop * 100) / 100 : null;
  const gaps = [];
  const v = (peaks || []).map((x) => Math.abs(Array.isArray(x) ? Math.max(Math.abs(x[0] || 0), Math.abs(x[1] || 0)) : Number(x) || 0));
  for (let i = 1; i < ws.length; i++) {
    const a = ws[i - 1].e, b = ws[i].s;
    if (b - a < GAP_MIN_S) continue;
    // speech energy inside the gap (an untranscribed stretch) → not a dead gap
    const lo = Math.floor((a + 1) * pps), hi = Math.ceil((b - 1) * pps);
    // DEAD: the whole gap near-silent (95th percentile under 40 % of the speech level) — quiet music, a hum of voices or an
    // untranscribed reading is not dead and is never skipped (the first audit marked 258 'gaps', many of them music)
    const inside = v.slice(lo, hi).sort((x, y) => x - y);
    const p95 = inside.length ? inside[Math.floor(inside.length * 0.95)] : 0;
    const dead = !en || p95 < en.level * 0.4;
    if (dead) gaps.push({ from: Math.round((a + 1) * 100) / 100, to: Math.round((b - 1) * 100) / 100 });
  }
  return { start_s, end_s, gaps, lead_s: Math.round(ws[0].s * 10) / 10, tail_s: Math.round((dur - ws[ws.length - 1].e) * 10) / 10 };
}

/** The ffmpeg arguments that cut a web copy to the plan, with the fades (input options before -i, filter after). */
export function trimArgs(plan, duration) {
  const start = plan.start_s || 0, end = plan.end_s ?? duration;
  const len = Math.max(0.5, end - start);
  const af = `afade=t=in:st=0:d=${FADE_IN_S},afade=t=out:st=${Math.max(0, len - FADE_OUT_S).toFixed(2)}:d=${FADE_OUT_S}`;
  return { pre: ['-ss', start.toFixed(2), '-t', len.toFixed(2)], af };
}

/** Is t (original time) inside a gap to skip? → the gap's end, else null. */
export function skipTo(t, gaps = []) { for (const g of gaps || []) if (t >= g.from && t < g.to) return g.to; return null; }

/** waveform.json (audiowaveform v2: interleaved min/max int8, sample_rate / samples_per_pixel per second) → 0–1 peaks + pps. */
export function peaksOf(wave) {
  if (!wave?.data?.length) return { peaks: [], pps: 20 };
  const out = new Array(Math.floor(wave.data.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = Math.max(Math.abs(wave.data[2 * i]), Math.abs(wave.data[2 * i + 1])) / 128;
  return { peaks: out, pps: (wave.sample_rate || 8000) / (wave.samples_per_pixel || 400) };
}
