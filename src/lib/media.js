// Media library (/media) pure helpers shared by MediaBrowser + MediaPlayer: listing query ↔ URL params, duration buckets,
// word-time lookup (binary search over aligned word starts), paragraph segmentation around quote spans, speaker turns.
// No DOM, no deps (time parsing/formatting lives in api/lib/media/range.js). Tested in tests/api/media-frontend.test.js.

export const DURATION_BUCKETS = [
  { id: 'short', label: 'Under 15 min', maxDur: 900 },
  { id: 'medium', label: '15–45 min', minDur: 900, maxDur: 2700 },
  { id: 'long', label: '45 min – 1½ h', minDur: 2700, maxDur: 5400 },
  { id: 'xlong', label: 'Over 1½ h', minDur: 5400 },
];

export const SORTS = [
  { id: 'recent', label: 'Recently added' },
  { id: 'title', label: 'Title' },
  { id: 'year', label: 'Year (newest)' },
  { id: 'speaker', label: 'Speaker' },
];

const FILTER_KEYS = ['q', 'speaker', 'tradition', 'collection', 'year', 'language', 'dur', 'hasVideo', 'sort'];

/** URLSearchParams (or a plain object) → the listing filters the page keeps ({ q, speaker, …, dur, hasVideo, sort }). */
export function filtersFromParams(params) {
  const get = (k) => (typeof params?.get === 'function' ? params.get(k) : params?.[k]) ?? '';
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, String(get(k)).trim()]));
  if (!DURATION_BUCKETS.some((b) => b.id === f.dur)) f.dur = '';
  if (!SORTS.some((s) => s.id === f.sort)) f.sort = '';
  if (f.hasVideo && f.hasVideo !== '1') f.hasVideo = '';
  return f;
}

/** Filters → the page's own query string (only what is set; default sort omitted). */
export function pageQuery(f) {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f?.[k] && !(k === 'sort' && f[k] === 'recent')) p.set(k, f[k]);
  return p.toString();
}

/** Filters → the GET /api/media query string (dur bucket → minDur/maxDur). */
export function apiQuery(f, { limit = 48, offset = 0 } = {}) {
  const p = new URLSearchParams();
  for (const k of ['q', 'speaker', 'tradition', 'collection', 'year', 'language', 'hasVideo', 'sort']) if (f?.[k]) p.set(k, f[k]);
  const b = DURATION_BUCKETS.find((x) => x.id === f?.dur);
  if (b?.minDur) p.set('minDur', String(b.minDur));
  if (b?.maxDur) p.set('maxDur', String(b.maxDur));
  p.set('limit', String(limit));
  if (offset) p.set('offset', String(offset));
  return p.toString();
}

/** The published file URL of an item (thumb.jpg, waveform.json, …), relative to the API origin. */
export const mediaFile = (slug, name) => `/api/media/${encodeURIComponent(slug)}/file/${String(name).split('/').map(encodeURIComponent).join('/')}`;

/** Paragraphs ([{ words: [[text, s, e], …] }]) → flat arrays in reading order: starts, ends, paragraph index, word index. */
export function flattenWords(paragraphs = []) {
  const n = paragraphs.reduce((a, p) => a + (p.words?.length || 0), 0);
  const starts = new Float64Array(n), ends = new Float64Array(n), para = new Int32Array(n), idx = new Int32Array(n);
  let k = 0;
  paragraphs.forEach((p, pi) => (p.words || []).forEach((w, wi) => { starts[k] = Number(w[1]) || 0; ends[k] = Number(w[2]) || 0; para[k] = pi; idx[k] = wi; k++; }));
  return { starts, ends, para, idx, length: n };
}

/** Index of the word playing at time t: the last word whose start ≤ t (−1 before the first). Binary search; starts ascending. */
export function wordAt(starts, t) {
  let lo = 0, hi = starts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** One paragraph's words split around its quote spans: [{ i0, i1, quote|null }] covering [0, nWords) in order.
 *  Quotes are { i0, i1 (exclusive) }; overlapping or out-of-range spans are clipped/skipped. */
export function paragraphSegments(nWords, quotes = []) {
  const segs = [];
  let at = 0;
  for (const q of [...quotes].sort((a, b) => a.i0 - b.i0)) {
    const i0 = Math.max(at, Number(q.i0) || 0), i1 = Math.min(nWords, Number(q.i1) || 0);
    if (i1 <= i0) continue;
    if (i0 > at) segs.push({ i0: at, i1: i0, quote: null });
    segs.push({ i0, i1, quote: q });
    at = i1;
  }
  if (at < nWords) segs.push({ i0: at, i1: nWords, quote: null });
  return segs;
}

/** Speaker label per paragraph: the NAME where it changes, null elsewhere (and everywhere when only one voice). A voice the
 *  description could not name (a diarization fragment, "S77") gets no label — the pilot showed a raw id on every few lines. */
export function speakerLabels(paragraphs = [], speakers = {}) {
  const voices = new Set(paragraphs.map((p) => p.spk).filter(Boolean));
  if (voices.size < 2) return paragraphs.map(() => null);
  let prev = null;
  return paragraphs.map((p) => {
    const name = p.spk ? speakers?.[p.spk] || null : null;
    const label = name && name !== prev ? name : null;
    if (name) prev = name;
    return label;
  });
}

/** A YouTube watch URL opening at t seconds (whole seconds; t ≤ 0 leaves it unchanged). */
export function youtubeAtTime(url, t) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.delete('t');
    if (t > 0) u.searchParams.set('t', `${Math.floor(t)}s`);
    return u.toString();
  } catch { return url; }
}

/** BBC audiowaveform JSON ({ data: [min, max, …], channels? }) → `bars` peak heights in 0..1. */
export function waveformBars(wf, bars = 160) {
  const d = wf?.data, ch = Number(wf?.channels) || 1;
  if (!Array.isArray(d) || d.length < 2) return [];
  const pairs = Math.floor(d.length / (2 * ch));
  const per = Math.max(1, pairs / bars), out = [];
  let top = 1;
  for (let b = 0; b < Math.min(bars, pairs); b++) {
    let m = 0;
    for (let i = Math.floor(b * per); i < Math.min(pairs, Math.floor((b + 1) * per) || 1); i++) {
      const o = i * 2 * ch;
      m = Math.max(m, Math.abs(d[o]), Math.abs(d[o + 1]));
    }
    out.push(m); top = Math.max(top, m);
  }
  return out.map((m) => Math.max(0.06, m / top));
}
