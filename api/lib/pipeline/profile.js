// Per-document profile for the unified enrichment pipeline (docs/architecture/unified-enrichment-pipeline.md).
// Drives EVERYTHING per document: language/script, genre, domain, per-stage model routing, the extraction
// gate, and the escalation ladder — so the pipeline is robust across a multilingual, multi-tradition corpus
// (Arabic 2.28M paras, Hebrew 370K, Persian 139K, English). Resolution = explicit override for known books,
// else derive from doc metadata + a script sample, with safe defaults so ANY document enriches acceptably.

// ── Model routing by language — TWO models only, NO cross-provider escalation ─────────────────────────────
// deepseek-v4-flash = the ONE deepseek: English, ARABIC, HEBREW (reliable + cheapest). It IS a reasoning model
//   (returns reasoning_content) so extraction stages MUST give it maxTokens headroom for reasoning+answer
//   (see claims.js) — under-budgeting truncates → continuation thrash. That is a CALL bug to fix, not a model
//   failure to escalate around. Persian is the ONLY language flash can't do (silently empty).
// claude-haiku-4-5 = the ONE haiku: PERSIAN ONLY. NEVER an English/Arabic/Hebrew fallback — too expensive.
// Fallback = the SAME model retried (runLadder: primary===fallback → 4 tries). No pro, no sonnet, no
// cross-provider hop. Fix the deepseek call; do not escalate to haiku.
const FLASH = 'deepseek-v4-flash', HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6'; // NOT an extraction fallback — only the doctrinal/CONCEPTUAL override below (Gate of the Heart)
const LANG_ROUTING = {
  en: { disambig: FLASH, hype: FLASH, extract: FLASH, fallback: FLASH },
  ar: { disambig: FLASH, hype: FLASH, extract: FLASH, fallback: FLASH }, // flash handles Arabic
  he: { disambig: FLASH, hype: FLASH, extract: FLASH, fallback: FLASH }, // flash handles Hebrew
  fa: { disambig: HAIKU, hype: HAIKU, extract: HAIKU, fallback: HAIKU }, // Persian ONLY → haiku (retry itself)
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
  // Mázindarání — Ẓuhúru'l-Ḥaqq (Persian → HAIKU: flash silently fails on Persian, and these are auto-detected
  // as 'ar' because of heavy Arabic quotation of the Writings — pin lang:'fa' so they route to haiku, which is
  // reliable on both Persian and Arabic). doc_ids are the REAL ingested volumes (earlier placeholders 617xxx
  // did not exist, so the override never applied and the books would have misrouted to flash).
  15228: { priority: 45, genre: 'history', lang: 'fa', domain: 'bahai' }, // Ẓuhúru'l-Ḥaqq v1 (Pre-Bábí Era)
  15257: { priority: 46, genre: 'history', lang: 'fa', domain: 'bahai' }, // v2 (The Báb)
  15254: { priority: 47, genre: 'history', lang: 'fa', domain: 'bahai' }, // v3 (Bábí Biographies)
  20028: { priority: 48, genre: 'history', lang: 'fa', domain: 'bahai' }, // v4 (Early Bahá'u'lláh)
  15256: { priority: 49, genre: 'history', lang: 'fa', domain: 'bahai' }, // v5 (Later Bahá'u'lláh)
  20035: { priority: 50, genre: 'history', lang: 'fa', domain: 'bahai' }, // v6 (Bahá'í Biographies)
  20037: { priority: 51, genre: 'history', lang: 'fa', domain: 'bahai' }, // v7 (‘Abdu'l-Bahá)
  15255: { priority: 52, genre: 'history', lang: 'fa', domain: 'bahai' }, // v8 (Covenant Biographies)
  15259: { priority: 53, genre: 'history', lang: 'fa', domain: 'bahai' }, // v9 (Shoghi Effendi)
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
