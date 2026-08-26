// The CORE ROSTER — which books anchor concept identity, and how each must be read.
//
// Why a curated list and not a derived one: retrieval cannot find the anchor texts on its own. The
// Kitáb-i-Íqán is 292 paragraphs; its study guides, companions, commentaries and third-party translations
// in this corpus total several thousand. Any similarity-based search systematically prefers the
// voluminous secondary material over the sparse primary text, so "cross-reference a concept to the core
// Writings" requires naming the core Writings (measured 2026-08-25).
//
// THREE CLASSES, because the bilingual treatment differs and conflating them corrupts extraction:
//
//   GUARDIAN_ORIGINAL — Shoghi Effendi's OWN works, written by him in English. The English IS the
//                       original; there is no translation loss and no CTAI lookup to do. These are the
//                       authoritative source for the theory of administration, the role of the
//                       individual, the nature of spirituality, and the individual–community relation.
//
//   GUARDIAN_TRANSLATION — works he translated. Two authorities at once: the ORIGINAL fixes WHICH TERM
//                       (English collapses Ṣalát/Duʿá/Dhikr into "prayer"), and HIS RENDERING fixes WHICH
//                       SENSE, as an authoritative interpretive act. Both are needed; neither outranks.
//
//   DESIGNATED — works he identified as of the first importance but did NOT translate (Some Answered
//                       Questions, Tablets of the Divine Plan, the Kitáb-i-Aqdas — rendered posthumously).
//                       THESE ARE AUTHORITATIVE WORKS: Shoghi Effendi's statements about their importance
//                       confer that standing (Chad, 2026-08-25). What they lack is only his sense-FIXING
//                       word-choice, so where the English is ambiguous the original decides — but the work
//                       itself is never treated as second-rank material.
//
// PROVENANCE IS PART OF IDENTITY. The corpus holds 147,477 scraped documents (oceanoflights.org 72,420 ·
// bahai-library.com 75,057) against oceanlibrary.com's 565 — a 128:1 flood that makes any title search
// surface a scrape first. Canonical means source_site='oceanlibrary.com' or the main library (NULL).
// Nothing scraped from another website belongs in this roster, and an id is only listed after its
// provenance has been checked.
//
// CANONICAL IDS ARE DELIBERATE. Nearly every one of these works has duplicate copies in the corpus, and
// picking by title match is how the plan ended up pointing at empty husks. Each id below was chosen
// because it is the copy the pipeline has actually disambiguated; rejected rivals are recorded so the
// choice is auditable rather than mysterious.
// Deps: none (data).

export const CLASS = Object.freeze({
  GUARDIAN_ORIGINAL: 'guardian-original',
  GUARDIAN_TRANSLATION: 'guardian-translation',
  DESIGNATED: 'designated',
});

export const CORE_ROSTER = Object.freeze([
  // ── Guardian translations. Íqán at the centre.
  { docId: 20810, work: 'The Kitáb-i-Íqán', cls: CLASS.GUARDIAN_TRANSLATION, anchorRank: 100,
    prose: 292, rejected: [{ id: 542080, why: 'scraped copy, 0 disambiguated' }] },
  { docId: 8312, work: 'Gleanings from the Writings of Bahá’u’lláh', cls: CLASS.GUARDIAN_TRANSLATION, anchorRank: 95,
    prose: 746, rejected: [{ id: 542083, why: 'scraped copy, 0 disambiguated' }] },
  { docId: 20809, work: 'The Hidden Words', cls: CLASS.GUARDIAN_TRANSLATION, anchorRank: 90,
    prose: 314, provenance: 'oceanlibrary.com',
    rejected: [{ id: 28628, why: 'SCRAPED from oceanoflights.org — and the 218 concept claims we hold came from it, so that extraction must be redone against 20809' },
               { id: 614078, why: 'scraped, 960¶ but only 10 disambiguated' }] },
  { docId: 8273, work: 'Epistle to the Son of the Wolf', cls: CLASS.GUARDIAN_TRANSLATION, anchorRank: 85,
    prose: 317, provenance: 'oceanlibrary.com', blocked: 'SOFT-DELETED',
    note: 'all 317¶ soft-deleted at a single timestamp 2026-06-12 15:18:20 — between the 06-09 dedupe that gutted 155 canonical docs and the 06-13 safeSoftDeleteDocs guard. The text is intact; it needs deleted_at cleared before extraction.',
    rejected: [{ id: 20780, why: 'empty duplicate record, 0 content rows' },
               { id: 614089, why: 'SCRAPED from oceanoflights.org' }] },
  { docId: 21308, work: 'The Dawn-Breakers', cls: CLASS.GUARDIAN_TRANSLATION, anchorRank: 60,
    prose: 1424, rejected: [{ id: 614092, why: '7,232¶ but only 202 disambiguated' }],
    note: 'a history he translated — anchors narrative, not doctrine' },

  // ── Designated by the Guardian as of the first importance; translated by others.
  //    AUTHORITATIVE WORKS. Only his sense-fixing word-choice is absent, not the work's standing.
  { docId: 20911, work: 'Some Answered Questions', cls: CLASS.DESIGNATED, anchorRank: 88, prose: 789,
    provenance: 'oceanlibrary.com', note: 'authoritative — Shoghi Effendi named it of the first importance' },
  { docId: 20914, work: 'Tablets of the Divine Plan', cls: CLASS.DESIGNATED, anchorRank: 86, prose: 221,
    provenance: 'oceanlibrary.com', needsDisambiguation: true,
    note: 'authoritative by the Guardian\'s designation; only 10¶ disambiguated so far' },
  { docId: 21307, work: 'The Kitáb-i-Aqdas', cls: CLASS.DESIGNATED, anchorRank: 87, prose: 304,
    provenance: 'oceanlibrary.com',
    note: 'the Most Holy Book. Rendered posthumously by a UHJ committee, so the ENGLISH is not a Guardian rendering — the work itself is of the highest authority' },

  // ── The Guardian's own works. English IS the original; no CTAI lookup applies.
  { docId: 21310, work: 'God Passes By', cls: CLASS.GUARDIAN_ORIGINAL, anchorRank: 80, prose: 787 },
  { docId: 20894, work: 'The World Order of Bahá’u’lláh', cls: CLASS.GUARDIAN_ORIGINAL, anchorRank: 82, prose: 1229,
    note: 'contains The Dispensation of Bahá’u’lláh — the ontology keystone' },
  { docId: 20893, work: 'The Promised Day is Come', cls: CLASS.GUARDIAN_ORIGINAL, anchorRank: 78 },
  { docId: 20890, work: 'The Advent of Divine Justice', cls: CLASS.GUARDIAN_ORIGINAL, anchorRank: 78 },
  { docId: 20882, work: 'Citadel of Faith', cls: CLASS.GUARDIAN_ORIGINAL, anchorRank: 75 },
  { docId: 20887, work: 'Messages to the Bahá’í World', cls: CLASS.GUARDIAN_ORIGINAL, anchorRank: 75 },
]);

const BY_ID = new Map(CORE_ROSTER.map((r) => [r.docId, r]));

export const coreEntry = (docId) => BY_ID.get(Number(docId)) || null;
export const isCore = (docId) => BY_ID.has(Number(docId));

/** True when the English text of this doc is itself the original — no aligned original exists to fetch. */
export function englishIsOriginal(docId) {
  return coreEntry(docId)?.cls === CLASS.GUARDIAN_ORIGINAL;
}

/**
 * True when this doc's English rendering carries authority to FIX A SENSE. Only the Guardian's own
 * renderings do. A DESIGNATED work's translation is recall-only, however careful the translator.
 */
export function renderingIsAuthoritative(docId) {
  const c = coreEntry(docId)?.cls;
  return c === CLASS.GUARDIAN_TRANSLATION || c === CLASS.GUARDIAN_ORIGINAL;
}

/** Every core work is an authoritative work — DESIGNATED included. Only sense-FIXING differs. */
export const isAuthoritativeWork = (docId) => isCore(docId);

/** Entries that cannot be extracted yet, with the reason — so a blocked text is never silently skipped. */
export const blockedEntries = () =>
  CORE_ROSTER.filter((r) => r.blocked || r.needsDisambiguation)
    .map((r) => ({ docId: r.docId, work: r.work, blocked: r.blocked || 'needs disambiguation', note: r.note }));

/**
 * Anchor preference: given several docs carrying the same concept, which should be cited FIRST as its
 * expression in the core Writings. Higher wins; a non-core doc always loses to any core doc.
 */
export const anchorRank = (docId) => coreEntry(docId)?.anchorRank ?? 0;

/** Core docs ordered best-anchor-first. */
export const anchorOrder = () => [...CORE_ROSTER].sort((a, b) => b.anchorRank - a.anchorRank);
