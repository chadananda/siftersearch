// DOCTRINAL AUTHORITY in ranking (Chad 10-20: "Authority with doctrine is absolutely critical"). A relevance score is
// multiplied by a factor from the PARAGRAPH's writer (content.authors — a compilation quoting Bahá'u'lláh is Bahá'u'lláh's
// words), steep enough to decide between passages of similar relevance. Two DOMAINS (Chad 10-23, a decision — see
// planning/anis-liliane-reviews.md):
//   doctrine (default) — the Writings of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá > Shoghi Effendi (letters on his behalf
//     included) > pilgrims' notes of the Central Figures and the Guardian > everything after the Guardian. "The House of
//     Justice has zero doctrinal or interpretive authority. Zero. As with everything below the status of Pilgrim Note" —
//     the House, institutions and scholars weigh alike here: commentary.
//   administration — laws, administration, current guidance: the House of Justice is the primary source (legal authority),
//     beside the Writings that ordain the laws.
// Other traditions keep their own authority numbers (their scripture ranks as scripture). Pure.

// the SAME folding as the Qdrant payload's author_fold (search/qdrant-layers.js authorKey): letters and digits only
export const foldKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
export const PILGRIM = 1.6;   // doctrine: below Shoghi Effendi (2.6), above the House and everything after the Guardian (1.0)
const TIER = new Map([
  ['bahaullah', 3.0], ['thebab', 3.0], ['bab', 3.0],
  ['abdulbaha', 2.8], ['shoghieffendi', 2.6],
]);
const HOUSE_KEY = 'universalhouseofjustice';
const HOUSE = /universal house of justice|research department/i;
/** The House's weight by domain: commentary on doctrine (no doctrinal standing), primary on law and administration. */
export const houseFactor = (domain) => (domain === 'administration' ? 2.9 : 1.0);
/** Pilgrims' notes by domain: above every post-Guardian source on doctrine; on administration below the House. */
export const pilgrimFactor = (domain) => (domain === 'administration' ? 1.3 : PILGRIM);

// what a question is about: LAW / ADMINISTRATION (the House is primary) or DOCTRINE (default). Rules only. Pure.
const ADMIN = /\b(local|national) spiritual assembl|\bassembl(y|ies)\b|\belection|\belect(ed|ing)?\b|\bvot(e|ing)\b|\bnineteen[- ]day feast|\bfeast\b|\bthe fund\b|\bcontribut(e|ions?)\b|huq[uú]q|\bmarriage\b|parental consent|\bconsent\b|\bdivorce\b|year of patience|\bburial\b|\benrol(l)?ment|\bmembership|administrative (rights|order|sanctions?)|\bsanctions?\b|\bcounsellors?\b|auxiliary board|\bcluster\b|(nine|five|four|seven|three)[- ]year plan|\bthe plan\b|ridv[aá]n message|\bpolicy\b|\bprocedure\b|\bpermitted\b|\ballowed\b|\bobligatory\b|\bis it (?:ok|okay|allowed|permissible)\b|\bcan (?:a )?bah[aá]['’]?[ií]s? \b|\blaws? (?:of|on|about)\b|\bfasting exemption|\bpolitic(s|al) (?:activity|involvement|party)|\bmilitary service|\bcrematio|\bwill and testament of a\b/i;
export const queryDomain = (q) => (ADMIN.test(String(q || '')) ? 'administration' : 'doctrine');

/** The doctrinal writers' keys (author_fold / voices_fold) — the authoritative retrieval pass filters on these. */
export const DOCTRINAL_KEYS = ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'];

/** FUSION-time factor (authority from the outset): known from the Qdrant payload alone — writer key + scope. */
export function keyFactor(authorFold, scope, collection = null, domain = 'doctrine') {
  if (/pilgrim notes/i.test(collection || '')) return pilgrimFactor(domain);   // a recollection of a Central Figure / the Guardian
  const t = String(authorFold || '') === HOUSE_KEY ? houseFactor(domain) : TIER.get(String(authorFold || ''));
  const f = t ?? 1;
  return scope === 'supplemental' ? f * 0.7 : f;
}

/** The factor for an authority NUMBER (1–10) — other traditions and unrecognised writers. */
export function numberFactor(auth) {
  const a = Number(auth);
  if (!Number.isFinite(a)) return 1;
  if (a >= 9) return 2.8;
  if (a >= 8) return 2.2;
  if (a >= 7) return 1.3;
  if (a >= 6) return 1.0;
  if (a >= 5) return 0.85;
  if (a >= 3) return 0.6;
  return 0.4;
}

/** hit { author (the paragraph's writer), collection, source_site, source_url }, auth (live authority number) → factor. */
export function doctrinalFactor(hit, auth, domain = 'doctrine') {
  if (/pilgrim notes/i.test(hit.collection || '')) return pilgrimFactor(domain);   // a recollection of a Central Figure / the Guardian
  if (Number(auth) <= 1) return 0.4;                                  // other authority-1 collections
  const key = foldKey(hit.author);
  let t = key === HOUSE_KEY || HOUSE.test(String(hit.author || '')) ? houseFactor(domain) : TIER.get(key);
  // AUTHENTICATED TEXT FIRST: a central figure's words count in full only in an authoritative book (their own works, the
  // compilations of the Writings, the House's) — quoted or recalled in a secondary book (a pilgrim's account, a paper) they
  // are a pointer to the original, never its equal (10-20: "Visiting the Bahá'í World Centre" outranked the Íqán)
  if (t != null && hit.book_authority != null && Number(hit.book_authority) < 7) t = Math.min(t, 1.3);
  let f = t ?? numberFactor(auth);
  // a copy on a scraped site (not OceanLibrary, not the library itself) yields to the library's own text
  const site = hit.source_site || '';
  if (site && site !== 'oceanlibrary.com') f *= 0.7;
  return f;
}
