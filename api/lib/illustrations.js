// Pictures that illustrate library passages (Chad 11-14: "where we have pictures, we should employ them"): the Dawn-Breakers plates in
// data/illustrations.json (built by scripts/books/dawn-breakers-illustrations.mjs from the edition's own captions). imagesFor picks 0–2
// for a passage — the plate facing its paragraph, then one whose caption names a person/place the passage names, then one of its chapter;
// for a person, their portrait plate. Code picks, never the model; nothing fits → none. Pure (bundles in the Anís Worker). Deps: imagekit.
import INDEX from '../../data/illustrations.json' with { type: 'json' };
import { imgSet, svcFixed } from '../../src/lib/imagekit.js';

export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’'ʼ`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Places a caption may show (from the plates' captions, reviewed 11-14): folded keys → the name. A key is a whole-word match.
export const PLACES = [
  ['Najaf'], ['Shíráz', 'shiraz'], ['Karbilá', 'karbila'], ['Káẓimayn', 'kazimayn'], ['Iṣfahán', 'isfahan'], ['Ṭihrán', 'tihran'], ['Tákur', 'takur'],
  ['Mázindarán', 'mazindaran'], ['Mashhad', 'mashhad'], ['Mecca'], ['Medina'], ['Bárfurúsh', 'barfurush'], ['Káshán', 'kashan'], ['Qum'], ['Qumrúd', 'qumrud'],
  ['Kinár-Gird', 'kinar gird'], ['Kulayn'], ['Tabríz', 'tabriz'], ['Máh-Kú', 'mah ku'], ['Mílán', 'milan'], ['Ádhirbáyján', 'adhirbayjan'], ['Qazvín', 'qazvin'],
  ['Sháh-Rúd', 'shah rud'], ['Badasht', 'badasht'], ['Chihríq', 'chihriq'], ['Urúmíyyih', 'urumiyyih'], ['Níshápúr', 'nishapur'], ['Míyámay', 'miyamay'],
  ['Sabzih-Maydán', 'sabzih maydan'], ['Shaykh Ṭabarsí', 'shaykh tabarsi', 'tabarsi'], ['Sárí', 'sari'], ['Afrá', 'afra'], ['Shír-Gáh', 'shir gah'], ['Ríz-Áb', 'riz ab'],
  ['Fírúz-Kúh', 'firuz kuh'], ['Vás-Kas', 'vas kas'], ['Ámul', 'amul'], ['Dízvá', 'dizva'], ['Yazd'], ['Nayríz', 'nayriz'], ['Zanján', 'zanjan'], ['Afchih', 'afchih'],
  ['Shimírán', 'shimiran'], ['Níyávarán', 'niyavaran'], ['Zarkandih'], ['Síyáh-Chál', 'siyah chal'], ['Ábádih', 'abadih'], ['Baghdád', 'baghdad'], ['Mount Carmel', 'carmel'],
].map(([name, ...keys]) => ({ name, keys: (keys.length ? keys : [fold(name)]).map(fold) }));

export const CREDIT = 'Illustration from *The Dawn-Breakers*';
const IMAGES = INDEX.images || [];
const BY_ID = new Map(IMAGES.map((x) => [x.id, x]));
const CHAPTER_DOCS = new Map(Object.entries(INDEX.chapterDocs || {}).map(([d, c]) => [Number(d), c]));
const has = (hay, key) => ` ${hay} `.includes(` ${key} `);
/** the chapter a doc + paragraph belongs to (the main edition by paragraph range; the per-chapter edition by doc) */
export const chapterOf = (doc, para) => CHAPTER_DOCS.get(Number(doc))
  ?? (INDEX.docs?.[doc]?.chapters || []).find((c) => para != null && para >= c.from && para <= c.to)?.n ?? null;
export const illustrated = (doc) => !!INDEX.docs?.[doc] || CHAPTER_DOCS.has(Number(doc));
export const imageById = (id) => BY_ID.get(id) ?? null;
export const allImages = () => IMAGES;

/**
 * 0–max pictures for a passage or a person: `{ doc, para, text }` (a passage), `{ person }` (a person id: their portrait plate first,
 * then the plates showing them), `{ place }` (a place name). Scored only on what the index records from captions:
 * the plate facing the paragraph, a person/place named both by the caption and the passage, nearness in the same chapter.
 * A passage of a doc with no plates, or a chapter with nothing that fits, → [].
 */
export function imagesFor({ doc = null, para = null, person = null, place = null, text = '' } = {}, { max = 2 } = {}) {
  if (person != null) {
    const pid = Number(person);
    return IMAGES.filter((x) => x.people.some((p) => p.id === pid)).sort((a, b) => (b.kind === 'portrait') - (a.kind === 'portrait') || a.people.length - b.people.length).slice(0, max);
  }
  if (place && !doc) { const k = fold(place); return IMAGES.filter((x) => x.places.some((p) => fold(p) === k)).slice(0, max); }
  if (doc == null || !illustrated(doc)) return [];
  const chapter = chapterOf(doc, para);
  if (chapter == null) return [];
  const main = !!INDEX.docs?.[doc], hay = fold(text);
  const placesIn = new Set(PLACES.filter((p) => p.keys.some((k) => has(hay, k))).map((p) => p.name));
  const scored = IMAGES.filter((x) => x.chapter === chapter).map((x) => {
    let s = 0;
    if (main && para != null && x.para === para) s += 6;
    for (const p of x.people) if (p.keys?.some((k) => has(hay, k))) s += 4;
    for (const p of x.places) if (placesIn.has(p)) s += 3;
    const near = main && para != null && x.para != null ? Math.abs(x.para - para) : null;
    if (near != null && near <= 3) s += 2;
    return { x, s, near: near ?? 1e9 };
  });
  const fit = scored.filter((y) => y.s > 0).sort((a, b) => b.s - a.s || a.near - b.near).map((y) => y.x);
  if (fit.length) return fit.slice(0, max);
  // nothing named in the passage: one plate of the same chapter, the nearest
  const near = scored.sort((a, b) => a.near - b.near)[0]?.x;
  return near ? [near] : [];
}

/** the 0–max pictures for a set of passages (a research packet): each passage's picks, best first, no repeats */
export function imagesForPassages(passages = [], { max = 2 } = {}) {
  const out = [];
  for (const p of passages || []) {
    for (const x of imagesFor({ doc: Number(p?.document_id ?? p?.doc_id) || null, para: p?.paragraph_index ?? null, text: p?.text || '' }, { max }))
      if (!out.includes(x)) out.push(x);
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

const THUMB_W = 120, EMAIL_W = 160, LARGE_W = 1600;
const hFor = (x, w) => Math.round((w * (x.h || 3)) / (x.w || 4));
/** the larger picture a click opens (aspect kept) */
export const largeUrl = (x) => imgSet(x.r2, [LARGE_W], { fo: null }).src;
/** a card's thumbnail: responsive src/srcset at the plate's aspect; width/height reserve the box */
export const thumbOf = (x, w = THUMB_W) => ({ ...imgSet(x.r2, [w, w * 2, w * 3], { fo: null }), sizes: `${w}px`, width: w, height: hFor(x, w) });
/** a letter's thumbnail: one fixed-size image-worker URL (mail clients ignore srcset; the 2x is there for those that read it) */
export const emailThumbOf = (x, w = EMAIL_W) => ({ ...svcFixed(x.r2, w, hFor(x, w), { extra: null }), width: w, height: hFor(x, w) });
/** what a tool result carries: Anís may mention the picture, by its caption only */
export const toolImages = (list) => (list || []).map((x) => ({ id: x.id, caption: x.caption, url: largeUrl(x) }));
/** what a card carries (one picture, built by code) */
export const cardImage = (x) => (x ? { id: x.id, caption: x.caption, credit: CREDIT, thumb: thumbOf(x), email: emailThumbOf(x), large: largeUrl(x) } : null);
/** a line for the model under shown passages: the pictures the reader's cards will show, by caption */
export const imagesNote = (list) => (list?.length ? `\n\n(pictures we hold for these passages — a card quoting the passage shows it to the reader; mention one only if it helps, and say nothing about it beyond its caption: ${list.map((x) => `“${x.caption}”`).join('; ')})` : '');

const escA = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** a card's picture as HTML: the thumbnail linked to the larger image, caption + credit. email → the fixed thumbnail. */
export function imageHtml(img, { mode = 'chat' } = {}) {
  if (!img) return '';
  const t = mode === 'email' ? img.email : img.thumb;
  if (!t?.srcset) return '';
  const credit = escA(img.credit).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return `<figure class="card-image"><a href="${escA(img.large)}" target="_blank" rel="noopener"><img src="${escA(t.src)}" srcset="${escA(t.srcset)}" sizes="${t.sizes || `${t.width}px`}" width="${t.width}" height="${t.height}" alt="${escA(img.caption)}" loading="lazy" decoding="async"></a>`
    + `<figcaption>${escA(img.caption)} · ${credit}</figcaption></figure>`;
}
/** a card's picture as Markdown (the stored reply, letters): the fixed thumbnail linked to the larger image, then caption · credit */
export const imageMarkdown = (img) => (img?.email?.src ? `[![${img.caption.replace(/[[\]]/g, '')}](${img.email.src})](${img.large})\n*${img.caption.replace(/\*/g, '')} · Illustration from The Dawn-Breakers*` : '');
/** markdown-rendered HTML: a fixed image-worker <img> (w-W,h-H) gains width/height, its 2x srcset, sizes and lazy loading */
export const sizeImgs = (html) => String(html || '').replace(/<img src="([^"]*\/img\/[^"]*[?&]tr=w-(\d+),h-(\d+),dpr-1[^"]*)" alt="([^"]*)"\s*\/?>/g,
  (m, src, w, h, alt) => `<img src="${src}" srcset="${src} 1x, ${src.replace('dpr-1', 'dpr-2')} 2x" sizes="${w}px" width="${w}" height="${h}" alt="${alt}" loading="lazy" decoding="async" style="border-radius:4px">`);
