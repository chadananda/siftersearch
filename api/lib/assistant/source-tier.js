// SOURCE TIER of a Bahá'í passage, from metadata the library already has (writer fold, collection, docType) — never from its
// words (Chad 11-04: "'Abdu'l-Baha's talks are not totally authoritative (similar to pilgrim notes), the original tablets are
// authoritative"). writings > guardian > narrative (Nabíl's Dawn-Breakers) > compilation (a Writings compilation's unattributed passage) > reported (talks,
// pilgrims' notes) > house (law, administration) > secondary.
// Labels the passage heads the researcher and the writer read, and orders a search's passages. Pure. Deps: canonical, doctrinal-rank.
import { docType } from '../rights/canonical.js';
import { foldKey, isTalk, writingsCompilation } from '../search/doctrinal-rank.js';

const WRITINGS = new Set(['bahaullah', 'thebab', 'bab', 'abdulbaha']);
const GUARDIAN = 'shoghieffendi';
const HOUSE = /universalhouseofjustice|researchdepartment/;
// an author field naming who SUPERVISED or EDITED a volume ("The Universal House of Justice (prepared under its supervision)" —
// The Bahá'í World): its articles are other people's (11-04: Hatcher's essay in BW XVIII was replied as "the House quotes it")
const EDITED = /preparedunder|supervision|undertheauspices|editor|editedby/;
const houseWrote = (k) => HOUSE.test(k) && !EDITED.test(k);
// every other administrative body — an Assembly (NSA, LSA), the Teaching Centre, Counsellors, Auxiliary Boards, teaching committees —
// ranks no higher than the House: never 'reported', even when filed under Pilgrim Notes (Chad 11-14: talks and pilgrim notes rank
// above "any other authority, including … ITC, NSA, LSA, ABM, CBC, NTC, RTC and UHJ"; doc 9296, the ITC's guidance on pilgrim notes)
const ADMIN = /spiritualassembl|teachingcent(?:re|er)|boardofcounsel|counsellors|auxiliaryboard|teachingcommittee|^(?:nsa|lsa|itc|abm|cbc|ntc|rtc)(?:of|$)/;
const isBahai = (p) => /bah[aá]/i.test(String(p?.religion || ''));
const keyOf = (s) => foldKey(s);

/** Works by a Central Figure that are REPORTED, not written, though their titles don't say "talk": talks taken down by others.
 *  The Western public talks are "imperfect renderings" of statements "partially understood" (Chad 11-04). Chad's domain
 *  knowledge (08-26, 11-04), by title — the metadata cannot reveal it. noOriginal: no authored Persian/Arabic text exists to
 *  find (source-survey reads this list). */
export const REPORTED_WORKS = [
  { re: /promulgation of universal peace/i, noOriginal: true, note: 'a public talk in the West: an imperfect rendering, taken down by others, of words partially understood — not an authenticated text' },
  { re: /paris talks/i, noOriginal: true, note: 'a public talk in the West: an imperfect rendering, taken down by others, of words partially understood — not an authenticated text' },
  { re: /abdu.?l.?bah[áa] in london/i, noOriginal: true, note: 'a public talk in the West: an imperfect rendering, taken down by others, of words partially understood — not an authenticated text' },
  { re: /divine philosophy/i, note: 'a public talk in the West: an imperfect rendering, taken down by others, of words partially understood — not an authenticated text' },
  { re: /foundations of world unity/i, note: 'a public talk in the West: an imperfect rendering, taken down by others, of words partially understood — not an authenticated text' },
  { re: /\bspoken (?:at|in|to|on|by)\b/i },   // 'Abdu'l-Bahá's recorded Persian talks: "Words to Mr Pinchot and others, spoken at his estate…"
];
export const NO_AUTHORED_ORIGINAL = REPORTED_WORKS.filter((w) => w.noOriginal).map((w) => w.re);
const reportedWork = (title) => REPORTED_WORKS.find((w) => w.re.test(String(title || '')));
/** Spoken, but reviewed and corrected by 'Abdu'l-Bahá himself → authoritative, a Writing (Chad 11-04: "Some Answered
 *  Questions is not considered 'talks' because it was reviewed and edited by Abdu'l-Baha. It is authoritative."). */
export const AUTHENTICATED_WORKS = [
  { re: /some answered questions|mufāva?ḍāt|mufavadat|mufávaḍát/i, note: 'table talks ‘Abdu’l-Bahá reviewed and corrected himself — authoritative' },
];
const authenticatedWork = (title) => AUTHENTICATED_WORKS.find((w) => w.re.test(String(title || '')));

/** THE NARRATIVE (Chad 11-14, Dawn-Breakers battery: Nabíl was held back as 'secondary' and left out by coreFirst — "The library does
 *  not give me Nabíl's own chapter" with doc 21308 in the library): Nabíl's history in Shoghi Effendi's translation is THE narrative
 *  source for the Bábí period, after the Writings and Shoghi Effendi. By title (a whole-book copy, also a file-name title), never a
 *  letter or study that names it in its title ("Letters of Living, Dawn-Breakers, Quddús" by the House). NARRATIVE_DOCS: the
 *  library's copy searched inside on a history question that found none of it (tool-runner searchLibrary). */
const NARRATIVE_TITLE = /^(?:the\s+)?dawn[-\s]?breakers\b|nab[ií]l['’]?s\s+narrative|[-_]the[-_]dawn[-_]breakers/i;
export const NARRATIVE_DOCS = [21308];
const narrativeWork = (p, author) => NARRATIVE_TITLE.test(String(p.title ?? p.source_title ?? '').trim()) && !HOUSE.test(author);
export const isNarrative = (p = {}) => !!p && !p.web && (NARRATIVE_DOCS.includes(Number(p.document_id ?? p.doc_id)) || narrativeWork(p, keyOf(p.author ?? p.source_author)));

/** → 'writings' | 'guardian' | 'narrative' | 'compilation' | 'reported' | 'house' | 'secondary' for a Bahá'í passage; null for other traditions and web
 *  results (they keep their own standing). p: { author|source_author, book_author, title|source_title, collection, religion }. */
export function sourceTier(p = {}) {
  if (!p || p.web) return null;
  const author = keyOf(p.author ?? p.source_author);
  const central = WRITINGS.has(author) || author === GUARDIAN;
  if (!isBahai(p) && !central && !HOUSE.test(author)) return null;
  const doc = { title: p.title ?? p.source_title, collection: p.collection, author: p.author ?? p.source_author };
  const kind = docType(doc);
  if (isBahai(p) && narrativeWork(p, author)) return 'narrative';        // Nabíl's paragraphs, the voices he quotes, the Guardian's translation copy
  if (!central && ADMIN.test(author)) return 'secondary';                // an Assembly's, the Teaching Centre's, a Counsellor's own document
  if (WRITINGS.has(author) && authenticatedWork(doc.title)) return 'writings';   // before any talk rule: SAQ sits in "Core Talks"
  if (isTalk(p.collection)) return 'secondary';                          // a modern speaker's recorded talk: commentary
  if (kind === 'pilgrim-notes' || /pilgrim notes/i.test(String(p.collection || ''))) return 'reported';
  if (kind === 'talk') return central ? 'reported' : 'secondary';       // a Central Figure's spoken words, as recorded
  if (central && reportedWork(doc.title)) return 'reported';            // Promulgation, Paris Talks, London… (titles that don't say "talk")
  // a Central Figure quoted inside another writer's book is a pointer to the text, not the text (the writer traces it)
  const book = keyOf(p.book_author);
  const ownBook = (k) => ['bahaullah', 'thebab', 'abdulbaha', GUARDIAN].some((w) => k.includes(w)) || houseWrote(k);   // "Bahá'u'lláh and 'Abdu'l-Bahá" too
  // a compilation of the Writings ("Compilation (Bahá’í Writings)") is the text's home, not another writer's book (11-04 #242)
  const writingsBook = () => writingsCompilation({ ...doc, author: p.book_author, book_author: p.book_author });
  const quotedElsewhere = central && book && book !== author && !ownBook(book) && kind !== 'compilation' && !writingsBook();
  if (quotedElsewhere) return 'secondary';
  if (WRITINGS.has(author)) return 'writings';
  if (author === GUARDIAN) return 'guardian';
  if (houseWrote(author)) return 'house';
  // a passage of a compilation of the Writings with no writer attributed: not commentary (11-04 digest #242 — "Bahá’í World
  // Faith", "Bahá’í Sacred Writings" were all 'secondary'), not a confirmed Writing either (doctrinal-rank.js writingsCompilation)
  if (writingsCompilation({ ...doc, book_author: p.book_author })) return 'compilation';
  return 'secondary';
}

/** A Central Figure or Shoghi Effendi as the writer of a document filed under ANOTHER tradition: a metadata contradiction (11-14 replay:
 *  "Paradise and Paradigm", a scholar's study on the Christian shelf with author "Bahá'u'lláh", became the source card "— Bahá'u'lláh").
 *  Never a source, never credited to that writer on a card. A document with no religion is not judged. Pure. */
export const misfiled = (p = {}) => !!p?.religion && !isBahai(p) && [p.author, p.source_author, p.writer, p.book_author]
  .some((w) => { const k = keyOf(String(w || '').split(/[,;&]| and /)[0]); return WRITINGS.has(k) || k === GUARDIAN; });

/** Why a passage has no tier when it may be Bahá'í: its document has no religion, so its standing cannot be read (the 11-04
 *  traces: "The Pattern of Bahá'í Life", author '4461', religion null). A METADATA gap — logged and counted, never guessed. */
export function tierGap(p = {}) {
  if (!p || p.web || !('religion' in p) || p.religion) return null;   // no religion FIELD = a raw layer hit, not a hydrated document
  return 'no-religion';
}

export const TIER_ORDER = ['writings', 'guardian', 'narrative', 'compilation', 'reported', 'house', 'secondary'];
// within reported speech, a Central Figure's recorded talk before a pilgrim's recollection (Chad 11-14: "it's OK to use talks
// but better to use written texts"; pilgrim notes after talks, scholarship last)
const isPilgrim = (p) => docType({ title: p.title ?? p.source_title, collection: p.collection, author: p.author ?? p.source_author }) === 'pilgrim-notes' || /pilgrim notes/i.test(String(p.collection || ''));
export const rankOf = (p) => { const t = sourceTier(p); const i = TIER_ORDER.indexOf(t); return i < 0 ? TIER_ORDER.length : i + (t === 'reported' && isPilgrim(p) ? 0.5 : 0); };

// Within one tier, the authorized or published translation before an individual's (feedback citation source order; round 5: a
// compilation on justice led with Juan Cole's translation of the Manakji tablet). From metadata only: the 'Tablet Translations'
// shelf, a "(provisional translation)" title, a provisional / personal translation label, or a named translator who is not
// Shoghi Effendi or an institution. 0 = authorized/published, 1 = an individual's rendering. Pure.
const OFFICIAL = /shoghi|world cent(?:re|er)|house of justice|research department|committee|publishing trust/i;
// A passage with no collection (research sets stored none before 11-14 — the held Evil One set: Savi's "A Hymn to Love" counted as an
// authorized Writing, so commentary was never left out) is read from its address, which is metadata too: the library's Tablet
// Translations shelf, and bahai-library.com, which names a document <writer>_<title> — a Central Figure's or Shoghi Effendi's own
// text is filed under them (bahaullah_hall_…, bab_…), any other first word is another person's document (savi_hymn_love, hornby_…).
const urlOf = (p) => String(p?.source_url || p?.url || p?.citation_url || '');
const TT_URL = /\/library\/bahai\/tablet-translations\//i;
const BL_DOC = /^https?:\/\/(?:www\.)?bahai-library\.(?:com|org)\/([a-z][a-z-]*?)_/i;
const OWN_SLUG = /^(?:bahaullah|bab|abdulbaha|abdul-baha|shoghieffendi|shoghi-effendi|compilation|compilations)$/i;
export const othersDocument = (p = {}) => { const m = BL_DOC.exec(urlOf(p)); return !!m && !OWN_SLUG.test(m[1]); };
const shelfOf = (p) => String(p.collection || (TT_URL.test(urlOf(p)) ? 'Tablet Translations' : '')).trim();
export const translationRank = (p = {}) => {
  if (!p || !isBahai(p)) return 0;
  const label = String(p.translation || ''), by = String(p.translator || p.translated_by || '');
  if (/^tablet translations$/i.test(shelfOf(p)) || /\(provisional translation\)/i.test(String(p.title ?? p.source_title ?? ''))) return 1;
  if (othersDocument(p)) return 1;
  if (/^(?:provisional|translation by)\b/i.test(label) && !OFFICIAL.test(label)) return 1;
  return by && !OFFICIAL.test(by) ? 1 : 0;
};

/** Passages in tier order (an authorized translation before an individual's within a tier), search rank kept otherwise (stable).
 *  Non-Bahá'í passages keep their place after the tiers. Pure. */
export const byTier = (ps = []) => ps.map((p, i) => [p, i]).sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || translationRank(a[0]) - translationRank(b[0]) || a[1] - b[1]).map(([p]) => p);

/** Is any passage from the authoritative written tier (the Writings or Shoghi Effendi)? */
export const isWrittenCore = (p) => ['writings', 'guardian'].includes(sourceTier(p));
// an AUTHORIZED written core passage: an individual's rendering ('Tablet Translations', a provisional translation — often with the
// translator's own commentary in the same document, 11-14: Savi's "A Hymn to Love" is filed under Bahá'u'lláh) does not count toward
// CORE_ENOUGH, and is left out with commentary once the authorized core is enough
const authorizedCore = (p) => isWrittenCore(p) && translationRank(p) === 0;
export const hasAuthoritative = (ps = []) => ps.some(isWrittenCore);

/** CORE TEXTS FIRST (Chad 11-14: "answer the questions from core texts when possible, not stray into Julio Savi. Books by
 *  scholars should only be used if necessary"; "thousands of written texts in English and Arabic and Farsi … all higher
 *  authority than books by scholars"). This many written core passages (English Writings, Shoghi Effendi, and the Persian/
 *  Arabic originals) are enough to answer from: commentary is then left out of what reaches the writer. */
export const CORE_ENOUGH = 3;
/** Does a Bahá'í search need the Writings searched on the same point? Too few written core passages, or a talk, a
 *  recollection or commentary ranked ahead of the first written one. Pure. */
export const needsWritings = (ps = []) => {
  const tiered = ps.filter((p) => sourceTier(p));
  return tiered.filter(authorizedCore).length < CORE_ENOUGH || (tiered.length > 0 && !authorizedCore(tiered[0]));
};
/** → { kept, left }: commentary ('secondary') left out when the written core (plus `originals`, the Persian/Arabic Writings
 *  shown beside) reaches CORE_ENOUGH; talks and recollections always kept (a preference, never an exclusion). Pure. */
export const coreFirst = (ps = [], originals = 0) => {
  if (ps.filter(authorizedCore).length + originals < CORE_ENOUGH) return { kept: ps, left: 0 };
  const kept = ps.filter((p) => sourceTier(p) !== 'secondary' && !(isWrittenCore(p) && translationRank(p) === 1));
  return { kept, left: ps.length - kept.length };
};

/** The label a passage head carries (researcher and writer). */
export const TIER_LABEL = {
  writings: 'WRITINGS (a written text of the Báb, Bahá’u’lláh or ‘Abdu’l-Bahá — authoritative)',
  guardian: 'SHOGHI EFFENDI (authoritative interpretation)',
  narrative: 'THE NARRATIVE (Nabíl’s The Dawn-Breakers, translated by Shoghi Effendi — THE narrative source for the Báb’s ministry and the Bábí period: tell the events from it and quote it; the Writings and Shoghi Effendi lead where they speak to the same event; name it as Nabíl’s account)',
  compilation: 'COMPILATION OF THE WRITINGS (this passage’s writer is not attributed — cite the compilation by name; do not attribute it to a Central Figure unless another passage confirms who wrote it)',
  reported: 'REPORTED SPEECH (a talk or a pilgrim’s recollection, not a written text — a written text on the same point leads the argument; use this beside it when it adds something, named as spoken: "in a talk recorded in…")',
  house: 'UNIVERSAL HOUSE OF JUSTICE (law and administration — no doctrinal or interpretive authority)',
  secondary: 'SECONDARY (commentary — a signpost to the Writings, never their support: use it only for a point no Writing here addresses, and say it is that writer’s view; never quote a Central Figure through it)',
};
export const tierLabel = (p) => {
  const t = sourceTier(p); if (!t) return null;
  const title = p.title ?? p.source_title;
  const edited = t === 'secondary' && HOUSE.test(keyOf(p.author ?? p.source_author)) && EDITED.test(keyOf(p.author ?? p.source_author));
  const note = (t === 'reported' && reportedWork(title)?.note) || (t === 'writings' && authenticatedWork(title)?.note)
    || (edited && 'a volume the House supervised, not its words — the passage is by the article\'s own writer: name that writer if another passage shows who it is, otherwise say "an article in <title>", never "the House says"');
  return note ? `${TIER_LABEL[t]} — ${note}` : TIER_LABEL[t];
};
