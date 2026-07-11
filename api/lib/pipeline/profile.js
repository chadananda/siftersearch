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

// Explicit overrides. priority: lower = earlier. HISTORICAL track ordered by TEXTUAL RIGOR / RELIABILITY
// (how carefully the text was collected + edited) — NOT nominal authority. This is a FACTUAL-extraction
// criterion, distinct from the interpretive authority that governs the conceptual track: ‘Abdu'l-Bahá's
// authority is supreme, but a text like Memorials of the Faithful is Sohrab's notes from oral story-telling
// rendered to English and can carry many kinds of error, so it ranks BELOW the rigorously-edited scholars.
// (Gate/8632 is doctrinal → conceptual pipeline, not the historical track: genre='doctrinal' → no historical extract.)
export const PROFILE_OVERRIDES = {
  // — TIER 1: the Guardian's rigorous, authoritative history + the person-seed —
  21310: { priority: 0,  genre: 'history',   lang: 'en', domain: 'bahai' }, // God Passes By
  21308: { priority: 10, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Dawn-Breakers
  // — TIER 2: rigorously collected + edited scholarly histories (CURRENT WORK) —
  429:   { priority: 20, genre: 'history',   lang: 'en', domain: 'bahai' }, // Taherzadeh — Revelation of Bahá'u'lláh v1
  430:   { priority: 21, genre: 'history',   lang: 'en', domain: 'bahai' }, // …v2
  431:   { priority: 22, genre: 'history',   lang: 'en', domain: 'bahai' }, // …v3
  432:   { priority: 23, genre: 'history',   lang: 'en', domain: 'bahai' }, // …v4
  426:   { priority: 24, genre: 'history',   lang: 'en', domain: 'bahai' }, // Taherzadeh — Child of the Covenant
  427:   { priority: 25, genre: 'history',   lang: 'en', domain: 'bahai' }, // Taherzadeh — The Covenant
  28849: { priority: 30, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — The Báb
  462:   { priority: 31, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — Bahá'u'lláh, King of Glory
  3789:  { priority: 32, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — 'Abdu'l-Bahá
  3887:  { priority: 33, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — Eminent Bahá'ís
  464:   { priority: 34, genre: 'history',   lang: 'en', domain: 'bahai' }, // Balyuzi — E. G. Browne and the Bahá'í Faith
  465:   { priority: 35, genre: 'history',   lang: 'en', domain: 'bahai' }, // Balyuzi — Muḥammad and the Course of Islám
  467:   { priority: 36, genre: 'biography', lang: 'en', domain: 'bahai' }, // Balyuzi — Khadíjih Bagum
  13433: { priority: 40, genre: 'history',   lang: 'en', domain: 'bahai' }, // Momen — Western Accounts of the Bábí & Bahá'í Religions
  617265:{ priority: 45, genre: 'history',   lang: 'fa', domain: 'bahai' }, // Mázindarání — Ẓuhúru'l-Ḥaqq v1 (Persian → haiku)
  617275:{ priority: 46, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v2
  617284:{ priority: 47, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v3
  617290:{ priority: 48, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v4
  617298:{ priority: 49, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v5
  617302:{ priority: 50, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v6
  617305:{ priority: 51, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v7
  617310:{ priority: 52, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v8
  617313:{ priority: 53, genre: 'history',   lang: 'fa', domain: 'bahai' }, // …v9
  // — TIER 3: primary but LOOSELY collected/edited (‘Abdu'l-Bahá texts as compiled + eyewitness/pilgrim notes) —
  //   error-prone as TEXTS (oral notes, personal diaries, translation layers) → resolve against Tiers 1-2.
  20907: { priority: 60, genre: 'biography', lang: 'en', domain: 'bahai' }, // Memorials of the Faithful (Sohrab's oral-storytelling notes → English)
  20919: { priority: 61, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Secret of Divine Civilization
  11355: { priority: 62, genre: 'history',   lang: 'en', domain: 'bahai' }, // Maḥmúd's Diary (Zarqání)
  11335: { priority: 63, genre: 'history',   lang: 'en', domain: 'bahai' }, // The Chosen Highway (Blomfield)
  12472: { priority: 64, genre: 'history',   lang: 'en', domain: 'bahai' }, // Diary of Juliet Thompson
  12503: { priority: 65, genre: 'history',   lang: 'en', domain: 'bahai' }, // In Galilee (Thornton Chase)
  150400:{ priority: 66, genre: 'history',   lang: 'en', domain: 'bahai' }, // Life & Teachings of Abbás Effendi (Phelps)
  12665: { priority: 67, genre: 'history',   lang: 'en', domain: 'bahai' }, // Sohrab pilgrim notes
  283034:{ priority: 68, genre: 'history',   lang: 'en', domain: 'bahai' }, // Sears — Pilgrimage to Haifa and Akka
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
