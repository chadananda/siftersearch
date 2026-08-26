// concepts/ctai — the aligned-original client. Two endpoints, two distinct jobs (Chad, 2026-08-25):
//
//   /passages  → the SIDE-BY-SIDE PARAGRAPH. The original beside Shoghi Effendi's rendering, plus word-level
//                alignment pairs with character spans on both sides. This is the unit of extraction.
//   /jafar     → the IN-DEPTH REPORT ON ONE WORD. Root, transliteration, literal senses, root_slug, and the
//                corpus-wide rendering spectrum for a single term.
//
// So the flow is: fetch the SBS paragraph, extract concepts from it, then root-key each concept by asking
// jafar about the ONE original term the alignment says it renders. Roots attach to the concepts we keep,
// not to every word we saw — which also makes the root lookup cacheable across the whole corpus, since the
// distinct significant-term vocabulary is small and repeats endlessly.
//
// WHY THE ROOT MATTERS AT ALL (doctrine lives in concepts/bilingual.js; this file is transport): English
// silently merges distinct concepts. Ṣalát (ص-ل-و), Duʿá (د-ع-و) and Dhikr (ذ-ك-ر) all surface as "prayer";
// ʿadl (ع-د-ل) and insáf (ن-ص-ف) both as "justice". Only the root keeps them apart, so concept identity is
// keyed to root_slug, never to the English gloss.
//
// ⚠ /jafar RETURNS HTTP 200 WITH ZERO TERMS WHEN OVERFED. Measured 2026-08-25: a term or short phrase always
// works; ~40 words works; past roughly 50 words it returns a well-formed body with `enriched_terms: []` —
// indistinguishable from an honest "no roots here". Since we only ever send it one term, this is a guard
// rather than a workaround, but it is why glossTerm refuses long input outright instead of trusting silence.
//
// COVERAGE is Shoghi Effendi's translations only — CTAI is a concordance of them. Measured pair counts:
// Íqán 291 · Gleanings 729 · Hidden Words 160 · Epistle 268. The Aqdas, Some Answered Questions and the
// Tablets of the Divine Plan are absent because he did not translate them, so those docs have no aligned
// original and extract from the English alone. That is a fact about the corpus, not a failure to handle.
// Deps: config (ctai.apiUrl/apiKey), global fetch.

import { config } from '../../config.js';

const TIMEOUT_MS = 25000;
const MAX_GLOSS_WORDS = 12;      // a term or short phrase; see the silent-empty note above
const MIN_OVERLAP = 0.5;         // below this we HOLD rather than bind to the wrong original

/**
 * docId → CTAI work slug. Only works Shoghi Effendi translated appear here; a doc absent from this map has
 * no aligned original by definition. Ids are the CANONICAL copies from concepts/core-roster.js — a scraped
 * copy would align just as well and anchor the claims to the wrong document.
 */
export const CTAI_WORK_BY_DOC = Object.freeze({
  20810: 'kitab-i-iqan',
  8312: 'gleanings',
  20809: 'the-hidden-words',
  8273: 'epistle-to-the-son-of-the-wolf',
});

/** True when an aligned original can be fetched for this doc at all. */
export const hasAlignment = (docId) => Boolean(CTAI_WORK_BY_DOC[Number(docId)]);

function creds() {
  const url = config.ctai?.apiUrl || 'https://ctai.info/api/v1';
  const key = config.ctai?.apiKey || process.env.CTAI_KEY;
  if (!config.ctai?.enabled || !key) return null;
  return { url, key };
}

async function ctaiFetch(path, { method = 'GET', body = null, log } = {}) {
  const c = creds();
  if (!c) return null;
  try {
    const res = await fetch(`${c.url}${path}`, {
      method,
      headers: { Authorization: `Bearer ${c.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) { log?.warn?.({ path, status: res.status }, 'ctai request failed'); return null; }
    return await res.json();
  } catch (err) {
    log?.warn?.({ path, err: err.message }, 'ctai request error');
    return null;
  }
}

// ── /passages — the side-by-side paragraph ───────────────────────────────────

/** Fetch one SBS pair by position. Works are 1-indexed; pair_index 0 is empty on every work tested. */
export async function fetchPair(work, pairIndex, { log } = {}) {
  const params = new URLSearchParams({ work, pair_index: String(pairIndex), align: 'true' });
  const d = await ctaiFetch(`/passages?${params}`, { log });
  return d?.results?.[0] || null;
}

/** Longest distinctive opening span of an English paragraph, used as the search probe. Pure. */
export function probeSpan(text, words = 8) {
  const w = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  // Skip a leading bracketed paragraph number ("[81] Great God!") — our marker, not the text.
  const start = /^\[\d+\]$/.test(w[0] || '') ? 1 : 0;
  return w.slice(start, start + words).join(' ');
}

const normEn = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Word-overlap of two English strings, 0..1 against the SHORTER one. Pure. */
export function overlap(a, b) {
  const A = new Set(normEn(a).split(' ').filter((w) => w.length > 3));
  const B = new Set(normEn(b).split(' ').filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}

/**
 * Find the SBS pair for ONE English paragraph of a known work.
 *
 * Matched by English text overlap against CTAI's own `translation`, never by position: our paragraph
 * numbering and CTAI's pair_index are independent segmentations of the same book (the Íqán is 292¶ here and
 * 291 pairs there), so aligning by index would silently offset the entire work.
 *
 * Returns null when nothing clears MIN_OVERLAP — a HOLD, not a guess. Binding a paragraph to the wrong
 * original attaches one passage's roots to another's doctrine, which is worse than having no roots.
 */
export async function findAligned(docId, paraText, { log } = {}) {
  const work = CTAI_WORK_BY_DOC[Number(docId)];
  if (!work) return null;
  const q = probeSpan(paraText);
  if (q.split(' ').length < 4) return null;                   // too short to identify a passage

  const params = new URLSearchParams({ q, work, align: 'true', limit: '10' });
  const found = await ctaiFetch(`/passages?${params}`, { log });
  const results = found?.results || [];
  if (!results.length) return null;

  let best = null, bestScore = 0;
  for (const r of results) {
    const score = overlap(paraText, r.translation);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  if (!best || bestScore < MIN_OVERLAP) {
    log?.debug?.({ docId, q, bestScore }, 'ctai/align no confident match — extract from English alone');
    return null;
  }
  return {
    work, pairIndex: best.pair_index, section: best.section, url: best.url,
    source: best.source_text, translation: best.translation,
    aligned: best.aligned || [], matchScore: Number(bestScore.toFixed(3)),
  };
}

// ── /jafar — the in-depth report on ONE word ─────────────────────────────────

// Cached across the process: the significant-term vocabulary is small and repeats across the whole corpus,
// so the same dozen doctrinal terms would otherwise be re-fetched thousands of times.
const glossCache = new Map();

/**
 * Root report for ONE original-language term (or very short phrase). Returns the enriched term object —
 * { term, root, transliteration, root_slug, literal, rendering_spectrum, occurrence_count } — or null.
 *
 * Refuses input longer than MAX_GLOSS_WORDS rather than sending it: jafar answers 200-with-nothing when
 * overfed, which would be recorded as "this term has no root" — a false negative that looks like data.
 */
export async function glossTerm(term, { log } = {}) {
  const t = String(term || '').trim();
  if (!t) return null;
  if (t.split(/\s+/).length > MAX_GLOSS_WORDS) {
    log?.warn?.({ words: t.split(/\s+/).length }, 'ctai/gloss refused — jafar is a per-WORD report, not a passage gloss');
    return null;
  }
  if (glossCache.has(t)) return glossCache.get(t);
  const j = await ctaiFetch('/jafar', { method: 'POST', body: { text: t, filter: false }, log });
  const terms = (j?.enriched_terms || []).filter((x) => x?.root && !x.is_stop);
  // A multi-word phrase glosses to several terms; the head term is the one carrying the concept.
  const best = terms.sort((a, b) => (b.occurrence_count || 0) - (a.occurrence_count || 0))[0] || null;
  glossCache.set(t, best);
  return best;
}

// ── Locating the original term behind an English concept ─────────────────────

/**
 * Given a concept's English surface and the paragraph's alignment pairs, return the ORIGINAL term(s) that
 * render it — by character-span overlap in the translation, not by guessing morphology.
 *
 * This is what makes the root deterministic rather than model-invented: the extractor names a concept in
 * English, the alignment says which original words occupy that span, and jafar reports that word's root.
 */
export function sourceTermsFor(englishSurface, aligned = [], translation = '') {
  const surface = String(englishSurface || '').trim();
  if (!surface || !aligned.length) return [];
  const hay = String(translation || '').toLowerCase();
  const at = hay.indexOf(surface.toLowerCase());
  if (at < 0) return [];
  const end = at + surface.length;
  return aligned
    .filter((a) => Array.isArray(a.target_span) && a.target_span[0] < end && a.target_span[1] > at)
    .map((a) => a.source)
    .filter(Boolean);
}

/**
 * Root-key one extracted concept. Returns { root, rootSlug, transliteration, literal, originalTerm,
 * renderingSpectrum } or null when the original term cannot be located — in which case the caller must OMIT
 * the root, never invent one.
 */
export async function rootForConcept(concept, alignedPair, { log } = {}) {
  if (!alignedPair) return null;
  const candidates = sourceTermsFor(concept, alignedPair.aligned, alignedPair.translation);
  for (const term of candidates) {
    const g = await glossTerm(term, { log });
    if (!g) continue;
    return {
      originalTerm: g.term, root: g.root, rootSlug: g.root_slug,
      transliteration: g.transliteration, literal: g.literal,
      renderingSpectrum: (g.rendering_spectrum || []).slice(0, 6),
    };
  }
  return null;
}
