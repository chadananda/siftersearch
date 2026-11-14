// Media library (/media) pure helpers shared by MediaBrowser + MediaPlayer: listing query ↔ URL params, duration buckets,
// word-time lookup (binary search over aligned word starts), paragraph segmentation around quote spans, speaker turns.
// No DOM, no deps (time parsing/formatting lives in api/lib/media/range.js). Tested in tests/api/media-frontend.test.js.

import { svcFixed } from './imagekit.js';
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

/** A picture at one fixed SIZE: a speaker portrait goes through the site's image service with the SAME helper and the same
 *  face-centred crop the biography portraits use (src/lib/imagekit.js svcFixed, fo-face); a generated SVG tile is used as
 *  is. → { src, srcset } (1× / 2×). */
export function picture(url, w, h = w, { photo = true } = {}) {
  if (!url) return { src: null, srcset: null };
  if (!photo || !/^(https:\/\/siftersearch\.com)?\/img\//.test(url)) return { src: url, srcset: null };
  return svcFixed(url, w, h, { q: 80, extra: 'fo-face,e-sharpen' });
}

/** The published file URL of an item (thumb.jpg, waveform.json, …), relative to the API origin. */
export const mediaFile = (slug, name) => `/api/media/${encodeURIComponent(slug)}/file/${String(name).split('/').map(encodeURIComponent).join('/')}`;

/** The audio record without the original copy's URLs: the player never plays or exposes the original (Chad 10-29/10-31). */
export function remasterOnly(audio) {
  if (!audio) return audio;
  const { original_url, original_ogg, ...rest } = audio;
  return rest;
}

/** A cached page and refreshed talk API are safe to combine only when they share a published item revision. */
export function sameMediaRevision(pageVersion, apiVersion) {
  const page = Number(pageVersion), fresh = Number(apiVersion);
  return Number.isSafeInteger(page) && page > 0 && page === fresh;
}

/** A transcript paragraph as the talk page ships it (page weight, 11-14): the word tuples become the words' text joined by
 *  single spaces (tx) and their timings as centiseconds, a (gap since the previous word's end, length) pair per word,
 *  comma-joined (tm); hid lists the words the copy edit dropped. A paragraph whose words cannot round-trip is kept whole.
 *  timed: false leaves tm out (the page ships it only where a ?t range needs it; the rest arrive after first paint). */
export function compactParagraph(p, { timed = true } = {}) {
  const { words, s0, sentences, ...rest } = p || {};
  if (!Array.isArray(words) || words.some((w) => !w?.[0] || /\s/.test(w[0]))) return p;
  const tm = [], hid = [];
  let prev = 0;
  words.forEach((w, i) => {
    const a = Math.round((Number(w[1]) || 0) * 100), b = Math.round((Number(w[2]) || 0) * 100);
    tm.push(a - prev, b - a); prev = b;
    if (w[3]) hid.push(i);
  });
  return { ...rest, tx: words.map((w) => w[0]).join(' '), ...(timed ? { tm: tm.join(',') } : {}), ...(hid.length ? { hid } : {}) };
}

/** compactParagraph reversed: words [[text, s, e(, 1 = dropped)]] back from tx/tm/hid; a full paragraph passes through.
 *  Without tm every word spans the whole paragraph [t0, t1] and the paragraph is marked untimed (applyTimings fills it):
 *  a time still finds its paragraph, and a click plays from the paragraph's start. */
export function expandParagraph(p) {
  if (!p || p.words || p.tx == null) return p;
  const { tx, tm, hid, ...rest } = p;
  const texts = tx ? tx.split(' ') : [], times = tm ? tm.split(',').map(Number) : [], drop = new Set(hid || []);
  if (tm == null) {
    const a = Number(p.t0) || 0, b = Number(p.t1) || a;
    return { ...rest, untimed: true, words: texts.map((w, i) => (drop.has(i) ? [w, a, b, 1] : [w, a, b])) };
  }
  let at = 0;
  const words = texts.map((w, i) => {
    const a = at + (times[2 * i] || 0), b = a + (times[2 * i + 1] || 0);
    at = b;
    return drop.has(i) ? [w, a / 100, b / 100, 1] : [w, a / 100, b / 100];
  });
  return { ...rest, words };
}

/** The visible text of words [i0, i1) exactly as the word spans render it: outside a link each shown word is followed by a
 *  space; inside a link the shown words are separated by spaces (no trailing one). Dropped words (w[3]) show nothing. */
export function segmentText(words, i0, i1, inLink = false) {
  let out = '';
  for (let i = i0; i < i1; i++) {
    const w = words[i];
    if (w[3]) continue;
    out += w[0] + (!inLink || i < i1 - 1 ? ' ' : '');
  }
  return out;
}

/** The word under a caret offset in a segment's plain text (segmentText): its index in the paragraph. Past the end → the
 *  last shown word. */
export function segmentWordAt(words, i0, i1, text, offset) {
  const ord = String(text).slice(0, Math.max(0, offset)).split(' ').length - 1;
  let n = -1, last = i0;
  for (let i = i0; i < i1; i++) {
    if (words[i]?.[3]) continue;
    n++; last = i;
    if (n === ord) return i;
  }
  return last;
}

/** Paragraphs ([{ words: [[text, s, e], …] }]) → flat arrays in reading order: starts, ends, paragraph index, word index. */
export function flattenWords(paragraphs = []) {
  const n = paragraphs.reduce((a, p) => a + (p.words?.length || 0), 0);
  const starts = new Float64Array(n), ends = new Float64Array(n), para = new Int32Array(n), idx = new Int32Array(n);
  let k = 0;
  paragraphs.forEach((p, pi) => (p.words || []).forEach((w, wi) => { starts[k] = Number(w[1]) || 0; ends[k] = Number(w[2]) || 0; para[k] = pi; idx[k] = wi; k++; }));
  return { starts, ends, para, idx, length: n };
}

/** Copy word timings from full paragraphs (the API's, same revision) into the untimed ones and their flat entries, in
 *  place; a paragraph whose word count differs stays untimed. Returns how many were filled. */
export function applyTimings(paragraphs, flat, paraStart, full = []) {
  let n = 0;
  paragraphs.forEach((p, pi) => {
    const ws = full[pi]?.words;
    if (!p?.untimed || !Array.isArray(ws) || ws.length !== p.words.length) return;
    ws.forEach((w, i) => {
      const s = Number(w[1]) || 0, e = Number(w[2]) || 0, k = paraStart[pi] + i;
      p.words[i][1] = s; p.words[i][2] = e; flat.starts[k] = s; flat.ends[k] = e;
    });
    delete p.untimed; n++;
  });
  return n;
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

/** A click on the transcript: the word element to seek to, or null. A click inside a link (a linked quotation, a person, a
 *  work) OPENS the link — links are prioritised over play position (Chad 10-23); only a plain Alt-click on a link plays it. */
export function transcriptClickWord(e) {
  const el = e?.target?.closest?.('[data-k]') || e?.target?.closest?.('[data-s]');   // a word span, or plain text not yet split
  if (!el) return null;
  const link = e.target.closest('a');
  if (!link) return el;
  return e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.button ?? 0) === 0 ? el : null;
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
