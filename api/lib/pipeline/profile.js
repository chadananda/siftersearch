// Per-document profile for the unified enrichment pipeline (docs/architecture/unified-enrichment-pipeline.md).
// Drives EVERYTHING per document: language/script, genre, domain, per-stage model routing, the extraction
// gate, and the escalation ladder — so the pipeline is robust across a multilingual, multi-tradition corpus
// (Arabic 2.28M paras, Hebrew 370K, Persian 139K, English). Resolution = explicit override for known books,
// else derive from doc metadata + a script sample, with safe defaults so ANY document enriches acceptably.

// ── Empirically-grounded model routing by language (2026-07-10 tests) ────────────────────────────────────
// DeepSeek-flash: reliable + cheapest on English, ARABIC, HEBREW; SILENTLY FAILS (empty) on PERSIAN.
// Claude-haiku: reliable on ALL incl. Persian; cheap (no reasoning tokens — ~2.8× cheaper than deepseek-pro
//   here, which burns ~1764 reasoning tok/call). DeepSeek-pro's reasoning is wasteful for this task → not used.
// So: flash where it works (the 2.6M Ar/He/En bulk), haiku for Persian + as the universal escalation target.
const FLASH = 'deepseek-v4-flash', HAIKU = 'claude-haiku-4-5-20251001', SONNET = 'claude-sonnet-4-6';
const LANG_ROUTING = {
  en: { disambig: FLASH, hype: FLASH, extract: FLASH, fallback: HAIKU },
  ar: { disambig: FLASH, hype: FLASH, extract: FLASH, fallback: HAIKU }, // flash handles Arabic
  he: { disambig: FLASH, hype: FLASH, extract: FLASH, fallback: HAIKU }, // flash handles Hebrew
  fa: { disambig: HAIKU, hype: HAIKU, extract: HAIKU, fallback: SONNET }, // flash unreliable on Persian → haiku primary
};
const providerOf = (model) => model.startsWith('claude') ? 'anthropic' : model.startsWith('gpt') ? 'openai' : 'deepseek';

// Genres that build a person/entity graph → extraction ON. Scripture/poetry/legal/commentary get
// disambiguation + HyPE (searchable) but NOT entity extraction (they don't populate a biography graph).
const EXTRACT_GENRES = new Set(['history', 'biography', 'narrative', 'doctrinal']);

// Domain-appropriate era anchors, fed into the disambiguation prompt so dates resolve in the right frame.
const DOMAIN_ANCHORS = {
  bahai: 'Báb\'s Declaration May 1844; His martyrdom July 1850; Bahá\'u\'lláh\'s Declaration 1863; Naw-Rúz ≈ 21 Mar',
  islamic: 'Hijra = 622 CE (AH 1); the Prophet\'s death 632 CE; convert AH→CE as CE ≈ 622 + AH×0.970',
  jewish: 'Second Temple destroyed 70 CE; use CE; rabbinic/medieval periods by named authority',
  christian: 'use CE/AD; the Incarnation as year ~1',
};

// Explicit overrides for the authority-seed + first history wave. priority: lower = earlier (cumulative).
export const PROFILE_OVERRIDES = {
  21310: { priority: 0,  genre: 'history',   lang: 'en', domain: 'bahai' }, // God Passes By
  21308: { priority: 10, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Dawn-Breakers
  8632:  { priority: 15, genre: 'doctrinal', lang: 'en', domain: 'bahai', model: SONNET }, // Gate of the Heart
  429:   { priority: 20, genre: 'doctrinal', lang: 'en', domain: 'bahai' }, // Revelation of Bahá'u'lláh v1
  430:   { priority: 21, genre: 'doctrinal', lang: 'en', domain: 'bahai' },
  431:   { priority: 22, genre: 'doctrinal', lang: 'en', domain: 'bahai' },
  432:   { priority: 23, genre: 'doctrinal', lang: 'en', domain: 'bahai' },
  426:   { priority: 24, genre: 'history',   lang: 'en', domain: 'bahai' }, // Child of the Covenant
  427:   { priority: 25, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Covenant
};

const SCRIPT = { hebrew: /[֐-׿]/, arabicPersian: /[؀-ۿ]/, persianOnly: /[پچژگی]/ };

/** Detect language + script from a text sample. Persian and Arabic share a script → use Persian-only chars. */
function detectLang(sample, metaLang) {
  if (metaLang && LANG_ROUTING[metaLang]) return metaLang;
  if (!sample) return 'en';
  if (SCRIPT.hebrew.test(sample)) return 'he';
  if (SCRIPT.arabicPersian.test(sample)) return SCRIPT.persianOnly.test(sample) ? 'fa' : 'ar';
  return 'en';
}

/** Derive genre from religion/collection/title keywords (fallback when no override). */
function detectGenre(doc) {
  const t = `${doc.title || ''} ${doc.collection || ''}`.toLowerCase();
  if (/divan|poem|poetry|ghazal|masnavi|rumi/.test(t)) return 'poetry';
  if (/commentary|sharh|tafsir|zohar|beur|on shulchan|on zohar/.test(t)) return 'commentary';
  if (/fiqh|jawahir|shulchan arukh|halakh|jurisprud/.test(t)) return 'legal';
  if (/history|táríkh|tarikh|dawn-breakers|zuhur|memoir|biograph|diary|account/.test(t)) return 'history';
  if (/qur.?an|bible|tanakh|torah|gospel|sutra|veda|tablet|kitáb|lawḥ|prayer/.test(t)) return 'scripture';
  return 'narrative';
}

/** Domain from religion field. */
function detectDomain(doc) {
  const r = `${doc.religion || ''}`.toLowerCase();
  if (/bah/.test(r)) return 'bahai';
  if (/islam|muslim|shi|sunni/.test(r)) return 'islamic';
  if (/jud|jewish|hebrew/.test(r)) return 'jewish';
  if (/christ/.test(r)) return 'christian';
  return 'other';
}

/**
 * Resolve a document's full profile. Returns everything the stages + orchestrator need:
 * { name, lang, script, genre, domain, priority, segmentation, extract, eraAnchors,
 *   models: {disambig,hype,extract}, providers: {...}, fallback, fallbackProvider }
 */
export function detectProfile(doc, sampleText = '') {
  const ov = PROFILE_OVERRIDES[doc.id] || {};
  const lang = ov.lang || detectLang(sampleText, doc.lang);
  const script = lang === 'he' ? 'hebrew' : (lang === 'fa' || lang === 'ar') ? 'arabic' : 'latin';
  const genre = ov.genre || detectGenre(doc);
  const domain = ov.domain || detectDomain(doc);
  const route = LANG_ROUTING[lang] || LANG_ROUTING.en;
  // A per-doc model override (e.g. Sonnet for a flagship) replaces the disambig model only.
  const disambigModel = ov.model || route.disambig;
  const models = { disambig: disambigModel, hype: ov.model || route.hype, extract: ov.model || route.extract };
  const priority = ov.priority ?? (Number.isFinite(doc.doc_priority) ? 1000 - doc.doc_priority : 1000);
  return {
    name: `${genre}-${lang}`, lang, script, genre, domain, priority,
    segmentation: [21308, 21310].includes(doc.id) ? 'toc' : 'bounded',
    extract: EXTRACT_GENRES.has(genre),
    eraAnchors: DOMAIN_ANCHORS[domain] || '',
    models,
    providers: { disambig: providerOf(models.disambig), hype: providerOf(models.hype), extract: providerOf(models.extract) },
    fallback: route.fallback, fallbackProvider: providerOf(route.fallback),
  };
}

export { providerOf };
