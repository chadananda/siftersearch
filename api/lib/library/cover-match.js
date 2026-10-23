// Match Chad's Bindery cover map (book id → image URL; the Bindery export gives each id its title/author) to library docs
// BY TITLE (Chad 10-22). Pure. Titles fold diacritics, quotes and "Vol. 1"/"Volume I"; a doc's subtitle after " - " or
// ": " is ignored ("The Sikh Religion Vol. 1 - Life of Guru Nanak" = "The Sikh Religion, Volume I"). Never guesses: two
// authors, or two covers for one title, → ambiguous. Why: covers keyed by md5(OceanLibrary bookid) only reached docs still
// labelled oceanlibrary.com; books moved into the main library (Sikh, 10-10) never got theirs.

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20 };
const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’‘ʼʻ`´']/g, '').replace(/&/g, ' and ');
/** Folded title: "The Sikh Religion, Volume I" → "the sikh religion volume 1". */
export function foldTitle(t) {
  return strip(t).replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\b(?:vol|volume)\s+([ivx]+|\d+)\b/g, (_, n) => `volume ${ROMAN[n] ?? Number(n)}`)
    .replace(/\s+/g, ' ');
}
/** Every folded form a title may match under: whole, before a subtitle, and each without a leading "the". */
export function titleKeys(t) {
  const raw = String(t || '');
  const forms = new Set([foldTitle(raw)]);
  const main = raw.split(/\s+[-–—]\s+|:\s+/)[0];
  if (main && main !== raw) forms.add(foldTitle(main));
  for (const f of [...forms]) if (f.startsWith('the ')) forms.add(f.slice(4));
  forms.delete('');
  return forms;
}
const AUTH_STOP = new Set(['the', 'of', 'and', 'by', 'tr', 'ed', 'compiled', 'compilation', 'unknown', 'none', 'various', 'sir', 'dr']);
const authorTokens = (a) => new Set(strip(a).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !AUTH_STOP.has(w)));
/** Two authors agree when either is unknown or they share a name word ("Bahá’u’lláh" = "Baha'u'llah"). */
export function authorsAgree(a, b) {
  const x = authorTokens(a), y = authorTokens(b);
  if (!x.size || !y.size) return true;
  for (const w of x) if (y.has(w)) return true;
  return false;
}
const wantsEnglish = (id) => /_en$/.test(id);
const isEnglish = (lang) => !lang || /^en/i.test(lang);
/** The cover's version as the image service names it: /img/covers/<id>?v=<sha256[:12]>. */
export const coverVersion = (url) => (String(url || '').match(/[?&]v=([0-9a-f]+)/) || [])[1] || null;

/**
 * @param {Array<{id,title,author}>} books  Bindery books that have a cover in the map
 * @param {(book) => Array<{id,title,author,language,cover_url}>} candidatesFor  docs found for a book's title
 * @returns {Array<{book, status:'matched'|'ambiguous'|'unmatched'|'collection', docs?, reason?}>}
 */
export function matchCovers(books, candidatesFor) {
  // two Bindery books (two covers) under one title can't be told apart by title → ambiguous, both
  const byKey = new Map();
  for (const b of books) for (const k of titleKeys(b.title)) byKey.set(k, [...(byKey.get(k) || []), b.id]);
  return books.map((book) => {
    if (book.id.startsWith('col-')) return { book, status: 'collection', reason: 'collection/work cover (OL_WORK_COVER, not a doc)' };
    const keys = titleKeys(book.title);
    const twins = new Set([...keys].flatMap((k) => byKey.get(k) || []).filter((id) => id !== book.id && !id.startsWith('col-')));
    const full = new Set([foldTitle(book.title), foldTitle(book.title).replace(/^the /, '')]);
    // a whole-title match may have an unknown author; a match only once the doc's subtitle is dropped needs a named,
    // agreeing author ("Kitáb-i-Íqán: Introduction to the 1950 Edition" by someone else is not the Íqán)
    const sameTitle = (d) => { const f = foldTitle(d.title); return full.has(f) || full.has(f.replace(/^the /, '')); };
    const viaMain = (d) => [...titleKeys(d.title)].some((k) => keys.has(k)) && authorTokens(book.author).size > 0
      && authorTokens(d.author).size > 0 && authorsAgree(book.author, d.author);
    const docs = (candidatesFor(book) || []).filter((d) => (sameTitle(d) || viaMain(d)) && (!wantsEnglish(book.id) || isEnglish(d.language)));
    if (!docs.length) return { book, status: 'unmatched' };
    if (twins.size) return { book, status: 'ambiguous', docs, reason: `${twins.size + 1} covers share this title: ${[book.id, ...twins].join(', ')}` };
    const agree = docs.filter((d) => authorsAgree(book.author, d.author));
    const authors = new Set(agree.map((d) => strip(d.author).replace(/[^a-z]+/g, '')));
    if (!agree.length) return { book, status: 'ambiguous', docs, reason: `title matches but author differs (cover: ${book.author || '—'})` };
    if (authors.size > 1 && [...authors].some((a) => a)) {
      // copies under differently spelled authors are fine only if they all agree with each other
      const list = agree.map((d) => d.author);
      if (!list.every((a) => list.every((b) => authorsAgree(a, b)))) return { book, status: 'ambiguous', docs: agree, reason: `different authors: ${[...new Set(list)].join(' / ')}` };
    }
    return { book, status: 'matched', docs: agree };
  });
}
