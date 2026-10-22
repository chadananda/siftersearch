// The /media LISTING INDEX (GET /api/media/index): one compact row per published talk (title, speaker, year, duration,
// language, kind, grade, best quotation, top topic subheaders, 48-point waveform, a ~20 s highlight window) + one row per
// speaker (portrait, count, role). Pure shaping here; the builder takes injected readers and keeps a per-item cache keyed
// by updated_at (persisted to a temp file) so a restart never re-parses every transcript. Callers: routes/media.js.

/** Fold for matching: no diacritics, no ‘ayn/hamza marks, lower case, single spaces. */
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼʻ`´'"“”]/g, '')
  .toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim();

// Hands of the Cause and Universal House of Justice members, folded; surname-only labels the archive uses are included
// where they are unambiguous ("Sears", "D Khadem"). Grossmann: Hermann (Hand, d. 1968) vs Hartmut (House, 1993–2008).
const HANDS = ['william sears', 'sears', 'dhikrullah khadem', 'd khadem', 'khadem', 'collis featherstone', 'featherstone', 'ali akbar furutan',
  'furutan', 'ruhiyyih khanum', 'amatul baha ruhiyyih khanum', 'khanum', 'abul qasim faizi', 'faizi', 'john robarts', 'robarts', 'enoch olinga', 'olinga',
  'rahmatullah muhajir', 'muhajir', 'hasan balyuzi', 'balyuzi', 'ugo giachery', 'giachery', 'ali muhammad varqa', 'varqa', 'paul haney', 'haney',
  'john ferraby', 'tarazullah samandari', 'samandari', 'musa banani', 'shuaullah alai', 'horace holley', 'leroy ioas', 'amelia collins',
  'dorothy baker', 'george townshend', 'agnes alexander', 'adelbert muhlschlegel', 'jalal khazeh', 'corinne true', 'clara dunn', 'hermann grossmann',
  'martha root', 'louis gregory', 'siegfried schopflocher', 'john esslemont', 'keith ransom kehler'];
const UHJ = ['ali nakhjavani', 'nakhjavani', 'hooper dunbar', 'dunbar', 'hartmut grossmann', 'ian semple', 'douglas martin', 'peter khan', 'farzam arbab',
  'kiser barnes', 'glenford mitchell', 'hushmand fatheazam', 'david hofman', 'amoz gibson', 'borrah kavelin', 'charles wolcott', 'lutfullah hakim',
  'david ruhe', 'adib taherzadeh', 'taherzadeh', 'paul lample', 'gustavo correa', 'firaydoun javaheri', 'payman mohajer', 'stephen birkland',
  'shahriar razavi', 'ayman rouhani', 'juan francisco mora', 'albert nshisu', 'praveen mallik', 'andrej donoval', 'stephen hall'];
const HAND_SET = new Set(HANDS), UHJ_SET = new Set(UHJ);
const strip = (f) => f.replace(/^(?:hand of the cause(?: of god)? |mr |mrs |dr |prof |counsellor |jinab i |amatul baha )+/, '').trim();

/** A speaker's station: 'hand' | 'uhj' | 'scholar' (any other named voice) | null (no speaker). */
export function speakerRole(name, { year = null } = {}) {
  const f = strip(fold(name));
  if (!f) return null;
  if (f === 'grossmann' || f === 'grossman' || f === 'h grossmann') return year && year <= 1968 ? 'hand' : 'uhj';
  if (HAND_SET.has(f)) return 'hand';
  if (UHJ_SET.has(f)) return 'uhj';
  // "William B. Sears", "Mr. Hooper C. Dunbar": try the first + last token
  const t = f.split(' '), fl = t.length > 2 ? `${t[0]} ${t[t.length - 1]}` : null;
  if (fl && HAND_SET.has(fl)) return 'hand';
  if (fl && UHJ_SET.has(fl)) return 'uhj';
  return 'scholar';
}

/** The folded speaker slug the listing groups by (the row's speaker_key when the pipeline set one). */
export const groupKey = (row) => row.speaker_key || (row.speaker ? fold(row.speaker).replace(/ /g, '-') : null);

const WAVE_CHARS = 'abcdefghijklmnopqrstuvwxyz';
/** BBC audiowaveform JSON → `n` peaks (0..1) as a string of letters a (quiet) … z (loud), loudest = z. '' when none. */
export function waveString(wf, n = 48) {
  const d = wf?.data, ch = Number(wf?.channels) || 1;
  if (!Array.isArray(d) || d.length < 4) return '';
  const pairs = Math.floor(d.length / (2 * ch)), per = pairs / n, out = [];
  let top = 1;
  for (let b = 0; b < n; b++) {
    let sum = 0, cnt = 0;
    const i0 = Math.floor(b * per), i1 = Math.max(i0 + 1, Math.floor((b + 1) * per));
    for (let i = i0; i < Math.min(pairs, i1); i++) { const o = i * 2 * ch; sum += Math.max(Math.abs(d[o]), Math.abs(d[o + 1])); cnt++; }
    const m = cnt ? sum / cnt : 0;   // mean peak per bucket: a single cough does not flatten the rest
    out.push(m); if (m > top) top = m;
  }
  // speech sits in a narrow band: stretch min..max so the talk's own shape (pauses, applause, a raised voice) shows
  const lo = Math.min(...out);
  const span = Math.max(1e-9, top - lo);
  return out.map((m) => WAVE_CHARS[Math.max(1, Math.min(25, Math.round((0.2 + 0.8 * ((m - lo) / span)) * 25)))]).join('');
}

/** Trim a passage to a pull-quote: whole sentences up to ~max chars, else a word boundary + '…'. */
export function pullQuote(text, max = 220) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const sentences = s.match(/[^.!?]+[.!?]+["”’)]*\s*/g) || [];
  let out = '';
  for (const x of sentences) { if ((out + x).length > max) break; out += x; }
  if (out.trim().length >= 60) return out.trim();
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '')}…`;
}

/** The talk's best quotation for a pull-quote card: printed + verbatim first, then a readable length. */
export function bestQuote(quotes = []) {
  const score = (q) => (q.gate === 'printed' ? 3 : 0) + (q.basis === 'verbatim' ? 2 : 0) + (q.excerpt?.length >= 70 ? 2 : 0) + (q.excerpt?.length > 500 ? -1 : 0);
  const best = quotes.filter((q) => q?.excerpt && q.excerpt.length >= 40).sort((a, b) => score(b) - score(a))[0];
  if (!best) return null;
  return { x: pullQuote(best.excerpt, 200), c: best.cite || best.writer || null, t0: Number(best.t0) || 0, t1: Number(best.t1) || null };
}

/** Up to n topic subheaders, questions first (they make the best headlines), in talk order within each form. */
export function topHeadings(headings = [], n = 3) {
  const ok = headings.filter((h) => h?.text && h.text.length <= 110);
  const q = ok.filter((h) => h.form === 'question'), s = ok.filter((h) => h.form !== 'question');
  return [...q, ...s].slice(0, n).map((h) => ({ x: h.text, f: h.form === 'question' ? 'q' : 's', t: h.t != null ? Math.round(h.t) : null }));
}

/** ~20 s to preview: the best quotation, else the first question, else 12 % into the talk. → [t0, t1] */
export function highlightWindow({ quote, heads, duration }, span = 20) {
  const d = Number(duration) || 0;
  let t0 = quote ? Math.max(0, quote.t0 - 1) : heads?.find((h) => h.f === 'q' && h.t != null)?.t ?? Math.round(d * 0.12);
  if (d && t0 + span > d) t0 = Math.max(0, d - span);
  return [Math.round(t0), Math.round(t0 + (d ? Math.min(span, d) : span))];
}

/** A full-playback row's web rendition URLs (API-relative), or null for a clips/search item. */
export const audioUrls = (it) => (it?.v ? { ogg: `/api/media/${it.s}/file/web/${it.s}.ogg?v=${it.v}`, m4a: `/api/media/${it.s}/file/web/${it.s}.m4a?v=${it.v}` } : null);

/** One DB row + its files (meta.json, transcript.json quotes, waveform.json) → the compact listing row. */
export function shapeRow(row, { meta = null, quotes = [], wave = null } = {}) {
  const heads = topHeadings((meta?.headings || []).map((h) => ({ ...h, t: h.t ?? null })));
  const quote = bestQuote(quotes);
  const v = meta?.version || 1;
  const playback = row.playback || 'clips';
  return {
    s: row.slug, t: row.title || meta?.title || row.slug, sp: row.speaker || null, k: groupKey(row), y: row.year || null,
    d: Math.round(row.duration_s || 0), l: (row.language || 'en').toLowerCase().slice(0, 2), vid: !!row.has_video, yt: row.source_kind === 'youtube',
    g: row.grade || null, pb: playback, col: row.collection || null, at: row.updated_at ? String(row.updated_at).slice(0, 19) : null, qn: row.quotes_n || 0,
    cn: row.crs_n || 0, sum: meta?.summary ? pullQuote(meta.summary, 150) : null,
    tp: (meta?.topics || []).filter((x) => typeof x === 'string').slice(0, 4), h: heads, q: quote, w: waveString(wave),
    hl: highlightWindow({ quote, heads, duration: row.duration_s }),
    // audience 1–5 (assess stage) and up to three verified moments (key, words, start ms, kind) for the dial / ticker
    au: meta?.audience?.score ?? null,
    mo: (meta?.moments || []).slice(0, 3).map((m) => ({ k: m.key, x: pullQuote(m.text, 200), t: m.t0_ms, kd: m.kind })),
    v: playback === 'full' ? v : 0,   // full playback: the web rendition is /api/media/<s>/file/web/<s>.{ogg,m4a}?v=<v> (audioUrls)
  };
}

/** Speakers of the listing: one per person (group key), with count, years, portrait and role; most talks first. */
export function shapeSpeakers(items, speakerRows = [], photoOf = () => null) {
  const byKey = new Map(speakerRows.map((s) => [s.key, s]));
  const out = new Map();
  for (const it of items) {
    if (!it.k || !it.sp) continue;
    let s = out.get(it.k);
    if (!s) {
      const row = byKey.get(it.k), photo = row ? photoOf(row) : null;
      s = { k: it.k, n: row?.name || it.sp, c: 0, p: photo?.url || null, px: photo?.extended || null, cr: photo?.credit || null, role: null, y0: null, y1: null, at: null };
      out.set(it.k, s);
    }
    s.c++;
    if (it.y) { s.y0 = Math.min(s.y0 ?? it.y, it.y); s.y1 = Math.max(s.y1 ?? it.y, it.y); }
    if (it.at && (!s.at || it.at < s.at)) s.at = it.at;   // first appearance → "new voice"
  }
  for (const s of out.values()) s.role = speakerRole(s.n, { year: s.y0 });
  return [...out.values()].sort((a, b) => b.c - a.c || a.n.localeCompare(b.n));
}

/** Build (or refresh) the index. rows: published DB rows (with dir, updated_at); readItem(row) → { meta, quotes, wave };
 *  cache: Map id → { at, row }. Re-reads only rows whose updated_at changed, at most `budget` per call (the rest stay
 *  pending and are reported). → { items, pending } in rows' order. */
export async function buildIndex(rows, { readItem, cache = new Map(), budget = Infinity } = {}) {
  const items = [];
  let read = 0, pending = 0;
  for (const r of rows) {
    const hit = cache.get(r.id);
    if (hit && hit.at === r.updated_at) { items.push(hit.row); continue; }
    if (read >= budget) { pending++; items.push(hit?.row || shapeRow(r)); continue; }
    read++;
    let files = {};
    try { files = (await readItem(r)) || {}; } catch { files = {}; }
    const row = shapeRow(r, files);
    cache.set(r.id, { at: r.updated_at, row });
    items.push(row);
  }
  return { items, pending, read };
}
