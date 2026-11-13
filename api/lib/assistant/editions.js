// editions.js — a passage's other-language EDITIONS (its original, its existing translations), any tradition. Never translates.
// Providers in order: recorded links (passage-links resolveLinks: the Bahá'í Persian/Arabic pairing, CTAI) → the work family
// (alignment-repo workFamily) aligned BY REFERENCE (chapter heading number + verse marker / place in the chapter) → by MEANING
// (cross-lingual phrase vectors inside the member edition). Deps injected (tests); defaults are the live repos and layer.
import { headingNumber } from './lookup.js';
import { mainKey, titleScore } from '../dewey/title-index.js';
import { verseSpan } from './scripture-ref.js';
import { QURAN_LAYOUTS, layoutTotal, quranIndex, quranVerseAt } from './numbering.js';

const LANG = { ar: 'Arabic', fa: 'Persian', he: 'Hebrew', grc: 'Greek', el: 'Greek', sa: 'Sanskrit', pi: 'Pali', zh: 'Chinese', pa: 'Punjabi', ae: 'Avestan', en: 'English', fr: 'French', de: 'German', es: 'Spanish', ur: 'Urdu', tr: 'Turkish', ru: 'Russian', ja: 'Japanese', bo: 'Tibetan' };
/** A stored language value ('en', 'En', 'Eng', 'Arabic') → its lower-case code where known; the raw value lower-cased otherwise. Pure. */
export const langCode = (l) => { const s = String(l || '').trim().toLowerCase(); if (!s) return null; if (LANG[s]) return s;
  const byName = Object.entries(LANG).find(([k, n]) => n.toLowerCase() === s || (s.length === 3 && n.toLowerCase().startsWith(s))); return byName ? byName[0] : s; };
export const langName = (l) => LANG[langCode(l)] || (l ? String(l) : null);
// the languages a tradition's core texts were written in — named ONLY in an honest absence ("the library holds no Arabic edition"), never searched by
export const ORIGINAL_LANGS = { "Baha'i": ['fa', 'ar'], Islam: ['ar'], Christian: ['he', 'grc'], Judaism: ['he'], Hindu: ['sa'], Buddhist: ['pi', 'sa'], Tao: ['zh'], Confucian: ['zh'], Sikh: ['pa'], Zoroastrian: ['ae'], Jain: ['sa'] };

// a chapter heading's number: lookup.js headingNumber, else 'Sura 2' / 'Surah 2: Al-Baqarah' / 'Psalm 23' (structure, not intent)
const chapterNo = (h) => headingNumber(h) ?? (Number(String(h || '').match(/\b(?:s[uū]rah?|chapter|psalm|canto|book)\s+(\d+)/i)?.[1]) || null);
const text0 = (r) => !/^heading/i.test(r?.blocktype || '') && String(r?.text || '').trim().length > 0;
const CHAPTER_MAX = 400;   // the repo's own range read; a longer chapter aligns by meaning
/** The rows of the chapter numbered n in a doc (heading starts → its run), book text only; null = no such chapter, or ambiguous. */
async function chapterRows(docId, n, d) {
  const s = (await d.headingStarts(docId).catch(() => [])).filter((r) => chapterNo(r.heading) === n);
  if (s.length !== 1) return null;
  const rows = await d.paragraphsInRange(docId, s[0].paragraph_index, s[0].paragraph_index + CHAPTER_MAX, { limit: CHAPTER_MAX }).catch(() => []);
  const out = [];
  for (const r of rows) { if (r.heading && chapterNo(r.heading) !== n) break; out.push(r); }
  return out.filter(text0);
}
/** By reference: the source row's chapter (heading number) and verse (its marker, else its place in the chapter) → the same place in the member. */
export async function alignByReference(src, member, d) {
  const n = chapterNo(src.heading) ?? (Number(String(src.context || '').match(/\bChapter\s+(\d+)/i)?.[1]) || null);
  if (n == null) return null;
  const [mine, theirs] = await Promise.all([chapterRows(src.doc_id, n, d), chapterRows(member.id, n, d)]);
  if (!theirs?.length) return null;
  const v = verseSpan(src);
  if (v && theirs.some(verseSpan)) {
    const hit = theirs.filter((r) => { const s = verseSpan(r); return s && s[1] >= v[0] && s[0] <= v[1]; });
    return hit.length ? { rows: hit, by: 'reference', exact: true, ref: `${n}:${v[0]}` } : null;
  }
  const i = mine?.findIndex((r) => r.id === src.id) ?? -1;
  if (i < 0) return null;
  if (mine.length === theirs.length) return { rows: [theirs[i]], by: 'reference', exact: true, ref: `${n}:${i + 1}` };
  const j = Math.min(theirs.length - 1, Math.round(i * theirs.length / mine.length));   // different paragraphing: the nearest rows, marked approximate
  return { rows: theirs.slice(Math.max(0, j - 1), j + 2), by: 'reference', exact: false, ref: `${n}:~${i + 1}` };
}
/** By meaning: the member's paragraph nearest the source by cross-lingual phrase vectors (one search inside that edition). */
export async function alignByMeaning(src, member, d) {
  const r = await d.phrases(String(src.text).slice(0, 600), { limit: 2, filters: { documentId: member.id } }).catch(() => ({ hits: [] }));
  const top = r?.hits?.[0];
  if (!top) return null;
  const row = (await d.paragraphsByIds([top.paragraph_id]).catch(() => []))[0];
  return row ? { rows: [row], by: 'meaning', exact: false, score: top.score ?? null } : null;
}
/** By PLACE (11-12): no chapter numbers and no phrase vectors for the member (a provisional translation not yet phrase-indexed) →
 *  the rows at the same share of the work, marked approximate. Same-work members only (sameWorkFirst ranked them by title). */
export async function alignByPlace(src, member, selfCount, d) {
  const sc = Number(selfCount), mc = Number(member.paragraph_count), i = Number(src.paragraph_index);
  if (!(sc > 0 && mc > 0 && Number.isFinite(i)) || !member.sameWork) return null;
  const j = Math.round(i * mc / sc);
  const rows = (await d.paragraphsInRange(member.id, Math.max(0, j - 3), j + 3, { limit: 7 }).catch(() => [])).filter(text0);
  if (!rows.length) return null;
  const near = rows.sort((a, b) => Math.abs(a.paragraph_index - j) - Math.abs(b.paragraph_index - j)).slice(0, 2).sort((a, b) => a.paragraph_index - b.paragraph_index);
  return { rows: near, by: 'place', exact: false, ref: `~${Math.round(100 * i / sc)}%` };
}

// by VERSE TABLE (11-10): a Qur’án edition whose verse layout numbering.js knows (checked by title, language and paragraph_count) → the same
// verses in the other known-layout editions, exact. Its authorless editions have no work family (Pickthall: author "Unknown"), so this needs none.
const QURAN_DOC_FIELDS = ['id', 'title', 'author', 'religion', 'collection', 'language', 'paragraph_count'];
const layoutOf = (doc) => QURAN_LAYOUTS.find((L) => String(doc?.title || '').toLowerCase().includes(L.title.toLowerCase()) && /qur|koran/i.test(doc.title)
  && langCode(doc.language) === L.language && Number(doc.paragraph_count) === layoutTotal(L)) || null;
export async function alignByVerseTable(src, want, d) {
  if (!d.listDocs) return [];
  const self = (await d.listDocs({ ids: [Number(src.doc_id)], fields: QURAN_DOC_FIELDS, limit: 1, count: false }).catch(() => ({ docs: [] })))?.docs?.[0];
  const L = layoutOf(self), v = L ? quranVerseAt(L, Number(src.paragraph_index)) : null;
  if (!v || (v.from === 0 && v.sura !== 1)) return [];   // front matter, a heading, or a basmala row (the Arabic edition has none of its own)
  const orig = ORIGINAL_LANGS.Islam, out = [];
  for (const M of QURAN_LAYOUTS.filter((x) => x !== L && (want === 'original' ? orig.includes(x.language) : !orig.includes(x.language)))) {
    const { docs = [] } = await d.listDocs({ title: M.title, language: M.language, fields: QURAN_DOC_FIELDS, limit: 20, count: false }).catch(() => ({ docs: [] }));
    const m = docs.filter((x) => layoutOf(x) === M).sort((a, b) => a.id - b.id)[0];
    const a = m ? quranIndex(M, v.sura, Math.max(v.from, 1)) : null, b = m ? quranIndex(M, v.sura, v.to || 1) : null;
    if (a == null || b == null) continue;
    const rows = (await d.paragraphsInRange(m.id, a, b).catch(() => [])).filter(text0);
    const how = { by: 'reference', exact: true, ref: `${v.sura}:${Math.max(v.from, 1)}${v.to > Math.max(v.from, 1) ? `–${v.to}` : ''}` };
    out.push(...rows.map((r) => asPassage({ ...r, doc_id: r.doc_id ?? m.id }, { ...m, basis: 'verse table' }, want === 'original' ? 'original' : 'translation', how)));
  }
  return out;
}

const NEED = ['resolveLinks', 'workFamily', 'headingStarts', 'paragraphsInRange', 'paragraphsByIds', 'phrases'];
// exact-text twins of a passage in OTHER docs: its first ~12 words through literal_search's layer (BM25), the rows by id
const liveTwins = async (src) => {
  const kw = await (await import('./tools.js')).layerFn('literal_search'), pr = await import('../paragraphs-repo.js');
  const span = String(src.text || '').split(/\s+/).slice(0, 12).join(' ');
  const hits = span ? (await kw(span, { limit: 12, filters: {}, timeoutMs: 3000 }))?.hits || [] : [];
  return (await pr.paragraphsByIds(hits.map((h) => h.paragraph_id))).filter((r) => Number(r.doc_id) !== Number(src.doc_id));
};
const defaults = async () => {
  const [plinks, al, pr, layers] = await Promise.all([import('../passage-links.js'), import('../repos/alignment-repo.js'), import('../paragraphs-repo.js'), import('../search/qdrant-layers.js')]);
  return { listDocs: (await import('../docs-repo.js')).listDocs, resolveLinks: plinks.resolveLinks, workFamily: al.workFamily, headingStarts: pr.headingStarts, paragraphsInRange: pr.paragraphsInRange, paragraphsByIds: pr.paragraphsByIds, phrases: layers.searchPhrases, twins: liveTwins };
};
const asPassage = (row, m, role, how) => ({ id: row.id, document_id: row.doc_id ?? m.id, paragraph_index: row.paragraph_index ?? null, text: row.text, title: m.title, author: m.author,
  religion: m.religion ?? null, collection: m.collection ?? null, language: langCode(m.language), role, aligned_by: how.by, exact: !!how.exact,
  ...(how.ref ? { ref: how.ref } : {}), ...(how.score != null ? { score: how.score } : {}), basis: m.basis });

// Same-author candidates are only candidates (a name is evidence, not identity): the ones whose MAIN title is the same work's
// ("Tafsír-i-Súriy-i-Kawthar" ↔ "Tafsir-i-Suratu'l-Kawthar (… provisional translation)") come first, and when any does, the
// author's other works are dropped — aligning by meaning against a different book returns a wrong "translation" (11-12: the Báb's
// English Kawthar sat past the 12-row cap behind his other works). A title in another script scores 0: then all stay, in order.
export function sameWorkFirst(self, members, min = 0.85) {
  const k = mainKey(self?.title), sc = (m) => (k ? titleScore(k, mainKey(m.title)) : 0), sk = sourceKey(self?.source_url);
  const fixed = members.filter((m) => m.basis !== 'author'), cand = members.filter((m) => m.basis === 'author').map((m) => ({ m, s: sc(m) }));
  // the same file in another language (…/bab-pub02-77_en.docx ↔ …/bab-pub02-77-ar/) is the same work, ahead of any title match
  const slug = sk ? cand.filter((x) => sourceKey(x.m.source_url) === sk).map((x) => x.m) : [];
  const same = cand.filter((x) => x.s >= min && !slug.includes(x.m)).sort((a, b) => b.s - a.s).map((x) => x.m);
  const pick = [...slug, ...same];
  // the same file ranks right after the recorded original, ahead of docs that merely have alignment rows (11-13: a study paper quoting the
  // Tablet of Aḥmad filled the translation slots before the tablet's own -en file)
  const rec = fixed.filter((m) => m.basis === 'original_doc_id').map((m) => ({ ...m, sameWork: true })), rest = fixed.filter((m) => m.basis !== 'original_doc_id');
  return [...rec, ...slug.map((m) => ({ ...m, sameWork: true })), ...rest, ...(pick.length ? same.map((m) => ({ ...m, sameWork: true })) : cand.slice(0, 12).map((x) => x.m))];
}
/** A source URL's file key: last path segment, lower-cased, extension and trailing language tag (_en, -ar …) stripped; '' when none. Pure. */
export const sourceKey = (url) => {
  const seg = String(url || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
  const k = seg.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '').replace(new RegExp(`[-_](${Object.keys(LANG).join('|')})$`), '');
  return k.length >= 4 ? k : '';
};

/** paragraphId → { passages: [{…, role 'original'|'translation', aligned_by 'link'|'reference'|'meaning', exact}], self, family, missing_language }.
 *  want 'original' = an edition in another language (the recorded original first); 'translations' = the other editions. */
export async function editionsOf(paragraphId, { want = 'original', limit = 3 } = {}, deps = {}) {
  const d = NEED.every((k) => deps[k]) ? deps : { ...(await defaults()), ...deps };
  const id = Number(paragraphId), src = (await d.paragraphsByIds([id]).catch(() => []))[0];
  if (!src) return { passages: [], self: null, family: [], missing_language: null };
  const found = [], seen = new Set([id]), role = want === 'original' ? 'original' : 'translation';
  const push = (p) => { if (p?.text && !seen.has(p.id)) { seen.add(p.id); found.push(p); } };
  // 1. recorded links (the Bahá'í Persian/Arabic pairing is one provider)
  const l = (await d.resolveLinks([id], { quotedBy: false }).catch(() => new Map())).get(id);
  for (const p of (want === 'original' ? [l?.original].filter(Boolean) : l?.translations || [])) {
    push({ id: p.id, document_id: p.documentId ?? p.doc_id ?? null, text: p.text, title: p.document?.title ?? p.title ?? null, author: p.document?.author ?? p.author ?? null,
      religion: p.document?.religion ?? p.religion ?? null, language: langCode(p.language || p.document?.language), role, aligned_by: 'link', exact: true, basis: 'recorded link' });
  }
  // 1b. a known verse table (the Qur’án editions): exact, no work family needed
  for (const p of await alignByVerseTable(src, want, d).catch(() => [])) push(p);
  // 2–3. the work family: each other-language member aligned by reference, else by meaning
  const sameWorkIds = new Set();
  const family = async (row, out, cap) => {
    const fam0 = await d.workFamily(row.doc_id, { authors: 5000 }).catch(() => ({ self: null, members: [] }));
    const fam = { ...fam0, members: sameWorkFirst(fam0.self, fam0.members || []) };
    const selfLang = langCode(fam.self?.language), origId = Number(fam.self?.original_doc_id) || null;
    const members = (fam.members || []).filter((m) => langCode(m.language) !== selfLang)
      // a recorded direction decides where it is known: this doc's original is its original_doc_id; the rest of the recorded family are translations
      .filter((m) => m.basis !== 'original_doc_id' || (want === 'original') === (m.id === origId))
      // with no recorded direction, an "original" is only an edition in the tradition's original languages (11-12: the Arabic tafsir's English
      // translation came back as its "original" because it was simply another language)
      .filter((m) => want !== 'original' || m.basis === 'original_doc_id' || !ORIGINAL_LANGS[fam.self?.religion] || ORIGINAL_LANGS[fam.self?.religion].includes(langCode(m.language)));
    for (const m of members) {
      // the same work (its own source file in another language) is always tried: 11-13 a study paper's recorded links filled every slot
      // and the tablet's own -en file never got a vote
      if (out.length >= cap && !m.sameWork) break;
      const how = (await alignByReference(row, m, d).catch(() => null)) || (await alignByMeaning(row, m, d).catch(() => null))
        || (await alignByPlace(row, m, fam.self?.paragraph_count, d).catch(() => null));
      for (const r of how?.rows || []) { const p = asPassage(r, m, role, how); if (p?.text && !seen.has(p.id) && !out.some((x) => x.id === p.id)) { out.push(p); if (m.sameWork) sameWorkIds.add(p.id); } }
    }
    return fam;
  };
  const fam = await family(src, found, limit);
  found.forEach((p) => seen.add(p.id));
  // 3b. nothing exact for an original: the same words in OTHER docs (the English twin of a prayer, a compilation's anchor) have their own work
  // family; the first exact or same-work (slug/title) result wins, the meaning results stay as the last resort
  if (want === 'original' && d.twins && !found.some((p) => p.exact)) {
    // a twin holds the passage's own opening words (a BM25 neighbour sharing common words is not one), one per doc
    const fold = (x) => String(x || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const head = fold(src.text).split(' ').slice(0, 8).join(' '), docs = new Set();
    const twins = (await d.twins(src).catch(() => [])).filter((t) => t?.id && Number(t.doc_id) !== Number(src.doc_id) && head && fold(t.text).includes(head)
      && !docs.has(Number(t.doc_id)) && docs.add(Number(t.doc_id))).slice(0, 3);
    for (const t of twins) {
      const got = []; await family(t, got, limit);
      const best = got.filter((p) => p.exact || sameWorkIds.has(p.id));
      // the twin's same work replaces the meaning-only guesses from the anchor's own family (unrelated tablets of the same author)
      if (best.length) { const keep = found.filter((p) => p.exact || sameWorkIds.has(p.id)); found.splice(0, found.length, ...best.filter((p) => !seen.has(p.id)), ...keep); best.forEach((p) => seen.add(p.id)); break; }
    }
  }
  const selfLang = langCode(fam.self?.language);
  const trad = fam.self?.religion ?? null;
  // the passage IS the original: nothing else was found and its own work is in one of the tradition's original languages (11-12: the Arabic
  // Kawthar's opening answered "no original edition" and the side-by-side was never fetched)
  if (want === 'original' && !found.length && (ORIGINAL_LANGS[trad] || []).includes(selfLang)) {
    found.push({ id: src.id, document_id: src.doc_id, paragraph_index: src.paragraph_index ?? null, text: src.text, title: fam.self.title, author: fam.self.author ?? null,
      religion: trad, language: selfLang, role: 'original', aligned_by: 'self', exact: true, basis: 'the passage itself' });
  }
  const have = new Set(found.map((x) => x.language));
  const missing = want === 'original' && !found.length ? (ORIGINAL_LANGS[trad] || []).filter((x) => x !== selfLang && !have.has(x)).map(langName).join(' or ') || null : null;
  return { passages: found, self: fam.self ? { id: fam.self.id, title: fam.self.title, language: selfLang, religion: trad } : null,
    family: (fam.members || []).map((m) => ({ id: m.id, title: m.title, language: langCode(m.language), basis: m.basis })), missing_language: missing };
}

/** paragraphId → its place in its work: { chapter, verse, exact } from the heading number + the verse marker, else its place in the chapter
 *  (marked approximate); null when the work has no numbered chapters. Read-only; deps injected (tests). */
export async function referenceOf(paragraphId, deps = {}) {
  const d = NEED.every((k) => deps[k]) ? deps : { ...(await defaults()), ...deps };
  const row = (await d.paragraphsByIds([Number(paragraphId)]).catch(() => []))[0];
  if (!row) return null;
  const n = chapterNo(row.heading) ?? (Number(String(row.context || '').match(/\bChapter\s+(\d+)/i)?.[1]) || null);
  if (n == null) return null;
  const v = verseSpan(row);
  if (v) return { chapter: n, verse: v[0] === v[1] ? `${v[0]}` : `${v[0]}-${v[1]}`, exact: true };
  const i = (await chapterRows(row.doc_id, n, d).catch(() => null))?.findIndex((r) => r.id === row.id) ?? -1;
  return { chapter: n, verse: i >= 0 ? `${i + 1}` : null, exact: false };
}
