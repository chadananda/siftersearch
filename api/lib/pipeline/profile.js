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

// Explicit overrides. priority: lower = earlier. HISTORICAL track ordered by SOURCE AUTHORITY —
// primary/eyewitness (‘Abdu'l-Bahá's histories + pilgrim accounts) BEFORE 3rd-party compilations, so
// the entity graph is anchored by primary sources and the secondary works resolve against it.
// (Gate/8632 is doctrinal → conceptual pipeline, not the historical track: genre='doctrinal' → no historical extract.)
export const PROFILE_OVERRIDES = {
  // — top: the Guardian's authoritative history + person-seed —
  21310: { priority: 0,  genre: 'history',   lang: 'en', domain: 'bahai' }, // God Passes By
  21308: { priority: 10, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Dawn-Breakers
  // — primary: ‘Abdu'l-Bahá's own history works —
  20907: { priority: 15, genre: 'biography', lang: 'en', domain: 'bahai' }, // Memorials of the Faithful
  20919: { priority: 16, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Secret of Divine Civilization
  // — primary: eyewitness / pilgrim accounts (before any 3rd-party history) —
  11355: { priority: 20, genre: 'history',   lang: 'en', domain: 'bahai' }, // Maḥmúd's Diary (Zarqání)
  11335: { priority: 21, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Chosen Highway (Blomfield)
  12472: { priority: 22, genre: 'history',   lang: 'en', domain: 'bahai' }, // Diary of Juliet Thompson
  12503: { priority: 23, genre: 'history',   lang: 'en', domain: 'bahai' }, // In Galilee (Thornton Chase)
  150400:{ priority: 24, genre: 'history',   lang: 'en', domain: 'bahai' }, // Life & Teachings of Abbás Effendi (Phelps)
  12665: { priority: 25, genre: 'history',   lang: 'en', domain: 'bahai' }, // Sohrab pilgrim notes
  283034:{ priority: 26, genre: 'history',   lang: 'en', domain: 'bahai' }, // Sears — Pilgrimage to Haifa and Akka
  // — SUB-BASEMENT: rigorous, authoritative 3rd-party works — the foundation the rest of the histories build on —
  429:   { priority: 30, genre: 'history',   lang: 'en', domain: 'bahai' }, // Taherzadeh — Revelation of Bahá'u'lláh v1
  430:   { priority: 31, genre: 'history',   lang: 'en', domain: 'bahai' }, // …v2
  431:   { priority: 32, genre: 'history',   lang: 'en', domain: 'bahai' }, // …v3
  432:   { priority: 33, genre: 'history',   lang: 'en', domain: 'bahai' }, // …v4
  426:   { priority: 34, genre: 'history',   lang: 'en', domain: 'bahai' }, // Taherzadeh — Child of the Covenant
  427:   { priority: 35, genre: 'history',   lang: 'en', domain: 'bahai' }, // Taherzadeh — The Covenant
  28849: { priority: 36, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — The Báb
  462:   { priority: 37, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — Bahá'u'lláh, King of Glory
  3789:  { priority: 38, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — 'Abdu'l-Bahá
  3887:  { priority: 39, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — Eminent Bahá'ís
  464:   { priority: 40, genre: 'history',   lang: 'en', domain: 'bahai' }, // Balyuzi — E. G. Browne and the Bahá'í Faith
  465:   { priority: 41, genre: 'history',   lang: 'en', domain: 'bahai' }, // Balyuzi — Muḥammad and the Course of Islám
  467:   { priority: 42, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — Khadíjih Bagum
  13433: { priority: 45, genre: 'history',   lang: 'en', domain: 'bahai' }, // Momen — Western Accounts of the Bábí & Bahá'í Religions
  617265:{ priority: 50, genre: 'history',   lang: 'fa', domain: 'bahai' }, // Mázindarání — Ẓuhúru'l-Ḥaqq v1 (Persian → haiku)
  617275:{ priority: 51, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v2
  617284:{ priority: 52, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v3
  617290:{ priority: 53, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v4
  617298:{ priority: 54, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v5
  617302:{ priority: 55, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v6
  617305:{ priority: 56, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v7
  617310:{ priority: 57, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v8
  617313:{ priority: 58, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v9
  // — Gate of the Heart: DOCTRINAL → the CONCEPTUAL pipeline, not this historical track —
  8632:  { priority: 900, genre: 'doctrinal', lang: 'en', domain: 'bahai', model: SONNET },
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
