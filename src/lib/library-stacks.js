// The Library landing (/library, planning/library-landing-design.md): PURE helpers shared by SSR (Astro) and the browser —
// diacritic folding, book covers (the real cover art through the image service, or a typographic cover in the same
// visual system when a book has none; seeded by the book so it looks the same on every visit), traditions and their
// sections, featured works, the as-you-type catalogue, the wall's sources, and the seven process stages.
// renderBook() returns HTML so SSR, the arrivals row, opened collections and the wall all draw the identical book.
// Tested in tests/api/library-stacks.test.js.
import { imgSet } from './imagekit.js';

/** Search folding: no diacritics, no apostrophes/‘ayn/hamza marks, lower case, words separated by single spaces. */
export function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘'`ʼʻʾʿ´]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** FNV-1a 32-bit. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** mulberry32: a small seeded generator → floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A seeded shuffle (Fisher–Yates) — same order for the same seed. */
export function shuffle(list, seed) {
  const a = [...list], r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Today's seed (UTC date) so featured order and the wall change daily but not per request. */
export const daySeed = (d = new Date()) => hash(d.toISOString().slice(0, 10));

// Traditions: the section's name, its tint (token --trad-<key>, taken from the covers' own colours) and the cloths a
// typographic cover is bound in (tokens --cloth-<name>).
export const TRADITIONS = Object.freeze({
  "baha'i": { key: 'bahai', display: 'The Bahá’í Faith', cloths: ['oxblood', 'navy', 'forest', 'claret', 'parchment'] },
  judaism: { key: 'judaism', display: 'Judaism', cloths: ['navy', 'prussian', 'slate', 'parchment'] },
  buddhist: { key: 'buddhist', display: 'Buddhism', cloths: ['oxblood', 'saffron', 'rust', 'umber'] },
  islam: { key: 'islam', display: 'Islam', cloths: ['forest', 'teal', 'prussian', 'parchment'] },
  christian: { key: 'christian', display: 'Christianity', cloths: ['claret', 'oxblood', 'navy', 'umber'] },
  zoroastrian: { key: 'zoroastrian', display: 'Zoroastrianism', cloths: ['rust', 'ochre', 'oxblood', 'parchment'] },
  tao: { key: 'tao', display: 'Taoism', cloths: ['olive', 'slate', 'teal', 'parchment'] },
  hindu: { key: 'hindu', display: 'Hinduism', cloths: ['saffron', 'rust', 'plum', 'ochre'] },
  confucian: { key: 'confucian', display: 'Confucianism', cloths: ['oxblood', 'umber', 'slate', 'parchment'] },
  sikh: { key: 'sikh', display: 'Sikhism', cloths: ['navy', 'saffron', 'prussian'] },
  jain: { key: 'jain', display: 'Jainism', cloths: ['ochre', 'olive', 'slate', 'parchment'] },
});
export const CLOTHS = Object.freeze(['oxblood', 'claret', 'navy', 'prussian', 'forest', 'teal', 'olive', 'ochre', 'saffron', 'rust', 'umber', 'plum', 'slate', 'parchment']);
const tradOf = (name) => TRADITIONS[String(name || '').toLowerCase()] || { key: 'other', display: name || 'The Library', cloths: ['umber', 'slate', 'navy', 'parchment'] };
export const displayName = (name) => tradOf(name).display;
export const tradKey = (name) => tradOf(name).key;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const known = (a) => !!a && !/^unknown$/i.test(String(a).trim());

/** Shorten to at most `max` characters, at a word boundary where one is near, with an ellipsis. */
export function fitText(s, max) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  if (max < 2) return '…';
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:·–—-]+$/, '')}…`;
}

/**
 * A typographic cover for a book without cover art, in the covers' own idiom (bound cloth, gilt, a framed title).
 * variant: frame (gilt double frame) | band (title on a coloured band over parchment) | rule (title over a rule, author
 * below) | star (a gilt eight-point star under the title). size: title scale 1–4 by length.
 */
export function coverSpec(book, tradition) {
  const r = rng(hash(`${book.id}|${book.title}`));
  const cloths = tradOf(tradition).cloths;
  const cloth = cloths[Math.floor(r() * cloths.length)];
  const variants = cloth === 'parchment' ? ['band', 'rule'] : ['frame', 'rule', 'star', 'frame'];
  const variant = variants[Math.floor(r() * variants.length)];
  const band = cloth === 'parchment' ? ['forest', 'navy', 'oxblood'][Math.floor(r() * 3)] : null;
  const len = String(book.title || '').length;
  const size = len <= 14 ? 1 : len <= 30 ? 2 : len <= 55 ? 3 : 4;
  return { cloth, variant, band, size, title: fitText(book.title, 90), author: known(book.author) ? fitText(book.author, 42) : '' };
}

/** Responsive cover image (width-only transform: the art keeps its own proportions, never stretched). */
export const coverImg = (url, widths = [160, 240, 360]) => (url ? imgSet(url, widths, { fo: null, q: 80 }) : null);

/**
 * One book as a link: the cover art over its typographic cover (the latter shows if the art is missing or fails), and
 * optionally a caption. The preview sheet intercepts plain clicks. opts: caption, eager, sizes, widths, cls, lead.
 */
export function renderBook(book, tradition, { caption = true, eager = false, sizes = '160px', widths, cls = '', note = '' } = {}) {
  const s = coverSpec(book, tradition);
  const img = coverImg(book.cover, widths);
  const label = `${book.title}${known(book.author) ? `, ${book.author}` : ''}${book.kind === 'work' ? `, ${book.parts} parts` : ''}`;
  const data = [`data-id="${esc(book.id)}"`, `data-t="${esc(book.title)}"`, known(book.author) ? `data-a="${esc(book.author)}"` : '',
    book.year ? `data-y="${esc(book.year)}"` : '', book.cover ? `data-c="${esc(book.cover)}"` : '', tradition ? `data-r="${esc(tradition)}"` : '',
    book.paras ? `data-n="${esc(book.paras)}"` : '', book.kind === 'work' ? `data-work="${esc(book.parts)}"` : ''].filter(Boolean).join(' ');
  const style = `--cl:var(--cloth-${s.cloth})${s.band ? `;--bd:var(--cloth-${s.band})` : ''}`;
  const tc = `<span class="tc tc-${s.variant} tc-s${s.size}" style="${style}" aria-hidden="true"><span class="tc-t">${esc(s.title)}</span>${s.author ? `<span class="tc-a">${esc(s.author)}</span>` : ''}</span>`;
  const art = img ? `<img src="${esc(img.src)}"${img.srcset ? ` srcset="${esc(img.srcset)}" sizes="${esc(sizes)}"` : ''} alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : '';
  const cap = caption ? `<span class="bk-cap"><span class="bk-t">${esc(book.title)}</span>${known(book.author) ? `<span class="bk-a">${esc(book.author)}</span>` : ''}${note ? `<span class="bk-n">${esc(note)}</span>` : ''}</span>` : '';
  // captioned: the visible caption names the link; caption-less (the wall): the label does
  return `<a class="bk${img ? ' has-art' : ''}${cls ? ` ${cls}` : ''}" href="${esc(book.url)}"${caption ? '' : ` aria-label="${esc(label)}"`} ${data}><span class="bk-c">${tc}${art}</span>${cap}</a>`;
}

/**
 * Shelves index (/api/library/shelves) + landing (may be null) → traditions in page order, each with its rows (the
 * shelves that hold books, covers first) and collections. Live counts from the landing win.
 */
export function sectionsFrom(shelves, landing = null) {
  const live = new Map((landing?.traditions || []).map((t) => [t.name, t.documents]));
  return (shelves?.traditions || []).filter((t) => t?.name && ((t.shelves || []).some((s) => s.items?.length) || (t.library || []).length)).map((t) => {
    const rows = (t.shelves || []).filter((s) => s.items?.length).map((s) => ({ name: /^(other|more) works$|^collections$/i.test(s.name) ? null : s.name, key: s.key, count: s.count,
      items: [...s.items].sort((a, b) => (!!b.cover - !!a.cover)), more: s.more || null }));
    const lead = rows.flatMap((r) => r.items).find((b) => b.cover) || null;
    return { name: t.name, slug: t.slug, key: tradKey(t.name), display: displayName(t.name), total: live.get(t.name) ?? t.total ?? 0,
      rows, lead, library: (t.library || []).filter((l) => l.count > 0) };
  });
}

// Works that lead the featured carousel when present (folded title prefixes), then any covered book; ≤ 3 per tradition.
const FEATURE = ['the kitab i iqan', 'kitab i iqan', 'gleanings', 'the hidden words', 'god passes by', 'paris talks', 'selections from the writings of the bab',
  'the dhammapada', 'the diamond sutra', 'the muqaddimah', 'summa theologica', 'the ethics', 'kitab al khazari', 'sahih al bukhari', 'the gateless gate', 'the confessions'];
export function featured(sections, n = 8) {
  const all = sections.flatMap((s) => s.rows.flatMap((r) => r.items.filter((b) => b.cover && b.kind !== 'work').map((b) => ({ ...b, religion: s.name }))));
  const rank = (b) => { const f = fold(b.title); const i = FEATURE.findIndex((p) => f.startsWith(p)); return i < 0 ? 99 : i; };
  const per = new Map(), out = [];
  for (const b of [...all].sort((a, b) => rank(a) - rank(b))) {
    if (rank(b) === 99 && out.length >= Math.min(n, 4)) continue;   // curated first; strangers only to fill a short list
    const c = per.get(b.religion) || 0;
    if (c >= 3) continue;
    per.set(b.religion, c + 1); out.push(b);
    if (out.length >= n) break;
  }
  return out;
}

/** Every book and work part on the shelves, plus the collections, as catalogue entries for the as-you-type search. */
export function catalogFrom(shelves) {
  const out = [], seen = new Set();
  const add = (b, wing, kind = 'book') => {
    if (!b?.title || !b.url || seen.has(b.url)) return;
    seen.add(b.url);
    out.push({ id: b.id ?? null, t: b.title, a: b.author || '', u: b.url, w: wing, k: kind, c: b.cover || null, n: b.count ?? b.parts ?? null, f: fold(`${b.title} ${b.author || ''}`), ft: fold(b.title) });
  };
  for (const t of shelves?.traditions || []) {
    for (const s of t.shelves || []) for (const b of s.items || []) { add(b, t.name, b.kind === 'work' ? 'work' : 'book'); for (const p of b.list || []) add(p, t.name); }
    for (const l of t.library || []) if (l.url) add({ title: l.name, url: l.url, count: l.count }, t.name, 'collection');
  }
  return out;
}

/** Catalogue lookup: every query word must appear (folded); title-prefix and word-start matches rank first. */
export function searchCatalog(entries, q, limit = 12) {
  const words = fold(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const e of entries) {
    if (!words.every((w) => e.f.includes(w))) continue;
    const joined = words.join(' ');
    let score = e.ft.startsWith(joined) ? 0 : (` ${e.ft}`).includes(` ${words[0]}`) ? 1 : e.ft.includes(joined) ? 2 : 3;
    if (e.k === 'collection') score -= 0.5;
    scored.push([score, e.t.length, e]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map((x) => x[2]);
}

/** Every book with cover art on the shelves (works included), each with its tradition — the wall's first chapter. */
export function coveredBooks(shelves) {
  const seen = new Set(), out = [];
  for (const t of shelves?.traditions || []) for (const s of t.shelves || []) for (const b of s.items || []) {
    if (!b?.cover || seen.has(b.id)) continue;
    seen.add(b.id); out.push({ ...b, religion: t.name });
  }
  return out;
}

/**
 * The wall of covers: where its books come from after the covered ones — every collection of every tradition as a
 * /api/library/shelves/items query, interleaved round-robin by tradition so the wall stays varied.
 */
export function wallSources(shelves) {
  const per = (shelves?.traditions || []).map((t) => (t.library || []).filter((l) => l.count > 0).map((l) => ({ religion: t.name, count: l.count,
    params: l.site ? { site: l.site } : l.authors ? { collection: l.collection, authors: l.authors.join('|') } : { collection: l.collection || '' } })));
  const out = [];
  for (let i = 0; per.some((p) => i < p.length); i++) for (const p of per) if (p[i]) out.push(p[i]);
  return out;
}

/** 9,100,065 → "9.1M"; 586,795 → "587K"; 472 → "472". */
export function compact(n) {
  const v = n == null || n === '' ? NaN : Number(n);
  if (!Number.isFinite(v)) return '';
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}K`;
  return v.toLocaleString('en-US');
}
export const thousands = (n) => (n != null && Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '');

/** What happens to every book — the seven stages, each with its live figure from /api/library/landing's `process`. */
export const STAGES = Object.freeze([
  { id: 'acquire', name: 'Acquire', line: 'From archives, scans and contributors. Dewey, our AI librarian, checks every offer against the holdings first.',
    stat: (p) => p?.acquire?.week, unit: 'added this week', sub: (p) => (p?.acquire?.waiting ? `${thousands(p.acquire.waiting)} awaiting review` : '') },
  { id: 'restore', name: 'Restore the text', line: 'Scans are read by OCR and quality-gated; clean editions replace broken text.',
    stat: (p) => p?.restore?.paragraphs, unit: 'paragraphs of clean text' },
  { id: 'structure', name: 'Structure', line: 'Paragraphs, sections and headings: one faithful reading copy of every book.',
    stat: (p) => p?.structure?.sections, unit: 'sections mapped' },
  { id: 'attribute', name: 'Attribute', line: 'Who is speaking, and who is meant, read paragraph by paragraph.',
    stat: (p) => p?.attribute?.paragraphs, unit: 'paragraphs read for people', sub: (p) => (p?.attribute?.entities ? `${compact(p.attribute.entities)} names resolved` : '') },
  { id: 'link', name: 'Link', line: 'Every quotation traced to its source; letters and citations become real links.',
    stat: (p) => p?.link?.references, unit: 'references linked' },
  { id: 'pair', name: 'Pair originals', line: 'Persian and Arabic originals aligned with their translations, passage by passage.',
    stat: (p) => p?.pair?.paragraphs, unit: 'paragraphs paired' },
  { id: 'index', name: 'Index for meaning', line: 'Semantic and phrase search, and the questions each passage answers.',
    stat: (p) => p?.index?.questions, unit: 'questions answered', sub: (p) => (p?.index?.phrases ? `${compact(p.index.phrases)} phrases indexed` : '') },
]);
