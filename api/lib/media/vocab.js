// The CONTROLLED VOCABULARY for transcripts: our own spellings of names and terms (curated core here + the entity graph's
// names, built by the media-vocab job), the matching that proposes corrections, and the GUARD that keeps the corrector
// to names and terms — an edit must turn a few words into a vocabulary entry that sounds like them, or it is refused.
// Edits are applied to aligned WORDS (each keeps a time), so a corrected name stays clickable. Pure.
import { fold } from './names.js';

/** Curated core — Shoghi Effendi's transliteration as the library prints it (curly apostrophes, ‘ for ‘ayn). */
export const CORE_TERMS = `Bahá’u’lláh|the Báb|‘Abdu’l-Bahá|Shoghi Effendi|Bahá’í|Bahá’ís|Bahá’í Faith|Bábí|Bábís|Kitáb-i-Aqdas|Kitáb-i-Íqán|Íqán|Aqdas|Bayán|
Ḥuqúqu’lláh|Mashriqu’l-Adhkár|Ḥaẓíratu’l-Quds|Riḍván|Naw-Rúz|Ayyám-i-Há|‘Akká|Bahjí|Shíráz|Ṭihrán|Tabríz|Baghdád|Iṣfahán|Mázindarán|Khurásán|Badasht|
Shaykh Ṭabarsí|Nayríz|Zanján|Máh-Kú|Chihríq|Síyáh-Chál|Ṭáhirih|Quddús|Mullá Ḥusayn|Vaḥíd|Ḥujjat|Nabíl|Nabíl-i-A‘ẓam|Nabíl-i-Zarandí|Mírzá Yaḥyá|Ṣubḥ-i-Azal|
Mírzá Muḥammad-‘Alí|Bahíyyih Khánum|Navváb|Ásíyih Khánum|Mírzá Mihdí|Munírih Khánum|Rúḥíyyih Khánum|Amatu’l-Bahá|Shaykh Aḥmad|Siyyid Káẓim|
Mullá ‘Alíy-i-Basṭámí|Letters of the Living|Sidratu’l-Muntahá|Hands of the Cause|Ḥaḍrat|Mírzá Abu’l-Faḍl|Abu’l-Faḍl|Varqá|Rúḥu’lláh|Badí‘|Ṭarázát|
Tajallíyát|Kalimát-i-Firdawsíyyih|Ishráqát|Lawḥ-i-Ḥikmat|Súriy-i-Haykal|Súriy-i-Mulúk|Lawḥ-i-Aqdas|Súriy-i-Ra’ís|Lawḥ-i-Ra’ís|Lawḥ-i-Ibn-i-Dhi’b|
Qayyúmu’l-Asmá’|Dalá’il-i-Sab‘ih|Kitáb-i-‘Ahd|Lawḥ-i-Karmil|Tablet of Carmel|Seven Valleys|Four Valleys|Hidden Words|Gleanings|
Epistle to the Son of the Wolf|Some Answered Questions|The Secret of Divine Civilization|Tablets of the Divine Plan|Will and Testament|
The Dispensation of Bahá’u’lláh|God Passes By|The Advent of Divine Justice|The Promised Day Is Come|The World Order of Bahá’u’lláh|The Dawn-Breakers|
Universal House of Justice|Local Spiritual Assembly|National Spiritual Assembly|Continental Board of Counsellors|Auxiliary Board|Covenant-breaker|
Covenant-breakers|Most Great Peace|Lesser Peace|Most Great Name|Alláh-u-Abhá|Yá Bahá’u’l-Abhá|Abhá Kingdom|Abhá Beauty|Blessed Beauty|Ancient Beauty|
Greatest Holy Leaf|Purest Branch|Most Great Branch|Qá’im|Imám Ḥusayn|Imám ‘Alí|Muḥammad|Qur’án|Islám|Zoroaster|Ḥájí|Mírzá|Siyyid|Mullá|Shaykh|Khánum|Áqá|
Karbilá|Najaf|Mount Carmel|Shrine of the Báb|Mansion of Bahjí|Mazra‘ih|Riḍván Garden|‘Iráq|Kurdistán|Sulaymáníyyih|Ḥájí Mírzá Áqásí|Muḥammad Sháh|
Náṣiri’d-Dín Sháh|Sulṭán ‘Abdu’l-‘Azíz|Khadíjih Bagum|Mírzá Badí‘u’lláh|Ḥájí Mírzá Ḥaydar-‘Alí|Ṭarázu’lláh Samandarí|‘Alí-Akbar Furútan|Furútan|
Raḥmatu’lláh Muhájir|Enoch Olinga|Músá Banání|Adelbert Mühlschlegel|Leroy Ioas|Horace Holley|Martha Root|Hermann Grossmann|Ugo Giachery|John Robarts|
William Sears|Paul Haney|Dhikru’lláh Khádem|Shu‘á‘u’lláh ‘Alá’í|Jalál Kházeh|Abu’l-Qásim Faizi|Ḥasan Balyuzi|Adib Taherzadeh|‘Alí Nakhjavání|
Violette Nakhjavání|Hooper Dunbar|Ian Semple|Hushmand Fatheazam|Farzam Arbab|Hartmut Grossmann|Mullá Ṣádiq|Ḥusayn-‘Alí|Mírzá Ḥusayn-‘Alí|
Mírzá ‘Abbás|Mírzá Buzurg|Mírzá Áqá Ján|Ḥájí Mírzá Siyyid ‘Alí|Siyyid ‘Alí-Muḥammad|Kázimayn|Sámarrá|Yazd|Kirmán|Qazvín|Hamadán|Káshán|Mashhad|Núr|
Tákur|Ádhirbáyján|Bárfurúsh|Bushihr|Edirne|Gallipoli|Haifa|Bahá|Abhá|Tablet of Aḥmad|Fire Tablet|Long Healing Prayer|Kitáb-i-Badí‘|Javáhiru’l-Asrár|
Ṭabarsí|Mullá Muḥammad-‘Alíy-i-Zanjání|Áqáy-i-Kalím|Mírzá Músá|Fáṭimih|Ṣaḥífiy-i-Fáṭimíyyih|Ḥadíth|Sharí‘ah|Mahdí|Mihdí|Dayyán|Him Whom God shall make manifest`
  .split(/\s*\|\s*/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Letters and digits only, diacritics and apostrophes folded away: "Bahá’u’lláh" = "Baha'u'llah" = "Bahaullah". */
export const keyOf = (s) => fold(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const hasMarks = (s) => /[^\x00-\x7f]|['’‘-]/.test(String(s));

/** A vocabulary: { terms: Set, byKey: Map(key → term), keys: [{ key, term }] }. Later entries never replace earlier ones. */
export function buildVocab(lists = [CORE_TERMS]) {
  const byKey = new Map(), terms = new Set();
  for (const t of lists.flat()) {
    const term = String(t || '').trim(); const k = keyOf(term);
    if (k.length < 3 || byKey.has(k)) continue;
    byKey.set(k, term); terms.add(term);
  }
  return { terms, byKey, keys: [...byKey].map(([key, term]) => ({ key, term })) };
}

export function levenshtein(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const PUNCT_HEAD = /^[("“‘'\[]+/, PUNCT_TAIL = /[)"”’'\],.;:!?؟]+$/;
const core = (w) => String(w).replace(PUNCT_HEAD, '').replace(PUNCT_TAIL, '');
const possessive = (w) => /['’]s[,.;:!?]*$/i.test(w);
const stripPoss = (w) => w.replace(/['’]s([,.;:!?]*)$/i, '$1');

/** How close `from` (heard words) is to `to` (a vocabulary term) — the corrector may only change what sounds alike. */
export function soundsAlike(from, to) {
  const a = keyOf(stripPoss(from)), b = keyOf(to);
  if (!a || !b) return false;
  if (a === b) return true;
  const allowed = Math.max(2, Math.ceil(b.length * 0.4));
  return levenshtein(a, b, allowed) <= allowed;
}

/**
 * The SAFE pass (no model): runs of 1–4 words whose folded spelling IS a vocabulary term with marks ("Baha'u'llah",
 * "Abdul Baha", "Kitab-i-Iqan") become that term. Plain-ASCII terms ("Haifa", "Master") are left alone — only spelling
 * marks are restored here, never a word changed. → edits [{ i0, i1, from, to, method: 'vocab' }] (word indices).
 */
export function exactEdits(words, vocab, { maxN = 4 } = {}) {
  const edits = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = Math.min(maxN, words.length - i); n >= 1; n--) {
      const span = words.slice(i, i + n).map((w) => w.w);
      const k = keyOf(stripPoss(span.map(core).join(' ')));
      const term = vocab.byKey.get(k);
      if (!term || !hasMarks(term)) continue;
      const shown = span.map(core).join(' ');
      if (stripPoss(shown) === term) { i += n - 1; break; }   // already right
      // a lone word must look like a name (capitalised) — "the bab" → "the Báb" yes; never a common lower-case word
      if (n === 1 && !/^[A-Z‘'’ʻ]/.test(core(span[0])) && !/^the /i.test(term)) continue;
      edits.push({ i0: i, i1: i + n, from: span.join(' '), to: term, method: 'vocab' });
      i += n - 1; break;
    }
  }
  return edits;
}

/** Name-like runs that sound like a vocabulary term but are spelled differently — what the model is asked to judge. */
export function suspects(words, vocab, { maxN = 3, limit = 40 } = {}) {
  const out = [], seen = new Set();
  const byLen = new Map();
  for (const e of vocab.keys) { const L = e.key.length; if (!byLen.has(L)) byLen.set(L, []); byLen.get(L).push(e); }
  for (let i = 0; i < words.length && out.length < limit; i++) {
    if (!/^[A-Z]/.test(core(words[i].w))) continue;
    for (let n = 1; n <= maxN && i + n <= words.length; n++) {
      const from = words.slice(i, i + n).map((w) => core(w.w)).join(' ');
      const k = keyOf(stripPoss(from));
      if (k.length < 5 || seen.has(k) || vocab.byKey.has(k)) continue;
      // a misheard name often LOSES letters ("Baola" for Bahá’u’lláh): longer terms are searched too, and candidates rank by
      // distance relative to the longer key, so the model sees Bahá’u’lláh beside Bahá
      const hits = [];
      for (let L = k.length - 2; L <= k.length + 5; L++) for (const e of byLen.get(L) || []) {
        if (e.key[0] !== k[0] && e.key[1] !== k[1]) continue;
        const allowed = Math.ceil(Math.max(k.length, e.key.length) * 0.45);
        const d = levenshtein(k, e.key, allowed);
        if (d <= allowed) hits.push({ term: e.term, r: d / Math.max(k.length, e.key.length) });
      }
      if (hits.length) { seen.add(k); out.push({ from, candidates: hits.sort((a, b) => a.r - b.r).slice(0, 4).map((h) => h.term) }); }
    }
  }
  return out;
}

/** Word-index span of `from` in the paragraph's words (punctuation and case ignored), at or after `start`; -1 when absent. */
export function findSpan(words, from, start = 0) {
  const want = String(from).split(/\s+/).map((w) => keyOf(w)).filter(Boolean);
  if (!want.length) return -1;
  for (let i = start; i + want.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length && ok; j++) ok = keyOf(words[i + j].w) === want[j];
    if (ok) return i;
  }
  return -1;
}

/**
 * The GUARD on a model's proposed edits for one paragraph: `to` must be a vocabulary term, `from` must be present, short
 * (≤ 4 words) and sound like it. Anything else is refused with its reason — the corrector never rewords.
 * → { ok: [{ i0, i1, from, to, method: 'model' }], refused: [{ from, to, why }] }
 */
export function guardEdits(words, proposed, vocab) {
  const ok = [], refused = [], used = new Set();
  for (const e of proposed || []) {
    const from = String(e?.from || '').trim(), to = String(e?.to || '').trim();
    if (!from || !to) { refused.push({ from, to, why: 'empty' }); continue; }
    if (!vocab.terms.has(to)) { refused.push({ from, to, why: 'not in the vocabulary' }); continue; }
    if (from.split(/\s+/).length > 4) { refused.push({ from, to, why: 'more than four words' }); continue; }
    if (!soundsAlike(from, to)) { refused.push({ from, to, why: 'does not sound alike' }); continue; }
    const i0 = findSpan(words, from);
    if (i0 < 0) { refused.push({ from, to, why: 'not in the text' }); continue; }
    const i1 = i0 + from.split(/\s+/).length;
    if ([...Array(i1 - i0).keys()].some((k) => used.has(i0 + k))) { refused.push({ from, to, why: 'overlaps another edit' }); continue; }
    for (let k = i0; k < i1; k++) used.add(k);
    ok.push({ i0, i1, from: words.slice(i0, i1).map((w) => w.w).join(' '), to, method: 'model' });
  }
  return { ok, refused };
}

/** Apply edits (word-index spans) to aligned words: the span's time is shared by the new words; edge punctuation and a
 *  possessive are kept. Returns new words; edits must not overlap. */
export function applyEdits(words, edits) {
  const out = [];
  const sorted = [...edits].sort((a, b) => a.i0 - b.i0);
  let i = 0;
  for (const e of sorted) {
    while (i < e.i0) out.push(words[i++]);
    const span = words.slice(e.i0, e.i1);
    const head = (span[0].w.match(PUNCT_HEAD) || [''])[0];
    const lastW = span[span.length - 1].w;
    const tail = (lastW.match(PUNCT_TAIL) || [''])[0];
    const poss = possessive(lastW) && !/['’]s$/i.test(e.to) ? '’s' : '';
    const toks = e.to.split(/\s+/);
    const s = span[0].s, en = span[span.length - 1].e, step = (en - s) / toks.length;
    toks.forEach((t, k) => out.push({ ...span[Math.min(k, span.length - 1)], w: `${k === 0 ? head : ''}${t}${k === toks.length - 1 ? poss + tail : ''}`,
      s: Math.round((s + k * step) * 1000) / 1000, e: Math.round((s + (k + 1) * step) * 1000) / 1000 }));
    i = e.i1;
  }
  while (i < words.length) out.push(words[i++]);
  return out;
}

/** The terms of a vocabulary worth putting in Whisper's initial prompt for this item (≤ ~200 tokens): names in its
 *  metadata first, then the most common core terms. */
export function promptTerms({ title = '', speaker = '', extra = [] } = {}, vocab, max = 45) {
  const meta = `${title} ${speaker}`;
  const inMeta = vocab.keys.filter((e) => e.key.length >= 4 && keyOf(meta).includes(e.key)).map((e) => e.term);
  const first = ['Bahá’u’lláh', '‘Abdu’l-Bahá', 'the Báb', 'Shoghi Effendi', 'Bahá’í', 'Kitáb-i-Aqdas', 'Kitáb-i-Íqán', 'Universal House of Justice', 'Riḍván', 'Ṭáhirih', 'Quddús', 'Mullá Ḥusayn', '‘Akká', 'Bahjí', 'Ḥuqúqu’lláh', 'Mashriqu’l-Adhkár'];
  return [...new Set([...inMeta, ...extra, ...first, ...CORE_TERMS])].slice(0, max);
}
