// Companion §4 — the epistemic/source contract. Classifies every source PASSAGE into an authority
// class (B1_REVEALED … G_GENERAL) and gives the claim-label vocabulary. WHY: "the Writings state",
// "Shoghi Effendi interprets", "the House of Justice guides", "a historian argues", "Bahá'ís often
// practice", and "the AI infers" are NOT interchangeable — confidence without provenance is
// misinformation. Pure logic over the doc metadata SifterSearch already stores (author/collection/
// religion); no DB, unit-testable. Encodes the entity-research authority doctrine at the source layer.

export const AUTHORITY_CLASSES = {
  B1_REVEALED: { label: 'Writings of Bahá’u’lláh and the Báb', use: 'Primary Scripture', rank: 100 },
  B2_AUTH_INTERPRETATION: { label: '‘Abdu’l-Bahá & Shoghi Effendi', use: 'Authorized interpretation / authoritative exposition', rank: 90 },
  B3_UHJ_GUIDANCE: { label: 'Universal House of Justice', use: 'Current authoritative guidance (never label authorized interpretation)', rank: 85 },
  B4_OFFICIAL_EXPOSITORY: { label: 'Official explanatory / institutional', use: 'Reliable exposition; not Scripture', rank: 60 },
  H1_PRIMARY_HISTORY: { label: 'Letters, memoirs, records, archives', use: 'Historical evidence with perspective', rank: 55 },
  H2_SCHOLARSHIP: { label: 'Recognized scholarship', use: 'Context, criticism, disputed interpretation', rank: 40 },
  I1_TRADITION_PRIMARY: { label: 'Another tradition’s canonical text', use: 'Represent it from its own sources', rank: 55 },
  I2_TRADITION_SCHOLARSHIP: { label: 'Another tradition’s commentary', use: 'Internal diversity / context', rank: 40 },
  G_GENERAL: { label: 'General reference', use: 'Background only', rank: 10 },
};

export const CLAIM_LABELS = [
  'EXPLICIT_TEXT', 'AUTHORIZED_INTERPRETATION', 'INSTITUTIONAL_GUIDANCE', 'HISTORICAL_FACT',
  'SCHOLARLY_VIEW', 'COMMUNITY_PRACTICE', 'INTERFAITH_SOURCE', 'ASSISTANT_SYNTHESIS', 'CONTESTED', 'UNKNOWN',
];

// A claim label may NEVER be promoted to doctrine from these two.
export const NON_DOCTRINE_LABELS = new Set(['COMMUNITY_PRACTICE', 'ASSISTANT_SYNTHESIS']);

// Fold to lowercase, strip diacritics AND all apostrophe variants (‘ ’ ʻ ` ') so "‘Abdu’l-Bahá",
// "Bahá'u'lláh" etc. compare cleanly against the (apostrophe-free) signal patterns below.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʻ`']/g, '');

// Central-figure / institution authorship signals (author or title carries the name), apostrophe-free.
const BAHAULLAH = /(bahaullah|the bab\b|\bthe bab\b)/;
const REVEALED_WORKS = /(hidden words|kitab-i-iqan|kitab-i-aqdas|gleanings|prayers and meditations|epistle to the son of the wolf|summons of the lord|gems of divine|seven valleys|four valleys|tablets of baha|days of remembrance|call of the divine)/;
const ABDULBAHA = /(abdul-baha|abdulbaha|abdul-bah)/;
const SHOGHI = /(shoghi effendi|the guardian)/;
const SHOGHI_WORKS = /(god passes by|world order of baha|advent of divine justice|promised day is come|dispensation of baha)/;
const UHJ = /(universal house of justice|house of justice|ridvan message|the universal house)/;

const OTHER_TRADITION = /(gospel|bible|new testament|old testament|torah|tanakh|talmud|midrash|qur'?an|koran|hadith|bhagavad|gita|upanishad|veda|ramayana|dhammapada|sutra|nikaya|pali canon|guru granth|tao te ching|analects|avesta|gatha|agama)/;

/**
 * Classify a source passage/doc into an authority class from the metadata SifterSearch stores.
 * @param {object} doc { author, title, collection, religion, source_author, source_title }
 * @returns {string} an AUTHORITY_CLASSES key
 */
export function classifyAuthority(doc = {}) {
  const author = norm(doc.author || doc.source_author);
  const title = norm(doc.title || doc.source_title);
  const collection = norm(doc.collection);
  const religion = norm(doc.religion);
  const hay = `${author} ${title} ${collection}`;

  // Non-Bahá'í traditions first (a Bahá'í-library book quoting the Gospel is still Bahá'í-authored;
  // classify by the RELIGION facet, falling back to text signals only when religion is absent).
  const isBahai = religion.includes('baha') || (!religion && (BAHAULLAH.test(hay) || ABDULBAHA.test(hay) || SHOGHI.test(hay) || UHJ.test(hay)));
  if (!isBahai && religion && !religion.includes('baha')) {
    return /(commentary|scholar|study|analysis|introduction|history of)/.test(collection) ? 'I2_TRADITION_SCHOLARSHIP' : 'I1_TRADITION_PRIMARY';
  }
  if (!isBahai && OTHER_TRADITION.test(hay)) {
    return 'I1_TRADITION_PRIMARY';
  }

  // Bahá'í authority ladder — most authoritative signal wins.
  if (UHJ.test(hay)) return 'B3_UHJ_GUIDANCE';
  if (SHOGHI.test(author) || SHOGHI_WORKS.test(title)) return 'B2_AUTH_INTERPRETATION';
  if (ABDULBAHA.test(author)) return 'B2_AUTH_INTERPRETATION';
  if (BAHAULLAH.test(author) || REVEALED_WORKS.test(title)) return 'B1_REVEALED';

  // Bahá'í but not a Central Figure/institution → history vs official vs scholarship by collection.
  if (/(pilgrim|memoir|diary|reminisc|dawn-breakers|letters|account|eyewitness)/.test(collection + ' ' + title)) return 'H1_PRIMARY_HISTORY';
  if (/(paper|journal|scholar|study|thesis|academic|bahai studies)/.test(collection)) return 'H2_SCHOLARSHIP';
  if (/(compilation|official|statement|reference|introduction|pamphlet)/.test(collection)) return 'B4_OFFICIAL_EXPOSITORY';
  if (isBahai) return 'B4_OFFICIAL_EXPOSITORY';
  return 'G_GENERAL';
}

// The claim label implied by a source's authority class when a claim rests DIRECTLY on that source.
// (ASSISTANT_SYNTHESIS / CONTESTED / UNKNOWN are decided by the reasoner, not the source.)
export function labelForClass(cls) {
  switch (cls) {
    case 'B1_REVEALED': return 'EXPLICIT_TEXT';
    case 'B2_AUTH_INTERPRETATION': return 'AUTHORIZED_INTERPRETATION';
    case 'B3_UHJ_GUIDANCE': return 'INSTITUTIONAL_GUIDANCE';
    case 'B4_OFFICIAL_EXPOSITORY': return 'COMMUNITY_PRACTICE';
    case 'H1_PRIMARY_HISTORY': return 'HISTORICAL_FACT';
    case 'H2_SCHOLARSHIP': return 'SCHOLARLY_VIEW';
    case 'I1_TRADITION_PRIMARY':
    case 'I2_TRADITION_SCHOLARSHIP': return 'INTERFAITH_SOURCE';
    default: return 'UNKNOWN';
  }
}

// Human-readable attribution stem for the crafter, keyed by class — enforces the §4.1 WHY.
export function attributionStem(cls) {
  switch (cls) {
    case 'B1_REVEALED': return 'The Writings state';
    case 'B2_AUTH_INTERPRETATION': return 'the authorized interpretation holds';
    case 'B3_UHJ_GUIDANCE': return 'the Universal House of Justice guides';
    case 'B4_OFFICIAL_EXPOSITORY': return 'an official exposition explains';
    case 'H1_PRIMARY_HISTORY': return 'a historical account records';
    case 'H2_SCHOLARSHIP': return 'a scholar argues';
    case 'I1_TRADITION_PRIMARY': return 'that tradition’s own text says';
    case 'I2_TRADITION_SCHOLARSHIP': return 'a commentator on that tradition notes';
    default: return 'a general reference notes';
  }
}
