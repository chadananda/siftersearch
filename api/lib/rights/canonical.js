// CANONICAL + DOCUMENT TYPE — the two questions Chad's ISBN rule asks (10-23: "with non-canonical books with ISBN codes, we
// should consider them copyright encumbered"; clarified: "This applies to published books"). Pure; no I/O.
// canonical = shareable whatever its ISBN: the Writings of the Báb, Bahá'u'lláh, 'Abdu'l-Bahá; Shoghi Effendi; the UHJ and
// other institutions; other traditions' scripture/classics (public domain); OceanLibrary-published works.
// docType = what kind of item it is; ONLY a 'book' is ever encumbered by the ISBN rule (papers, letters, talks, pilgrim notes,
// compilations, institutional documents, web pages, theses, newsletters are left alone). planning/rights-classification-plan.md

/** Lower-case, diacritics and apostrophes gone, everything else non-alphanumeric → one space. "‘Abdu’l-Bahá" → "abdul baha". */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['‘’ʼʻ`´]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

// The Central Figures and the Guardian, by name (spaced-normalised; joined forms catch "Abdul-Baha" / "Abdu'l-Bahá").
const WRITER_RE = /\b(baha ?u ?llah|bahaullah|abdu ?l ?baha|abdul ?baha|shoghi effendi|the bab|bab|nuqtiy i ula|hadrat i bab|siyyid ali muhammad)\b|بهاء ?الله|عبد ?البهاء|شوقی|شوقي|حضرت باب|نقطه اولی/;
// Institutions (Chad 10-20: "everything from institutions") — by author name.
const INSTITUTION_RE = /\b(universal house of justice|research department|bahai international community|international teaching cent(re|er)|(national|local|regional) spiritual assembly|spiritual assembly of|bahai world cent(re|er)|continental board|board of counsell?ors|office of social and economic development|bahai publishing trust|department of the secretariat|uhj|bic|itc|osed)\b|بیت العدل|بيت العدل|محفل/;

// Bahá'í shelves whose contents are the Writings, their translations/originals, or institutional texts.
export const CANONICAL_BAHAI_COLLECTIONS = Object.freeze([
  'Core Tablets', 'Core Talks', 'Tablet Translations', 'Compilations', 'Core Publications', 'CTAI Originals', 'Administrative',
  'Research Department Compilations', 'Shoghi Effendi', '‘Abdu’l-Bahá', 'Bahá’u’lláh',
]);
// Other traditions: everything is scripture/classics (public domain) EXCEPT these modern-scholarship shelves.
export const MODERN_OTHER_COLLECTIONS = Object.freeze([
  'Modern Theology', 'Modern', 'History and Scholarship', 'Sikh History', 'Encyclopedic References', 'History and Biography',
]);

const isOceanLibrary = (d) => d.source_site === 'oceanlibrary.com' || /oceanlibrary\.com/i.test(d.source_url || '')
  || /(^|\/)ocean ?library\//i.test(d.file_path || '');
const isBahai = (r) => /^bah/i.test(norm(r));

/**
 * Is this document canonical (shareable in full regardless of ISBN)? → { canonical, basis }.
 * doc: { author, religion, collection, source_site, source_url, file_path }
 */
export function canonicalOf(doc = {}) {
  if (isOceanLibrary(doc)) return { canonical: true, basis: 'oceanlibrary' };
  const a = norm(doc.author);
  if (a && WRITER_RE.test(a)) return { canonical: true, basis: 'writings' };
  if (a && INSTITUTION_RE.test(a)) return { canonical: true, basis: 'institutional' };
  const col = doc.collection || '';
  if (isBahai(doc.religion)) {
    if (CANONICAL_BAHAI_COLLECTIONS.includes(col)) return { canonical: true, basis: `collection:${col}` };
    // the Arabic/Persian volume shelves (Áthár-i-Qalam-i-A‘lá, Makátíb …) are named for Writings and hold only Writings
    if (/[À-ɏ‘’]/.test(col) && !/[a-z]{3,} (studies|notes|books)/i.test(col)) return { canonical: true, basis: `collection:${col}` };
    return { canonical: false, basis: null };
  }
  if (doc.religion && !MODERN_OTHER_COLLECTIONS.includes(col)) return { canonical: true, basis: 'scripture' };
  return { canonical: false, basis: null };
}
export const isCanonical = (doc) => canonicalOf(doc).canonical;

// Shelves that hold books (a book is eligible for the ISBN rule; nothing else is).
export const BOOK_COLLECTIONS = Object.freeze(['Books', "Baha'i Books", 'Reference', 'Study Guides', 'Shaykhi and Babi Studies',
  ...MODERN_OTHER_COLLECTIONS]);
const BY_COLLECTION = {
  Papers: 'paper', News: 'news', 'Pilgrim Notes': 'pilgrim-notes', Administrative: 'institutional', Media: 'media',
  "Baha'i Talks": 'talk', 'Core Talks': 'talk', Compilations: 'compilation', 'Research Department Compilations': 'compilation',
};
export const MIN_BOOK_PARAGRAPHS = 100;   // shorter than this is a pamphlet, article or page, not a book

/**
 * What kind of item is this? → 'book' | 'paper' | 'news' | 'newsletter' | 'pilgrim-notes' | 'talk' | 'letter' | 'compilation'
 * | 'institutional' | 'thesis' | 'web-page' | 'media' | 'metadata' | 'short' | 'other'. Title signals beat the shelf (a thesis
 * shelved under Books is a thesis). doc: { title, author, collection, source_site, doc_role, paragraph_count, document_type }
 */
export function docType(doc = {}) {
  if (doc.doc_role === 'metadata') return 'metadata';
  const t = norm(doc.title), dt = norm(doc.document_type);
  if (/\b(thesis|dissertation)\b/.test(t) || /thesis|dissertation/.test(dt)) return 'thesis';
  if (/\b(newsletter|bulletin|gazette|feast letter)\b/.test(t)) return 'newsletter';
  if (/\bpilgrims? notes?\b/.test(t)) return 'pilgrim-notes';
  if (/\b(compilation|compiled|selections from|extracts from)\b/.test(t)) return 'compilation';
  if (/^(letter|message|cable|memorandum) (from|to|of|dated)\b|\bletters? (from|written on behalf)\b/.test(t)) return 'letter';
  if (/\b(talks?|transcript|lecture|speech|address(es)? (by|at|given|delivered))\b/.test(t)) return 'talk';
  if (/\b(paper|article|journal|review|essay)\b/.test(dt)) return 'paper';
  if (BY_COLLECTION[doc.collection]) return BY_COLLECTION[doc.collection];
  if (INSTITUTION_RE.test(norm(doc.author))) return 'institutional';
  if (!BOOK_COLLECTIONS.includes(doc.collection) && !/\bbook\b/.test(dt)) {
    return doc.source_site && doc.source_site !== 'oceanlibrary.com' ? 'web-page' : 'other';
  }
  if ((doc.paragraph_count ?? 0) < MIN_BOOK_PARAGRAPHS) return 'short';
  return 'book';
}
