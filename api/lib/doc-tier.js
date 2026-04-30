// Document tier classifier. Classifies every doc into a HyPE-priority tier
// 1-9 used by the enrichment pipeline to route paragraphs to either the
// Anthropic Sonnet 4.6 path (tier 1-7, Bahá'í primary doctrinal) or the
// local Qwen3 path (tier 8-9, everything else).
//
// IMPORTANT: When adding new authors or compilation entries to the priority
// list, update both PRIMARY_AUTHORS_BY_TIER and the SPECIFIC_BOOKS map.
// Tier classification happens at ingest time AND at periodic re-scan, so
// authoring conventions in the docs table determine the routing forever.

// Author transliteration variants — all spellings of each tier 1-5 author.
// Variants come from the actual library (verified via /api/v1/library/authors).
const PRIMARY_AUTHORS_BY_TIER = {
  1: ['Shoghi Effendi'],

  // Tier 2 = TRUE compilations only (curated topical volumes), NOT UHJ
  // letters which are administrative. UHJ letters fall to tier 9.
  // Filled in dynamically by isCompilation() — see below.
  2: [],

  // 'Abdu'l-Bahá — covers all transliteration variants
  3: ["'Abdu'l-Bahá", '\u2019Abdu\u2019l-Bahá', "Abdu'l-Bahá", 'Abdu\u2019l-Bahá'],

  // Bahá'u'lláh — covers all variants
  4: ["Bahá'u'lláh", 'Bahá\u2019u\u2019lláh', 'Baha\u2019u\u2019llah', "Baha'u'llah"],

  5: ['The Báb', 'The Bab'],

  // Tiers 6-7 are SPECIFIC BOOKS, not whole-author tiers (per project
  // policy — Esslemont's New Era and Nabíl's Dawn-Breakers are uniquely
  // canonical introductions to the Faith and the Heroic Age, respectively).
  // See SPECIFIC_BOOKS below.
};

// Specific-book tiers — promoted to tier 6/7 only when the document is one
// of these exact works. All other Esslemont / Nabíl writings fall to lower
// tiers based on their author/religion.
const SPECIFIC_BOOKS = [
  // tier 6: Esslemont's "Bahá'u'lláh and the New Era"
  { tier: 6, doc_id: 8314 },
  // tier 7: Nabíl's "The Dawn-Breakers"
  { tier: 7, doc_id: 8645 },
];

const SPECIFIC_BOOK_DOC_IDS = new Map(SPECIFIC_BOOKS.map(b => [b.doc_id, b.tier]));

// Other-religion doctrinal tags — covers the religion field's known values
const OTHER_RELIGION_DOCTRINAL = new Set([
  'Islam', 'Christian', 'Christianity',
  'Judaism', 'Buddhist', 'Buddhism',
  'Hindu', 'Hinduism', 'Sikh', 'Sikhism',
  'Zoroastrian', 'Zoroastrianism',
  'Jain', 'Jainism', 'Confucian', 'Tao'
]);

// Compilation detection — true compilations are characterized by either
// (a) "Research Department of the Universal House of Justice" in the author
// (the canonical authoring entity for compilations from the Bahá'í World Centre),
// (b) a primary author with "(compiler)" or "(compiled by ...)" markers,
// (c) titles starting with "Compilation" or matching well-known compilations
//     like "Lights of Guidance".
// Excludes UHJ letters (administrative correspondence, not doctrinal).
function isCompilation(doc) {
  const author = String(doc.author || '');
  const title = String(doc.title || '');
  if (/Research Department of the Universal House of Justice/i.test(author)) return true;
  if (/\(compiler\)|\(compiled by/i.test(author)) return true;
  if (/^Compilation\b/i.test(title)) return true;
  if (/^Lights of Guidance/i.test(title)) return true;
  // Note: "239 Days in America: Compilation of Essays" is NOT a doctrinal
  // compilation — it's a secondary collection. The patterns above filter it
  // out (no Research Dept, no compiler marker, doesn't START with "Compilation").
  return false;
}

// Author normalization helper — strips common suffix/co-author noise so a
// document attributed to "Bahá'u'lláh, Juan Cole" still classifies as tier 4.
function authorMatchesAny(authorString, candidates) {
  if (!authorString) return false;
  // Match if the candidate appears as a comma-separated component or whole string
  for (const cand of candidates) {
    if (authorString === cand) return true;
    // primary-figure-then-translator pattern: "Bahá'u'lláh, Juan Cole"
    const components = authorString.split(',').map(s => s.trim());
    if (components[0] === cand) return true;
    // also catch the figure as ANY component (e.g., "Bahá'u'lláh, Shoghi Effendi, ...")
    if (components.includes(cand)) return true;
  }
  return false;
}

/**
 * Classify a document into a tier 1..9.
 *
 * Inputs: { id, author, religion, title, ... } — typically a row from `docs`.
 * Returns: integer 1..9.
 *
 * Tier ordering reflects authority hierarchy + priority:
 *   1 Shoghi Effendi (authoritative interpreter)
 *   2 True compilations (curated topical from primary writings)
 *   3 'Abdu'l-Bahá (Centre of the Covenant)
 *   4 Bahá'u'lláh (Manifestation)
 *   5 The Báb
 *   6 Esslemont's "Bahá'u'lláh and the New Era"
 *   7 Nabíl's "The Dawn-Breakers"
 *   8 Other religions doctrinal (Quran, Gospels, Tanakh, Pali Canon, etc.)
 *   9 Everything else (Bahá'í secondary scholarship, UHJ administrative
 *     letters, secondary sources, etc.)
 */
export function getDocTier(doc) {
  if (!doc) return 9;

  // 1) Specific-book overrides first (Esslemont / Nabíl exceptions)
  if (doc.id != null && SPECIFIC_BOOK_DOC_IDS.has(Number(doc.id))) {
    return SPECIFIC_BOOK_DOC_IDS.get(Number(doc.id));
  }

  const author = String(doc.author || '');

  // 2) Tier 1: Shoghi Effendi (primary author only, not as co-translator)
  if (authorMatchesAny(author, PRIMARY_AUTHORS_BY_TIER[1])) {
    // But only if Shoghi Effendi is the FIRST listed author — when listed
    // second/third he's typically a translator of someone else's work.
    const components = author.split(',').map(s => s.trim());
    if (PRIMARY_AUTHORS_BY_TIER[1].includes(components[0])) return 1;
  }

  // 3) Tier 2: true compilations
  if (isCompilation(doc)) return 2;

  // 4) Tiers 3-5: 'Abdu'l-Bahá → Bahá'u'lláh → The Báb (matches any author position)
  if (authorMatchesAny(author, PRIMARY_AUTHORS_BY_TIER[3])) {
    const components = author.split(',').map(s => s.trim());
    if (PRIMARY_AUTHORS_BY_TIER[3].includes(components[0])) return 3;
    // Mixed authorship like "Bahá'u'lláh, 'Abdu'l-Bahá, ..." — defer to the
    // higher-tier author below.
  }
  if (authorMatchesAny(author, PRIMARY_AUTHORS_BY_TIER[4])) {
    const components = author.split(',').map(s => s.trim());
    if (PRIMARY_AUTHORS_BY_TIER[4].includes(components[0])) return 4;
  }
  if (authorMatchesAny(author, PRIMARY_AUTHORS_BY_TIER[5])) {
    const components = author.split(',').map(s => s.trim());
    if (PRIMARY_AUTHORS_BY_TIER[5].includes(components[0])) return 5;
  }

  // 5) Tier 8: other-religion doctrinal works
  if (doc.religion && OTHER_RELIGION_DOCTRINAL.has(doc.religion)) return 8;

  // 6) Tier 9: everything else (Bahá'í secondary scholarship, UHJ
  // administrative letters, unclassified docs)
  return 9;
}

/**
 * Routing decision: does this doc's enrichment go through the Anthropic
 * Sonnet batch path (premium quality, tier 1-7) or the local Qwen3 path
 * (tier 8-9)?
 */
export function getEnrichmentModel(tier) {
  return (tier >= 1 && tier <= 7) ? 'sonnet' : 'local';
}

/**
 * Human-readable tier label (for logging/debugging).
 */
export function getTierLabel(tier) {
  const labels = {
    1: 'Shoghi Effendi',
    2: 'Compilations',
    3: "'Abdu'l-Bahá",
    4: "Bahá'u'lláh",
    5: 'The Báb',
    6: 'Esslemont — New Era',
    7: 'Nabíl — Dawn-Breakers',
    8: 'Other religions doctrinal',
    9: 'Everything else'
  };
  return labels[tier] || `Tier ${tier}`;
}
