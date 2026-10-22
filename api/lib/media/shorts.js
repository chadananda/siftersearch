// AUDIOGRAM SHORTS (Chad 10-22: shareable excerpts as video shorts; "aligned audio text … a few fancy templates and
// alternate"): a vertical 1080×1920 (or 1:1 1080×1080) H.264/AAC clip of a moment or any range ≤ 60 s (≤ 180 s on request).
// Captions come from OUR word alignment (clean words, word-accurate), phrase-grouped (2–6 words, broken at pauses and
// punctuation), the current word highlighted; a sidecar .srt/.vtt goes with every short. Five TEMPLATES, chosen by content
// (old or poor recordings → Archive Tape; a quotation of the Writings in the range → Scripture Insert) else rotated
// deterministically per moment: On Air · Archive Tape · Scripture Insert · Portrait Cinema · Minimal. All carry the speaker,
// the talk and year, Listening Room branding (call sign WSFT), an end card with the short URL, and keep inside the platform
// safe area (Shorts/Reels overlays: no text in the bottom ~22 % or the right ~12 %). This module builds the ASS file, the
// sidecars and the render spec (pure); scripts/media/render_short.py on boss composes the picture with ffmpeg.
import { createHash } from 'crypto';

export const SHORT_VERSION = 5;   // 4: Portrait Cinema default, uniform face-centred Ken Burns on the extended master, light styling   // 3: bitrate cap, static archive grain (keys change: the edge caches by key)
export const FORMATS = { vertical: { W: 1080, H: 1920 }, square: { W: 1080, H: 1080 } };
export const TEMPLATES = ['on-air', 'archive-tape', 'scripture-insert', 'portrait-cinema', 'minimal'];
const ROTATION = ['on-air', 'portrait-cinema', 'minimal'];
export const MAX_DEFAULT = 60, MAX_ALLOWED = 180, END_CARD = 3, CALL_SIGN = 'WSFT';
const C = { amber: '&H3AB2F2&', cream: '&HDCEEF6&', white: '&HFFFFFF&', ink: '&H1A1F24&', dim: '&H8C969E&', sepia: '&H6E9BC4&', glow: '&H2A8FF0&' };

/** The cache key: same talk version, range, format and template → same file. */
export const shortKey = ({ slug, start, end, format, template, version = 1 }) =>
  createHash('sha1').update(`${slug}|${Number(start).toFixed(2)}|${Number(end).toFixed(2)}|${format}|${template}|${version}|${SHORT_VERSION}`).digest('hex').slice(0, 12);

/** Validate a request → { start, end, format } or throws. */
export function clampRange({ start, end, format = 'vertical', max = MAX_DEFAULT }, duration = Infinity) {
  const s = Number(start), e = Number(end), cap = Math.min(MAX_ALLOWED, Number(max) || MAX_DEFAULT);
  if (!FORMATS[format]) throw new Error(`format must be ${Object.keys(FORMATS).join(' or ')}`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) throw new Error('start/end must be seconds, start < end');
  if (e - s > cap) throw new Error(`a short is at most ${cap} s`);
  if (s >= duration) throw new Error('start is past the end of the recording');
  return { start: Math.round(s * 100) / 100, end: Math.round(Math.min(e, duration) * 100) / 100, format };
}

/** The shown (clean) words inside [start, end], times relative to start. */
export function clipWords(paragraphs, start, end) {
  const out = [];
  for (const p of paragraphs || []) {
    if (p.t1 < start || p.t0 > end) continue;
    for (const w of p.words) {
      const [txt, s, e, hide] = Array.isArray(w) ? w : [w.w, w.s, w.e, w.hide];
      if (hide || s == null || e == null || e <= start || s >= end) continue;
      out.push({ w: txt, s: Math.max(0, s - start), e: Math.min(end, e) - start });
    }
  }
  return out;
}

/** Caption phrases: 2–6 words (≤ maxChars), broken after punctuation or before a pause ≥ 0.45 s; a lone word joins the next. */
export function captionLines(words, { maxWords = 6, maxChars = 28, minWords = 2 } = {}) {
  const lines = [];
  let cur = [];
  const flush = () => { if (cur.length) lines.push(cur); cur = []; };
  words.forEach((w, i) => {
    const chars = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
    if (cur.length >= minWords && (cur.length >= maxWords || chars > maxChars)) flush();
    cur.push(w);
    const next = words[i + 1];
    if (cur.length >= minWords && (/[.!?…;:,]["”’)]*$/.test(w.w) || (next && next.s - w.e >= 0.45))) flush();
  });
  flush();
  return lines;
}

/** The template for a short: asked for, else Scripture Insert when the range quotes the Writings, else Portrait Cinema
 *  (Chad 10-22: "#2 is best"; no rotation — the others stay available on request). */
export function pickTemplate({ asked = null, scripture = false } = {}) {
  if (asked && TEMPLATES.includes(asked)) return { template: asked, why: 'asked' };
  if (scripture) return { template: 'scripture-insert', why: 'quotes the Writings' };
  return { template: 'portrait-cinema', why: 'default' };
}

/** A quotation or cross-reference of the Writings inside the range (for Scripture Insert). */
export function scriptureIn(quotes = [], crossRefs = [], start, end) {
  const hit = [...quotes, ...crossRefs].filter((q) => q.excerpt && q.t0 != null && q.t0 >= start - 1 && q.t0 <= end);
  return hit.length ? { excerpt: hit[0].excerpt, cite: hit[0].cite || hit[0].writer || '' } : null;
}

// ── sidecar captions ──
const srtT = (t, sep) => { const ms = Math.round(Math.max(0, t) * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`; };
export function srtOf(words) {
  return captionLines(words).map((l, i) => `${i + 1}\n${srtT(l[0].s, ',')} --> ${srtT(l.at(-1).e, ',')}\n${l.map((w) => w.w).join(' ')}\n`).join('\n');
}
export function vttOf(words) {
  return `WEBVTT\n\n${captionLines(words).map((l) => `${srtT(l[0].s, '.')} --> ${srtT(l.at(-1).e, '.')}\n${l.map((w) => w.w).join(' ')}\n`).join('\n')}`;
}

// ── ASS building blocks ──
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\n/g, ' ');
const ts = (t) => { const x = Math.max(0, t); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = x % 60; return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
const K = 0.5523;
/** An ASS vector circle of radius r centred on the drawing origin. */
const circle = (r) => { const k = Math.round(K * r); return `m 0 ${-r} b ${k} ${-r} ${r} ${-k} ${r} 0 b ${r} ${k} ${k} ${r} 0 ${r} b ${-k} ${r} ${-r} ${k} ${-r} 0 b ${-r} ${-k} ${-k} ${-r} 0 ${-r}`; };
const rect = (w, h) => `m 0 0 l ${w} 0 ${w} ${h} 0 ${h}`;
/** A citation short enough for one line: author and work, no incipit or bracketed note (≤ 56 chars, at a word). */
export const shortCite = (c) => { let t = String(c || '').replace(/\s*\([^)]*\)\s*$/, '').split(/[!?…]|\.{2,}/)[0].trim(); if (t.length > 56) t = `${t.slice(0, 56).replace(/\s+\S*$/, '')}…`; return t; };
/** Wrap words into lines of ≤ n chars (for the Minimal page and the scripture card). */
const wrap = (text, n) => { const out = []; let cur = ''; for (const w of String(text).split(/\s+/)) { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out; };

function styles(sq) {
  const f = (v) => Math.round(sq ? v * 0.78 : v);
  // Name, Font, Size, Primary, Secondary, Outline, Back, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
  return [
    `Style: Cap,Noto Sans,${f(80)},${C.white},${C.white},&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,5,2,5,0,0,0,1`,
    `Style: CardCap,Noto Sans,${f(64)},${C.ink},${C.ink},${C.cream},&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    `Style: Type,Liberation Mono,${f(62)},${C.cream},${C.cream},&H00201810,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,7,0,0,0,1`,
    `Style: Kinetic,Noto Sans,${f(150)},${C.white},${C.white},&H00000000,&H80000000,-1,0,0,0,100,100,-2,0,1,7,4,5,0,0,0,1`,
    `Style: Quote,Noto Serif,${f(74)},${C.white},${C.white},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Name,Noto Sans,${f(56)},${C.white},${C.white},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1`,
    `Style: Title,Noto Serif,${f(42)},${C.cream},${C.cream},&H00000000,&H00000000,0,-1,0,0,100,100,0,0,1,2,0,5,0,0,0,1`,
    `Style: Brand,Noto Sans,${f(30)},${C.amber},${C.amber},&H00000000,&H00000000,-1,0,0,0,100,100,6,0,1,1,0,5,0,0,0,1`,
    `Style: Small,Noto Sans,${f(28)},${C.cream},${C.cream},&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,1,0,5,0,0,0,1`,
    `Style: Card,Noto Serif,${f(46)},${C.ink},${C.ink},&H00000000,&H00000000,0,-1,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Shape,Noto Sans,20,${C.white},${C.white},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: End,Noto Sans,${f(62)},${C.white},${C.white},&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,1,3,0,5,0,0,0,1`,
  ];
}

/**
 * The ASS file. spec: { template, format, words, speaker, title, year, url, clip, scripture: { excerpt, cite } | null }.
 * Times are relative to the clip; the end card follows for END_CARD seconds.
 */
export function buildAss({ template = 'on-air', format = 'vertical', words = [], speaker = '', title = '', year = null, url = 'siftersearch.com', clip, scripture = null }) {
  const { W, H } = FORMATS[format];
  const sq = format === 'square';
  const s = (v) => Math.round(sq ? v * (H / 1920) * 1.0 : v);     // vertical positions scaled for the square format
  const ev = [];
  const at = (st, t0, t1, text, x, y, an = 5, layer = 1, tags = '') => { if (t1 > t0) ev.push(`Dialogue: ${layer},${ts(t0)},${ts(t1)},${st},,0,0,0,,{\\an${an}\\pos(${Math.round(x)},${Math.round(y)})${tags}}${text}`); };
  const shape = (t0, t1, x, y, path, colour, { layer = 0, alpha = '00', blur = 0, extra = '' } = {}) =>
    at('Shape', t0, t1, `{\\p1}${path}{\\p0}`, x, y, 7, layer, `\\bord0\\shad0\\1c${colour}\\1a&H${alpha}&${blur ? `\\blur${blur}` : ''}${extra}`);
  const total = clip + END_CARD;
  const cx = W / 2, safeX = 90;
  const lines = captionLines(words);
  const titleLine = esc([title, year].filter(Boolean).join(' · '));

  // a line shown word by word with the current word highlighted (colour codes per template)
  // a phrase's last word holds until the next phrase starts (≤ 2.5 s), so a pause never leaves an empty caption
  const hold = (li, w) => Math.min(clip, lines[li + 1] ? Math.min(lines[li + 1][0].s - 0.12, w.e + 2.5) : w.e + 1.2);
  const highlight = (st, y, cur, rest, an = 5, x = cx) => lines.forEach((line, li) => line.forEach((w, k) => {
    const t0 = k === 0 ? Math.max(0, w.s - 0.12) : w.s;
    const t1 = k + 1 < line.length ? line[k + 1].s : Math.max(w.e, hold(li, w));
    at(st, t0, t1, line.map((x2, j) => (j === k ? `{\\c${cur}}${esc(x2.w)}{\\c${rest}}` : esc(x2.w))).join(' '), x, y, an, 3);
  }));

  if (template === 'on-air') {
    // the tuning dial across the decades, needle at the talk's year; the amber valve glow; captions on a cream card
    const dy = s(150), dx0 = safeX, dw = W - 2 * safeX;
    shape(0, clip, dx0, dy - 50, rect(dw, 120), '&H101418&', { alpha: '30' });
    for (let yr = 1920; yr <= 2020; yr += 10) {
      const x = dx0 + 40 + ((yr - 1920) / 100) * (dw - 80);
      shape(0, clip, x - 2, dy - 30, rect(4, yr % 50 === 0 ? 40 : 26), C.cream, { alpha: '40' });
      if (yr % 20 === 0) at('Small', 0, clip, String(yr), x, dy + 34, 5, 2);
    }
    const yx = year ? dx0 + 40 + ((Math.min(2020, Math.max(1920, Number(year))) - 1920) / 100) * (dw - 80) : cx;
    shape(0, clip, yx - 3, dy - 46, rect(6, 96), C.amber, { layer: 2 });
    shape(0, clip, cx, s(1180), circle(170), C.glow, { alpha: '90', blur: 60, extra: `\\t(0,${Math.round(clip * 1000)},\\1a&H70&)` });
    at('Brand', 0, clip, `ON AIR  ·  THE LISTENING ROOM  ·  ${CALL_SIGN}`, cx, s(270), 5, 2);
    at('Name', 0, clip, esc(speaker), cx, s(1180), 5, 2);
    at('Title', 0, clip, titleLine, cx, s(1250), 5, 2);
    shape(0, clip, safeX, s(1330), rect(W - 2 * safeX, s(150)), C.cream, { layer: 1, extra: '\\bord0' });
    highlight('CardCap', s(1405), C.amber.replace('3AB2F2', '1E6FC9'), C.ink);
  } else if (template === 'archive-tape') {
    // two reels turning (spoke circles rotating), tape between them, typewriter captions that type word by word
    for (const rx of [W * 0.3, W * 0.7]) {
      shape(0, clip, rx, s(380), circle(170), '&H2A3440&', { layer: 1 });
      shape(0, clip, rx, s(380), circle(40), C.sepia, { layer: 2 });
      for (let a = 0; a < 3; a++) at('Shape', 0, clip, `{\\p1}${rect(16, 150)}{\\p0}`, rx, s(380), 5, 2,
        `\\bord0\\shad0\\1c${C.sepia}\\org(${Math.round(rx)},${s(380)})\\frz${a * 120}\\t(0,${Math.round(clip * 1000)},\\frz${a * 120 - clip * 90})`);
    }
    shape(0, clip, W * 0.3, s(545), rect(W * 0.4, 8), '&H202A33&', { layer: 1 });
    shape(0, clip, 0, s(590), rect(W, s(260)), '&H0A0C10&', { layer: 1, alpha: '50' });
    shape(0, clip, 0, s(900), rect(W, s(480)), '&H0A0C10&', { layer: 1, alpha: '60' });
    at('Brand', 0, clip, `FROM THE ARCHIVE  ·  ${CALL_SIGN}`, cx, s(640), 5, 2);
    at('Name', 0, clip, esc(speaker), cx, s(730), 5, 2);
    at('Title', 0, clip, titleLine, cx, s(800), 5, 2);
    lines.forEach((line, li) => line.forEach((w, k) => {
      const t0 = w.s, t1 = k + 1 < line.length ? line[k + 1].s : Math.max(w.e, hold(li, w));
      at('Type', t0, t1, wrap(line.slice(0, k + 1).map((x) => esc(x.w)).join(' '), 22).join('\\N') + '▌', safeX + 10, s(980), 7, 3);
    }));
  } else if (template === 'scripture-insert') {
    // the speaker's words above; the passage they quote on a card below, with its citation
    at('Brand', 0, clip, `THE LISTENING ROOM  ·  ${CALL_SIGN}`, cx, s(150), 5, 2);
    at('Name', 0, clip, esc(speaker), cx, s(240), 5, 2);
    at('Title', 0, clip, titleLine, cx, s(305), 5, 2);
    highlight('Cap', s(560), C.amber, C.white);
    const card = scripture ? wrap(`“${scripture.excerpt}”`, sq ? 44 : 40).slice(0, sq ? 4 : 8) : [];
    if (card.length) {
      const top = s(820), h = 70 + card.length * Math.round(sq ? 42 : 58) + 90;
      shape(0, clip, safeX, top, rect(W - 2 * safeX, h), C.cream, { layer: 1 });
      shape(0, clip, safeX, top, rect(12, h), C.amber, { layer: 2 });
      at('Card', 0, clip, card.map(esc).join('\\N'), safeX + 50, top + 45, 7, 2);
      at('Small', 0, clip, `{\\c${C.ink}}— ${esc(shortCite(scripture.cite))}`, safeX + 50, top + h - 45, 4, 2);
    }
  } else if (template === 'portrait-cinema') {
    // big kinetic captions, one word at a time with a small pop, over the slowly zooming portrait
    at('Name', 0, clip, esc(speaker), cx, s(200), 5, 2);
    at('Title', 0, clip, titleLine, cx, s(265), 5, 2);
    shape(0, clip, cx - 120, s(1392), rect(240, 3), C.amber, { layer: 2, alpha: '30' });
    at('Brand', 0, clip, `THE LISTENING ROOM  ·  ${CALL_SIGN}`, cx, s(1420), 5, 2);
    words.forEach((w, i) => {
      const t1 = i + 1 < words.length ? Math.min(words[i + 1].s, w.e + 0.6) : Math.min(clip, w.e + 0.5);
      at('Kinetic', w.s, t1, esc(w.w), cx, s(1050), 5, 3, '\\fscx88\\fscy88\\t(0,120,\\fscx100\\fscy100)');
    });
  } else {
    // minimal: a page of the excerpt in a large serif, the current word bright, later words dim; a thin waveform line
    const pages = []; let cur = [];
    for (const w of words) { cur.push(w); if (cur.length >= (sq ? 14 : 22) && /[.!?,;:]$/.test(w.w)) { pages.push(cur); cur = []; } else if (cur.length >= (sq ? 18 : 28)) { pages.push(cur); cur = []; } }
    if (cur.length) pages.push(cur);
    at('Small', 0, clip, `${esc(speaker).toUpperCase()}  ·  ${titleLine}`, cx, s(170), 5, 2);
    pages.forEach((pg) => pg.forEach((w, k) => {
      const t0 = k === 0 ? Math.max(0, w.s - 0.1) : w.s, t1 = k + 1 < pg.length ? pg[k + 1].s : Math.min(clip, w.e + 0.4);
      let n = 0;
      const shown = wrap(pg.map((x) => x.w).join(' '), sq ? 24 : 22).map((ln) => ln.split(' ').map((tok) => {
        const j = n++; return `{\\c${j === k ? C.amber : j < k ? C.white : C.dim}}${esc(tok)}`;
      }).join(' ')).join('\\N');
      at('Quote', t0, t1, shown, safeX, s(420), 7, 3);
    }));
    at('Brand', 0, clip, CALL_SIGN, cx, s(1440), 5, 2);
  }

  // the link back, baked in (links in Shorts/Reels descriptions are often not clickable): a small watermark throughout…
  at('Small', 0, clip, esc(url), cx, s(60), 5, 6, '\\1a&H10&\\3c&H101418&\\3a&H40&\\bord2');   // readable on light and dark grounds
  // …and the end card: "Hear the full talk", the speaker and talk, the short URL, and (drawn by the renderer) a QR code to
  // the full talk at this moment, under the text
  shape(clip, total, 0, 0, rect(W, H), '&H0D1014&', { layer: 4, alpha: '10' });
  at('End', clip, total, 'Hear the full talk', cx, s(sq ? 300 : 420), 5, 5);
  at('Small', clip, total, `${esc(speaker)}  ·  ${titleLine}`, cx, s(sq ? 380 : 520), 5, 5);
  // a long address goes on two lines (the domain, then the path), smaller; a moment's /m/<key> fits on one
  const m2 = url.length > 30 ? /^(siftersearch\.com\/[^/]+\/)(.+)$/.exec(url) : null;
  const shown = m2 ? `{\\fs${sq ? 30 : 38}\\c${C.amber}}${esc(m2[1])}\\N${esc(m2[2])}` : `{\\fs${sq ? 40 : 52}\\c${C.amber}}${esc(url)}`;
  at('End', clip, total, shown, cx, s(sq ? 450 : 620), 5, 5);
  at('Brand', clip, total, `THE LISTENING ROOM  ·  ${CALL_SIGN}`, cx, s(sq ? 1000 : 1330), 5, 5);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n`
    + 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
    + `${styles(sq).join('\n')}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${ev.join('\n')}\n`;
}

/** The renderer's spec (render_short.py): sizes, the background recipe and where the portrait / waveform go. */
export function renderSpec({ template = 'on-air', format = 'vertical', clip, portrait = false }) {
  const { W, H } = FORMATS[format];
  const sq = format === 'square', s = (v) => Math.round(sq ? v * (H / 1920) : v);
  const q = sq ? 300 : 460;   // the end card's QR code (the renderer overlays qr.png from the clip's end)
  const base = { W, H, fps: 30, clip, total: clip + END_CARD, portrait, template, qr: { size: q, x: (W - q) / 2, y: s(sq ? 560 : 760) } };
  if (template === 'on-air') return { ...base, ground: 'warm', record: { size: s(560), x: (W - s(560)) / 2, y: s(420) }, wave: { w: 900, h: s(110), x: 90, y: s(1500) } };
  if (template === 'archive-tape') return { ...base, ground: 'sepia', backdrop: portrait, wave: { w: 900, h: s(120), x: 90, y: s(1480) } };
  if (template === 'scripture-insert') return { ...base, ground: 'deep', backdrop: portrait, wave: { w: 900, h: s(90), x: 90, y: s(700) } };
  if (template === 'portrait-cinema') return { ...base, ground: 'deep', kenburns: portrait, wave: { w: 900, h: s(100), x: 90, y: s(1330) } };
  return { ...base, ground: 'gradient', wave: { w: 900, h: s(40), x: 90, y: s(1360) } };
}

/** Ready-to-paste post text for the person sharing it: a title, the quote, speaker, talk, the link, a few hashtags. */
export function postText({ words = [], speaker = '', title = '', year = null, url, fullUrl, topics = [], tradition = "Bahá'í" }) {
  const quote = words.map((w) => w.w).join(' ').trim();
  const short = quote.split(/\s+/).slice(0, 9).join(' ');
  const tag = (s) => `#${String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘'ʻ`]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map((x) => x[0]?.toUpperCase() + x.slice(1)).join('')}`;
  const tags = [...new Set([tradition && tag(tradition.replace(/'?i$/i, 'i')), speaker && tag(speaker), ...topics.slice(0, 3).map(tag)].filter((t) => t && t.length > 2))].slice(0, 5);
  const head = `“${short}${quote.split(/\s+/).length > 9 ? '…' : ''}” — ${speaker}`.slice(0, 100);
  return { title: head, text: [`“${quote}”`, `— ${speaker}, ${[title, year].filter(Boolean).join(', ')}`, '', `Hear the full talk: ${fullUrl || url}`, '', tags.join(' ')].join('\n') };
}
