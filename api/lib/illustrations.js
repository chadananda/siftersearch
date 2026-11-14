// Pictures that illustrate library passages (Chad 11-14: "where we have pictures, we should employ them"): the Dawn-Breakers plates in
// data/illustrations.json (built by scripts/books/dawn-breakers-illustrations.mjs from the edition's own captions). imagesFor picks 0–2
// for a passage — the plate facing its paragraph, then one whose caption names a person/place the passage names, then one of its chapter;
// for a person, their portrait plate. Code picks, never the model; nothing fits → none. Pure (bundles in the Anís Worker). Deps: imagekit.
import INDEX from '../../data/illustrations.json' with { type: 'json' };
import { imgSet as imgSetSs, svcFixed as svcFixedSs } from '../../src/lib/imagekit.js';
import { ANIS_ORIGIN } from './anis-links.js';
// Anís output names the Anís host, never siftersearch.com (its lint strips our own links — live 11-14: "[!Interior …]" with no url);
// the Anís host serves /img/* through the same image Worker
const onAnis = (u) => String(u).replace(/https:\/\/siftersearch\.com\/img\//g, `${ANIS_ORIGIN}/img/`);
const imgSet = (...a) => { const r = imgSetSs(...a); return { ...r, src: onAnis(r.src), ...(r.srcset ? { srcset: onAnis(r.srcset) } : {}) }; };
const svcFixed = (...a) => { const r = svcFixedSs(...a); return typeof r === 'string' ? onAnis(r) : { ...r, src: onAnis(r.src) }; };

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
 * the plate facing the paragraph; the portrait of `subject` (the question's subject); a plate of its chapter whose caption names a
 * person or a site (not a bare city) the passage names; a portrait of a person the passage names. Nothing fits → [].
 */
// A city alone binds no plate (live 11-14: a passage naming Shíráz drew "Interior of Ḥájí Mírzá ‘Alí’s House in Shíráz"). A caption's
// SITE does: its noun (house, square, fort, shrine…) with the name that makes it one place ("House of Quddús' Father" → house + quddus;
// "Ḥájí Mírzá ‘Alí’s House" → house + haji mirza ali). The passage must name the noun and every name word.
const SITE = /\b(house|houses|home|square|fort|fortress|shrine|mosque|masjid|prison|moat|gate|castle|barracks?|tomb|citadel|garden|bath|caravanserai|madrisih|village|mausoleum)\b/;
const QUIET = new Set(['the', 'of', 'a', 'and', 'in', 'views', 'view', 'interior', 'exterior', 'ruins', 'original', 'courtyard', 'site', 'room', 'entrance', 'public', 'which', 'where', 'his', 'her', 'their', 'showing', 'x', 'to', 'ruined', 'father', 'fathers', 'near', 'on']);
const siteOf = (caption) => {
  const c = fold(caption), m = c.match(SITE);
  if (!m) return null;
  const before = c.slice(0, m.index).trim().split(' '), after = c.slice(m.index + m[0].length).trim().split(' ');
  let names = [];
  if (after[0] === 'of') for (const w of after.slice(1)) { if (['in', 'where', 'showing', 'x', 'near', 'on'].includes(w)) break; if (!QUIET.has(w)) names.push(w); }
  else for (let i = before.length - 1; i >= 0 && !QUIET.has(before[i]) && before[i]; i--) names.unshift(before[i]);
  names = names.slice(0, 4).map((w, i, all) => (i === all.length - 1 && after[0] !== 'of' && w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  return names.length ? { noun: m[1].replace(/s$/, ''), names } : null;
};
export const siteOfPlate = (id) => SITES.get(id) ?? null;
const SITES = new Map(IMAGES.map((x) => [x.id, siteOf(x.caption)]));
const namesSite = (x, hay) => { const st = SITES.get(x.id); return !!st && hay.includes(st.noun) && st.names.every((w) => has(hay, w)); };
// portraits of the persons named in `words`, first named first
const portraitsIn = (words) => {
  if (!words) return [];
  const at = (x) => Math.min(...x.people.flatMap((p) => (p.keys || []).map((k) => ` ${words} `.indexOf(` ${k} `)).filter((i) => i >= 0)), 1e9);
  return IMAGES.filter((x) => x.kind === 'portrait' && !x.plate_of).map((x) => ({ x, i: at(x) })).filter((y) => y.i < 1e9)
    .sort((a, b) => a.i - b.i || a.x.people.length - b.x.people.length).map((y) => y.x);
};

export function imagesFor({ doc = null, para = null, person = null, place = null, text = '', subject = '' } = {}, { max = 2 } = {}) {
  if (person != null) { const pid = Number(person);
    return IMAGES.filter((x) => x.people.some((p) => p.id === pid)).sort((a, b) => (b.kind === 'portrait') - (a.kind === 'portrait') || a.people.length - b.people.length).slice(0, max); }
  if (place && !doc) { const k = fold(place); return IMAGES.filter((x) => x.places.some((p) => fold(p) === k)).slice(0, max); }
  if (doc == null || !illustrated(doc)) return [];
  const chapter = chapterOf(doc, para);
  const main = !!INDEX.docs?.[doc], hay = fold(text);
  const inChapter = chapter == null ? [] : IMAGES.filter((x) => x.chapter === chapter);
  // 1. the plate facing the paragraph
  const facing = main && para != null ? inChapter.filter((x) => x.para === para) : [];
  if (facing.length) return facing.slice(0, max);
  // 2. the portrait of the question's subject outranks any caption match ("Who was Muḥammad Sháh?" → his portrait on every card).
  // Chapter-free: a footnote or the epilogue (live 11-14, fn_324 "Muḥammad Sháh died…": no paragraph, no chapter) still shows it.
  const subj = portraitsIn(fold(subject))[0];
  if (subj) return [subj];
  if (chapter == null) return portraitsIn(hay).slice(0, 1);
  // 3. a plate of this chapter whose caption names a person, or a site, the passage names; nearness only breaks ties
  const fit = inChapter.map((x) => {
    let s = 0;
    for (const p of x.people) if (p.keys?.some((k) => has(hay, k))) s += 4;
    if (namesSite(x, hay)) s += 3;
    return { x, s, near: main && para != null && x.para != null ? Math.abs(x.para - para) : 1e9 };
  }).filter((y) => y.s > 0).sort((a, b) => b.s - a.s || a.near - b.near).map((y) => y.x);
  if (fit.length) return fit.slice(0, max);
  // 4. a portrait of a person the passage names. Never a bare same-chapter plate or a city alone: no picture beats a wrong one.
  return portraitsIn(hay).slice(0, 1);
}

export function imagesForPassages(passages = [], { max = 2, subject = '' } = {}) {
  const out = [];
  for (const p of passages || []) {
    for (const x of imagesFor({ doc: Number(p?.document_id ?? p?.doc_id) || null, para: p?.paragraph_index ?? null, text: p?.text || '', subject }, { max }))
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
