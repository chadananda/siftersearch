// SOURCE TIER of a Bahá'í passage, from metadata the library already has (writer fold, collection, docType) — never from its
// words (Chad 11-04: "'Abdu'l-Baha's talks are not totally authoritative (similar to pilgrim notes), the original tablets are
// authoritative"). writings > guardian > reported (talks, pilgrims' notes) > house (law, administration) > secondary.
// Labels the passage heads the researcher and the writer read, and orders a search's passages. Pure. Deps: canonical, doctrinal-rank.
import { docType } from '../rights/canonical.js';
import { foldKey, isTalk } from '../search/doctrinal-rank.js';

const WRITINGS = new Set(['bahaullah', 'thebab', 'bab', 'abdulbaha']);
const GUARDIAN = 'shoghieffendi';
const HOUSE = /universalhouseofjustice|researchdepartment/;
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

/** → 'writings' | 'guardian' | 'reported' | 'house' | 'secondary' for a Bahá'í passage; null for other traditions and web
 *  results (they keep their own standing). p: { author|source_author, book_author, title|source_title, collection, religion }. */
export function sourceTier(p = {}) {
  if (!p || p.web) return null;
  const author = keyOf(p.author ?? p.source_author);
  const central = WRITINGS.has(author) || author === GUARDIAN;
  if (!isBahai(p) && !central && !HOUSE.test(author)) return null;
  const doc = { title: p.title ?? p.source_title, collection: p.collection, author: p.author ?? p.source_author };
  const kind = docType(doc);
  if (WRITINGS.has(author) && authenticatedWork(doc.title)) return 'writings';   // before any talk rule: SAQ sits in "Core Talks"
  if (isTalk(p.collection)) return 'secondary';                          // a modern speaker's recorded talk: commentary
  if (kind === 'pilgrim-notes' || /pilgrim notes/i.test(String(p.collection || ''))) return 'reported';
  if (kind === 'talk') return central ? 'reported' : 'secondary';       // a Central Figure's spoken words, as recorded
  if (central && reportedWork(doc.title)) return 'reported';            // Promulgation, Paris Talks, London… (titles that don't say "talk")
  // a Central Figure quoted inside another writer's book is a pointer to the text, not the text (the writer traces it)
  const book = keyOf(p.book_author);
  const ownBook = (k) => ['bahaullah', 'thebab', 'abdulbaha', GUARDIAN].some((w) => k.includes(w)) || HOUSE.test(k);   // "Bahá'u'lláh and 'Abdu'l-Bahá" too
  const quotedElsewhere = central && book && book !== author && !ownBook(book) && kind !== 'compilation';
  if (quotedElsewhere) return 'secondary';
  if (WRITINGS.has(author)) return 'writings';
  if (author === GUARDIAN) return 'guardian';
  if (HOUSE.test(author)) return 'house';
  return 'secondary';
}

export const TIER_ORDER = ['writings', 'guardian', 'reported', 'house', 'secondary'];
const rankOf = (p) => { const t = sourceTier(p); const i = TIER_ORDER.indexOf(t); return i < 0 ? TIER_ORDER.length : i; };

/** Passages in tier order, search rank kept within a tier (stable). Non-Bahá'í passages keep their place after the tiers. Pure. */
export const byTier = (ps = []) => ps.map((p, i) => [p, i]).sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || a[1] - b[1]).map(([p]) => p);

/** Is any passage from the authoritative written tier (the Writings or Shoghi Effendi)? */
export const hasAuthoritative = (ps = []) => ps.some((p) => ['writings', 'guardian'].includes(sourceTier(p)));

/** The label a passage head carries (researcher and writer). */
export const TIER_LABEL = {
  writings: 'WRITINGS (a written text of the Báb, Bahá’u’lláh or ‘Abdu’l-Bahá — authoritative)',
  guardian: 'SHOGHI EFFENDI (authoritative interpretation)',
  reported: 'REPORTED SPEECH (a talk or a pilgrim’s recollection, not a written text — say so when you cite it: "in a talk recorded in…")',
  house: 'UNIVERSAL HOUSE OF JUSTICE (law and administration — no doctrinal or interpretive authority)',
  secondary: 'SECONDARY (commentary — a signpost to the Writings, never their support)',
};
export const tierLabel = (p) => {
  const t = sourceTier(p); if (!t) return null;
  const title = p.title ?? p.source_title;
  const note = (t === 'reported' && reportedWork(title)?.note) || (t === 'writings' && authenticatedWork(title)?.note);
  return note ? `${TIER_LABEL[t]} — ${note}` : TIER_LABEL[t];
};
