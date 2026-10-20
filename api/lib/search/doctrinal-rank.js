// DOCTRINAL AUTHORITY in ranking (Chad 10-20: "Authority with doctrine is absolutely critical"). A relevance score is
// multiplied by a factor from the PARAGRAPH's writer (content.authors — a compilation quoting Bahá'u'lláh is Bahá'u'lláh's
// words), steep enough to decide between passages of similar relevance — the old blend was ×1.2 at most and lost the
// Tablets to a bahai-library paper quoting them (10-20 battery). Doctrine (feedback 10-19): Revelation (Bahá'u'lláh, the
// Báb) > authorised interpretation ('Abdu'l-Bahá, Shoghi Effendi — letters on his behalf included) > the Universal House of
// Justice (authoritative on APPLICATION, not decisive on doctrine) > everything else; pilgrim notes are never authority.
// Other traditions keep their own authority numbers (their scripture ranks as scripture). Pure.

// the SAME folding as the Qdrant payload's author_fold (search/qdrant-layers.js authorKey): letters and digits only
export const foldKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
const TIER = new Map([
  ['bahaullah', 3.0], ['thebab', 3.0], ['bab', 3.0],
  ['abdulbaha', 2.6], ['shoghieffendi', 2.6],
  ['universalhouseofjustice', 1.6],
]);
/** The doctrinal writers' keys (author_fold / voices_fold) — the authoritative retrieval pass filters on these. */
export const DOCTRINAL_KEYS = ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'];

/** FUSION-time factor (authority from the outset): known from the Qdrant payload alone — writer key + scope. */
export function keyFactor(authorFold, scope, collection = null) {
  if (/pilgrim notes/i.test(collection || '')) return 0.4;   // never authority, whoever they quote
  const t = TIER.get(String(authorFold || ''));
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
export function doctrinalFactor(hit, auth) {
  // pilgrim notes and other authority-1 collections: never authority, whoever they quote
  if (/pilgrim notes/i.test(hit.collection || '') || Number(auth) <= 1) return 0.4;
  let t = TIER.get(foldKey(hit.author));
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
