// /media "Fireside Room" pure helpers: as-you-type search over the listing index, station presets, the seeded jukebox
// layout (box sets / quote / question / waveform / portrait cards), hero highlights, eras, topics, ticker lines and the
// generative record-label pattern. No DOM. Rows are GET /api/media/index rows (api/lib/media/listing-index.js).
// Tested in tests/api/media-listing.test.js.
import { fold } from '../../api/lib/media/listing-index.js';
import { svcFixed } from './imagekit.js';

export { fold };

// ── seeded randomness (stable per day so SSR and the client agree, and the page reads as curated, not noisy) ──
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : hash(String(seed));
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const daySeed = (d = new Date()) => d.toISOString().slice(0, 10);

// ── eras ──
export const decadeOf = (y) => (y ? Math.floor(y / 10) * 10 : null);
export const eraKey = (y) => { const d = decadeOf(y); return d == null ? 'undated' : d < 1950 ? '1940' : d > 2020 ? '2020' : String(d); };
/** CSS custom property for an era's tint (tokens in global.css: --era-1940 … --era-2020, --era-undated). */
export const eraVar = (y) => `var(--era-${eraKey(y)})`;

// ── the payload, made safe to render ──
const str = (v) => (typeof v === 'string' ? v : v == null ? null : String(v));
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const md = (t) => String(t || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[\s*#>_-]+/, '').replace(/[*_`#]+/g, '').replace(/\s+/g, ' ').trim();
/** A citation that is really a file slug or path ("pdf-b-bahaullah, bahaullah_abdul-baha_sacred_writings_book") is not shown. */
export const slugLike = (c) => !c || /(^|[\s,])pdf-|_[a-z]|^[a-z0-9]+(?:[-_][a-z0-9]+){2,}$/.test(String(c).trim()) || /\.(pdf|md|html?)\b/i.test(c);
/** A "quote" that is a table of contents (numbered entries, mostly Title-Cased fragments, a Preface/Contents header). */
export function tocLike(x) {
  const t = String(x || '');
  if (/\b(table of )?contents\b|\bpreface\b\s+[IVX]+\.?/i.test(t)) return true;
  const nums = (t.match(/(^|\s)([IVX]{1,5}|\d{1,3})\.\s/g) || []).length;
  const words = t.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const caps = words.filter((w) => /^[A-Z‘’'“"(]/.test(w)).length;
  return nums >= 2 || (words.length >= 6 && caps / words.length > 0.7);
}
/** A pull-quote made safe to show: markdown stripped, a slug-like citation dropped, a TOC dropped (null). */
export function safeQuote(q) {
  const x = md(q?.x);
  if (x.length < 25 || tocLike(x)) return null;
  const raw = String(q?.c || '').trim(), c = md(raw);
  return { x, c: slugLike(raw) || slugLike(c) ? null : c, t0: num(q?.t0) ?? 0, t1: num(q?.t1) };
}

/** One listing row with every field coerced to the shape the page renders (a changed or partial payload can never throw
 *  mid-render and truncate the page — 10-22 outage: an object where a URL string was expected). null = unusable. */
export function safeItem(it) {
  if (!it || typeof it !== 'object' || typeof it.s !== 'string' || !it.s) return null;
  const q = it.q && typeof it.q === 'object' && typeof it.q.x === 'string' ? safeQuote(it.q) : null;
  return { ...it, t: str(it.t) || it.s, sp: str(it.sp), k: str(it.k), y: num(it.y), d: num(it.d) ?? 0, l: str(it.l) || 'en', g: str(it.g), col: str(it.col), at: str(it.at),
    qn: num(it.qn) ?? 0, cn: num(it.cn) ?? 0, sum: str(it.sum), w: typeof it.w === 'string' ? it.w : '', q,
    tp: arr(it.tp).filter((x) => typeof x === 'string'),
    h: arr(it.h).filter((h) => h && typeof h.x === 'string').map((h) => ({ x: h.x, f: h.f === 'q' ? 'q' : 's', t: num(h.t) })),
    hl: Array.isArray(it.hl) && it.hl.length === 2 ? [num(it.hl[0]) ?? 0, num(it.hl[1]) ?? 20] : [0, 20], v: num(it.v) ?? 0 };
}
/** One speaker row made safe: p a URL string or null; px kept only as { url } / string. */
export function safeSpeaker(s) {
  if (!s || typeof s !== 'object' || typeof s.k !== 'string') return null;
  const px = typeof s.px === 'string' ? s.px : typeof s.px?.url === 'string' ? { ...s.px } : null;
  return { ...s, n: str(s.n) || s.k, c: num(s.c) ?? 0, p: typeof s.p === 'string' ? s.p : null, px, role: str(s.role), y0: num(s.y0), y1: num(s.y1), cr: str(s.cr) };
}
/** The index payload made safe: bad rows dropped (and counted), the rest coerced. */
export function safeIndex(data) {
  const items = arr(data?.items).map(safeItem), speakers = arr(data?.speakers).map(safeSpeaker);
  const dropped = items.filter((x) => !x).length + speakers.filter((x) => !x).length;
  if (dropped) console.warn(`media index: ${dropped} unusable rows skipped`);
  return { ...(data || {}), items: items.filter(Boolean), speakers: speakers.filter(Boolean) };
}

// ── stations (presets) ──
const PILGRIM = /pilgrim|reminiscen|recollection|memories of/i;
const QA = /\bq\s*(?:&|and)\s*a\b|\bquestions?\b|\banswers?\b/i;
export const PRESETS = [
  { id: 'hands', label: 'Hands of the Cause', test: (it, s) => s?.role === 'hand' },
  { id: 'uhj', label: 'House of Justice', test: (it, s) => s?.role === 'uhj' },
  { id: 'scholars', label: 'Scholars & teachers', test: (it, s) => s?.role === 'scholar' },
  { id: 'pilgrim', label: 'Pilgrim notes', test: (it) => PILGRIM.test(`${it.col || ''} ${it.t}`) },
  { id: 'persian', label: 'Persian', test: (it) => it.l === 'fa' || it.l === 'pe' },
  { id: 'qa', label: 'Q&A', test: (it) => QA.test(it.t) || (it.h || []).filter((h) => h.f === 'q').length >= 2 },
  { id: 'video', label: 'Video', test: (it) => it.vid || it.yt },
];
export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

// ── search ──
const LANG = { en: 'english', fa: 'persian farsi', ar: 'arabic', fr: 'french', de: 'german', es: 'spanish' };
const tokens = (s) => fold(s).split(' ').filter(Boolean);

/** Other names a speaker is known by (folded), keyed by a folded fragment of the speaker's own name: titles, maiden and
 *  married names, short forms. A query for any of them finds the speaker's talks. */
export const SPEAKER_ALIASES = {
  'ruhiyyih': "amatul baha amatu'l-baha ruhiyyih rabbani mary maxwell ruhiyyih khanum ruhiyyih khanum khanom",
  'khanum': "amatul baha amatu'l-baha ruhiyyih rabbani mary maxwell",
  'furutan': 'ali akbar furutan aliakbar',
  'khadem': 'dhikrullah zikrullah zekrollah dhikru llah khadem',
  'nakhjavani': 'ali nakhjavani',
  'dunbar': 'hooper dunbar',
  'sears': 'william bill sears',
  'grossmann': 'hartmut hermann grossman',
  'featherstone': 'collis featherstone',
};
const aliasesFor = (sp) => { const f = fold(sp); return Object.entries(SPEAKER_ALIASES).filter(([k]) => f.includes(k)).map(([, v]) => v).join(' '); };

/** Field tokens for one row with weights (speaker and title count most). */
function docFields(it) {
  return [
    [tokens(`${it.sp || ''} ${it.sp ? aliasesFor(it.sp) : ''}`), 5], [tokens(it.t), 4], [tokens([...(it.h || []).map((h) => h.x), ...(it.tp || [])].join(' ')), 2],
    [tokens(`${it.col || ''} ${it.q?.c || ''}`), 1.5], [tokens(`${it.sum || ''} ${it.q?.x || ''}`), 0.6],
    [[...(it.y ? [String(it.y), `${decadeOf(it.y)}s`] : []), ...tokens(LANG[it.l] || it.l), it.vid || it.yt ? 'video' : 'audio', it.yt ? 'youtube' : 'archive'], 1],
  ];
}

/** One edit (insert/delete/substitute/transpose) apart? Short-circuits; for typo tolerance on words of 5+ letters. */
export function within1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Search index: per row its weighted token lists (built once per index). */
export const buildSearch = (items) => items.map((it) => ({ it, f: docFields(it) }));

/** Score of one query token against a row: exact 1, prefix 0.8, one typo (5+ letters) 0.5, × field weight; best field. */
function tokenScore(q, f) {
  let best = 0;
  for (const [toks, w] of f) for (const t of toks) {
    const s = t === q ? 1 : t.startsWith(q) ? 0.8 : q.length >= 5 && t.length >= 4 && !/\d/.test(q) && within1(q, t.slice(0, Math.max(q.length, Math.min(t.length, q.length + 1)))) ? 0.5 : 0;
    if (s * w > best) best = s * w;
  }
  return best;
}

/** Filter + rank: every query token must match somewhere (AND); presets and the decade narrow; speaker key pins one
 *  voice. Without a query the index order (newest first) is kept. → rows */
export function searchItems(index, { q = '', preset = '', decade = null, speaker = '' } = {}, speakersByKey = new Map()) {
  const qt = tokens(q);
  const p = PRESETS.find((x) => x.id === preset);
  const out = [];
  for (const { it, f } of index) {
    if (speaker && it.k !== speaker) continue;
    if (decade && decadeOf(it.y) !== Number(decade)) continue;
    if (p && !p.test(it, speakersByKey.get(it.k))) continue;
    let score = 0, ok = true;
    for (const t of qt) { const s = tokenScore(t, f); if (!s) { ok = false; break; } score += s; }
    if (ok) out.push({ it, score });
  }
  if (qt.length) out.sort((a, b) => b.score - a.score);
  return out.map((x) => x.it);
}

// ── the jukebox layout ──
const QUOTE_MIN = 70;
/** Significance used for card size: priority (repair queue) is NOT significance; quotes, cross-refs, length, grade are. */
export const weight = (it) => (it.qn || 0) * 0.6 + (it.cn || 0) * 0.4 + Math.min(it.d / 1800, 2) + ({ A: 1.5, B: 1, C: 0.5 }[it.g] || 0) + (it.h?.length ? 0.5 : 0);

/**
 * The jukebox: rows (already filtered/ranked) → cards. Speakers with ≥ boxMin talks in view become ONE box-set card (one
 * portrait + record spines), placed where their first talk falls; each box set may also send one portrait-less feature
 * (quote/question) card further down. Other talks become quote / question / portrait / waveform cards by what they hold
 * and a seeded draw; a portrait card never repeats a face shown in the last `faceGap` cards. Size: 'lg' (2×2), 'wide'
 * (2×1), 'tall' (1×2), 'sm'. Deterministic for (rows, seed). → [{ id, kind, size, it?, speaker?, talks? }]
 */
export function planLayout(rows, speakersByKey = new Map(), { seed = 'x', boxMin = 3, faceGap = 6, spines = 12 } = {}) {
  const r = rng(`${seed}:${rows.length}`);
  const byK = new Map();
  for (const it of rows) if (it.k && it.sp) (byK.get(it.k) || byK.set(it.k, []).get(it.k)).push(it);
  const boxed = new Set([...byK].filter(([, v]) => v.length >= boxMin).map(([k]) => k));
  const cards = [], recentFaces = [], deferred = [];
  const faceOk = (k) => !recentFaces.slice(-faceGap).includes(k);
  const pushFace = (k) => recentFaces.push(k);
  const noFace = () => recentFaces.push(null);
  const seenBox = new Set();

  const single = (it) => {
    const s = speakersByKey.get(it.k), x = r(), w = weight(it);
    const hasQ = it.q?.x?.length >= QUOTE_MIN, hasQn = it.h?.some((h) => h.f === 'q');
    let kind;
    if (hasQ && x < 0.34) kind = 'quote';
    else if (hasQn && x < 0.62) kind = 'question';
    else if (s?.p && faceOk(it.k) && x < 0.86) kind = 'portrait';
    else kind = hasQn && x < 0.75 ? 'question' : 'wave';
    if (kind === 'portrait') pushFace(it.k); else noFace();
    const size = kind === 'quote' ? (it.q.x.length > 150 || w > 4 ? 'wide' : 'tall')
      : kind === 'question' ? (r() < 0.3 ? 'wide' : 'sm')
        : kind === 'portrait' ? 'tall'   // a portrait card is always portrait-shaped: a landscape box would crop the head
          : (w > 3 && r() < 0.35 ? 'wide' : 'sm');
    return { id: `${kind}:${it.s}`, kind, size, it };
  };

  for (const it of rows) {
    // a deferred feature card whose distance has come up
    while (deferred.length && deferred[0].at <= cards.length) cards.push(deferred.shift().card);
    if (it.k && boxed.has(it.k)) {
      if (seenBox.has(it.k)) continue;
      seenBox.add(it.k);
      const talks = byK.get(it.k), s = speakersByKey.get(it.k) || { k: it.k, n: it.sp, c: talks.length };
      cards.push({ id: `box:${it.k}`, kind: 'box', size: talks.length >= 8 ? 'lg' : 'tall', speaker: s, total: talks.length,
        talks: talks.slice(0, spines).map((x) => ({ s: x.s, t: x.t, y: x.y, d: x.d })) });
      pushFace(it.k);
      const feat = talks.find((x) => x.q?.x?.length >= QUOTE_MIN) || talks.find((x) => x.h?.some((h) => h.f === 'q'));
      if (feat) {
        const kind = feat.q?.x?.length >= QUOTE_MIN && r() < 0.6 ? 'quote' : feat.h?.some((h) => h.f === 'q') ? 'question' : 'quote';
        deferred.push({ at: cards.length + 3 + Math.floor(r() * 4), card: { id: `${kind}:${feat.s}`, kind, size: kind === 'quote' ? 'wide' : 'sm', it: feat } });
      }
      continue;
    }
    cards.push(single(it));
  }
  for (const d of deferred) cards.push(d.card);
  return cards;
}

// ── hero highlights, eras, topics, ticker ──
/** Up to n talks worth tuning in to: a pull-quote or a question, graded A–C first, varied speakers. Seeded. */
export function pickHighlights(items, speakersByKey = new Map(), { n = 8, seed = 'x' } = {}) {
  const r = rng(`hl:${seed}`);
  // talks with a line to show come first; without any (an index still being built) the best-documented talks do
  const scored = items.map((it) => ({ it, s: (it.q?.x || it.h?.length ? 6 : 0) + weight(it) + (speakersByKey.get(it.k)?.p ? 1.5 : 0) + (it.y ? 1 : 0) + r() * 2 - ({ D: 1, E: 2 }[it.g] || 0) }));
  scored.sort((a, b) => b.s - a.s);
  const out = [], seen = new Set();
  for (const { it } of scored) { if (out.length >= n) break; if (it.k && seen.has(it.k)) continue; seen.add(it.k); out.push(it); }
  for (const { it } of scored) { if (out.length >= n) break; if (!out.includes(it)) out.push(it); }
  // the longest line first: the hero's first frame is then the largest text it will ever show, so a later rotation never
  // registers as a new (later) Largest Contentful Paint
  const len = (it) => highlightLine(it).text.length + (highlightLine(it).kind === 'quote' ? 40 : 0);
  const first = out.reduce((b, it) => (len(it) > len(b) ? it : b), out[0]);
  return out.length ? [first, ...out.filter((x) => x !== first)] : out;
}

/** The line a highlight shows: its pull-quote, else its first question, else a statement subheader, else the summary. */
export function highlightLine(it) {
  const qn = it.h?.find((h) => h.f === 'q');
  if (it.q?.x) return { kind: 'quote', text: it.q.x, cite: it.q.c };
  if (qn) return { kind: 'question', text: qn.x };
  if (it.h?.[0]) return { kind: 'statement', text: it.h[0].x };
  return { kind: 'summary', text: it.sum || it.t };
}

/** Decades with talks: { decade, n, items (up to per, most significant first) }, oldest first. */
export function eras(items, { per = 6 } = {}) {
  const m = new Map();
  for (const it of items) { const d = decadeOf(it.y); if (d == null) continue; (m.get(d) || m.set(d, []).get(d)).push(it); }
  return [...m].sort((a, b) => a[0] - b[0]).map(([decade, list]) => ({ decade, n: list.length, items: [...list].sort((a, b) => weight(b) - weight(a)).slice(0, per) }));
}

/** Top topics across the library: the topic phrases most talks share (folded), then the most significant talks' first. */
export function topTopics(items, n = 18) {
  const m = new Map();
  for (const it of items) for (const t of it.tp || []) {
    if (t.length > 42) continue;
    const k = fold(t);
    const e = m.get(k) || m.set(k, { label: t, n: 0, w: 0 }).get(k);
    e.n++; e.w = Math.max(e.w, weight(it));
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.w - a.w).slice(0, n);
}

/** Call-sign ticker lines: just added, new voices, a few short quotes, the oldest recording. → [{ tag, text, href }] */
export function tickerLines(items, speakers = [], { n = 10 } = {}) {
  const lines = [];
  for (const it of [...items].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 3)) lines.push({ tag: 'Just added', text: `${it.t}${it.sp ? ` · ${it.sp}` : ''}`, href: `/media/${it.s}` });
  for (const s of [...speakers].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 2)) lines.push({ tag: 'New voice', text: `${s.n} · ${s.c} talk${s.c === 1 ? '' : 's'}`, href: `/media?speaker=${encodeURIComponent(s.k)}` });
  for (const it of items.filter((x) => x.q?.x && x.q.x.length < 120).slice(0, 3)) lines.push({ tag: 'Heard', text: `“${it.q.x}” — ${it.q.c || it.sp || ''}`, href: `/media/${it.s}` });
  const oldest = items.filter((x) => x.y).sort((a, b) => a.y - b.y)[0];
  if (oldest) lines.push({ tag: 'From the vault', text: `${oldest.y} · ${oldest.t}`, href: `/media/${oldest.s}` });
  const longest = [...items].sort((a, b) => b.d - a.d)[0];
  if (longest) lines.push({ tag: 'Long listen', text: `${Math.round(longest.d / 60)} min · ${longest.t}`, href: `/media/${longest.s}` });
  return lines.slice(0, n);
}

/** Related talks for a talk page: the same voice first (nearest in year), then talks sharing topic words; never itself.
 *  items: listing-index rows. → up to n rows */
export function relatedTalks(items, slug, n = 6) {
  const me = items.find((x) => x.s === slug);
  if (!me) return [];
  const STOP = new Set(['the', 'and', 'of', 'to', 'in', 'a', 'on', 'for', 'with', 'its', 'his', 'her', 'their', 'from', 'as', 'is', 'by', 'an']);
  const words = (it) => new Set(tokens([...(it.tp || []), ...(it.h || []).map((h) => h.x), it.t].join(' ')).filter((w) => w.length > 3 && !STOP.has(w)));
  const mine = words(me);
  const scored = items.filter((x) => x.s !== slug).map((x) => {
    let shared = 0;
    for (const w of words(x)) if (mine.has(w)) shared++;
    const same = me.k && x.k === me.k;
    return { x, s: (same ? 10 : 0) + shared * 1.5 - (same && me.y && x.y ? Math.abs(me.y - x.y) / 20 : 0) + weight(x) * 0.1 };
  }).filter((r) => r.s > 1);
  scored.sort((a, b) => b.s - a.s);
  // at most 3 by the same voice, so the list also opens a door to others
  const out = [];
  let same = 0;
  for (const r of scored) { if (out.length >= n) break; if (me.k && r.x.k === me.k) { if (same >= 3) continue; same++; } out.push(r.x); }
  return out;
}

/** Clean transcript text for display: markdown links → their words, editorial [brackets] dropped (the words kept),
 *  stray markup removed, spaces normalised. */
export function cleanSnippet(text) {
  return String(text || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\(https?:[^)\s]*\)/g, '').replace(/[[\]]/g, '')
    .replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
}

/** A passage windowed AROUND the first match of the query (≈ max chars), with the matched words marked: exact, prefix,
 *  one-letter typo (5+ letters) or shared 5-letter stem count. → { lead, parts: [{ t, hit }], tail } (lead/tail '…'). */
export function snippetAround(text, query, max = 220) {
  const clean = cleanSnippet(text);
  const q = tokens(query).filter((t) => t.length >= 2);
  const words = [...clean.matchAll(/\S+/g)].map((m) => ({ w: m[0], i: m.index, f: fold(m[0]).replace(/ /g, '') }));
  const isHit = (f) => !!f && q.some((t) => f === t || (t.length >= 3 && f.startsWith(t)) || (t.length >= 5 && f.length >= 4 && (within1(t, f) || within1(t, f.slice(0, t.length))))
    || (t.length >= 6 && f.length >= 6 && f.slice(0, 5) === t.slice(0, 5)));
  const hits = words.map((x) => isHit(x.f));
  let first = hits.indexOf(true);
  if (first < 0) first = 0;
  // the window: start a little before the first hit, then as many words as fit
  let a = first, used = words[first]?.w.length || 0;
  while (a > 0 && used + words[a - 1].w.length + 1 < max * 0.35) { a--; used += words[a].w.length + 1; }
  let b = first;
  while (b < words.length - 1 && used + words[b + 1].w.length + 1 < max) { b++; used += words[b].w.length + 1; }
  while (a > 0 && used + words[a - 1].w.length + 1 < max) { a--; used += words[a].w.length + 1; }
  const parts = [];
  for (let k = a; k <= b; k++) {
    const t = (k > a ? ' ' : '') + words[k].w, hit = hits[k];
    const last = parts[parts.length - 1];
    if (!hit) { if (last && !last.hit) last.t += t; else parts.push({ t, hit: false }); continue; }
    // mark the word, not the punctuation around it ("Guardian," → Guardian + ",")
    const [, pre, core, post] = words[k].w.match(/^([“"‘'(\[]*)(.*?)([.,;:!?…”"’')\]]*)$/);
    const lead = (k > a ? ' ' : '') + pre;
    if (lead) { if (last && !last.hit) last.t += lead; else parts.push({ t: lead, hit: false }); }
    parts.push({ t: core || words[k].w, hit: true });
    if (post) parts.push({ t: post, hit: false });
  }
  return { lead: a > 0 ? '…' : '', parts, tail: b < words.length - 1 ? '…' : '' };
}

/** Transcript hits grouped by talk, in hit order: [{ slug, hits: [...] }], at most `talks` talks. */
export function groupHits(hits = [], talks = 8) {
  const m = new Map();
  for (const h of hits) { if (!m.has(h.slug)) { if (m.size >= talks) continue; m.set(h.slug, []); } m.get(h.slug).push(h); }
  return [...m].map(([slug, list]) => ({ slug, hits: list }));
}

// ── pictures ──
/** Initials for a generated label: up to two letters from the folded name's significant words. */
export function initials(name) {
  const w = fold(name).split(' ').filter((x) => x && !['the', 'of', 'and', 'hand', 'cause', 'dr', 'mr', 'mrs'].includes(x));
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
}

/** The generative record label for a name: rays, ring count, groove offset, rotation, and the pattern style. */
export function labelPattern(name) {
  const h = hash(fold(name) || 'voice');
  return { rays: 8 + (h % 9) * 2, rings: 2 + ((h >>> 4) % 3), rot: (h >>> 8) % 360, style: ['sunburst', 'rings', 'chevron'][(h >>> 12) % 3], gap: 3 + ((h >>> 16) % 4) };
}

/** A face-centred square portrait at size px (1×/2×) through the image service. fo-face crops a square around the
 *  detected person's head, keeping the full height of a landscape source; squares and 4:5 never lose the head. */
export const portraitSquare = (url, px) => (url ? svcFixed(url, px, px, { q: 80, extra: 'fo-face,e-sharpen' }) : null);
/** The picture for a tall/wide crop: the speaker's EXTENDED (outpainted) master when the index carries one — `px` is
 *  { url, width, height } (or a URL string) — else the portrait. Never throws on an unexpected shape. */
export const tallSrc = (s) => (typeof s?.px === 'string' ? s.px : typeof s?.px?.url === 'string' ? s.px.url : null) || (typeof s?.p === 'string' ? s.p : null);
/** The jukebox's tall portrait card (≈ 5:8, the card's own shape): a face-centred crop that only trims the sides. */
export const portraitCard = (url, w) => (url ? svcFixed(url, w, Math.round(w * 1.6), { q: 78, extra: 'fo-face,e-sharpen' }) : null);
export const portraitTall = (url, w) => (url ? svcFixed(url, w, Math.round(w * 1.25), { q: 80, extra: 'fo-face,e-sharpen' }) : null);

/** "1 h 12 min" / "38 min" / "52 s". */
export function duration(s) {
  s = Math.round(s || 0);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** The peaks of one stretch of a talk (a moment) from its BBC audiowaveform JSON → `bars` heights in 0..1 (loudest = 1). */
export function waveWindow(wf, t0, t1, bars = 64) {
  const d = wf?.data, ch = Number(wf?.channels) || 1, pps = (Number(wf?.sample_rate) || 8000) / (Number(wf?.samples_per_pixel) || 400);
  if (!Array.isArray(d) || !(t1 > t0)) return [];
  const pairs = Math.floor(d.length / (2 * ch)), a = Math.max(0, Math.floor(t0 * pps)), b = Math.min(pairs, Math.ceil(t1 * pps));
  if (b <= a) return [];
  const per = (b - a) / bars, out = [];
  for (let i = 0; i < bars; i++) {
    let m = 0;
    for (let j = a + Math.floor(i * per); j < Math.min(b, a + Math.floor((i + 1) * per) || a + 1); j++) { const o = j * 2 * ch; m = Math.max(m, Math.abs(d[o]), Math.abs(d[o + 1])); }
    out.push(m);
  }
  const top = Math.max(1, ...out);
  return out.map((m) => Math.max(0.06, m / top));
}

/** Wave string (a … z per point) → heights in 0..1. */
export const waveHeights = (w) => [...String(w || '')].map((c) => Math.max(0.06, (c.charCodeAt(0) - 96) / 26));
