// concepts/ctai — fetch the SIDE-BY-SIDE PARAGRAPH: the original beside Shoghi Effendi's rendering.
//
// SCOPE IS DELIBERATELY NARROW (Chad, 2026-08-25). This client uses ONE endpoint, /passages, to get a
// paragraph pair — source text, translation, and word-level alignment spans. That pair is what we store in
// the database, so later processing can read whichever side it needs without any network call at all.
//
// It does NOT use /jafar. That endpoint is a per-word concordance report — many corpus examples of how one
// term has been rendered — which is a TRANSLATOR'S tool, not a paragraph-ingest tool. Nothing here needs it:
// once both sides of a paragraph are in the database, a model reading the original can identify its own
// terms directly from the text in front of it.
//
// WHY BOTH SIDES ARE WORTH STORING: English merges concepts the original keeps apart. Salat, Du'a and Dhikr
// all surface as "prayer"; 'adl and insaf both as "justice". A process that only ever sees the English
// cannot recover that distinction. Equally, Shoghi Effendi's rendering is not a lossy copy to be corrected —
// as authorised interpreter his word-choice FIXES which sense of a polysemous term is operative. Neither
// side is sufficient alone, which is exactly why the schema now holds both.
//
// COVERAGE is his translations only, since CTAI is a concordance of them. Measured pair counts below. The
// Kitab-i-Aqdas, Some Answered Questions and the Tablets of the Divine Plan are absent because he did not
// translate them — a fact about the corpus, not a gap to work around.
// Deps: config (ctai.apiUrl/apiKey), global fetch.

import { config } from '../../config.js';

const TIMEOUT_MS = 25000;
const MIN_OVERLAP = 0.5;         // below this we HOLD rather than bind to the wrong original

/**
 * docId → CTAI work slug. Only works Shoghi Effendi translated appear here; a doc absent from this map has
 * no aligned original by definition. Ids are the CANONICAL copies from concepts/core-roster.js — a scraped
 * copy would align just as well and anchor the claims to the wrong document.
 */
/**
 * work slug → the document holding it. WORK-KEYED, not doc-keyed, because ONE DOCUMENT CAN HOLD SEVERAL
 * WORKS: Bahá'í Prayers contains both the Tablet of Aḥmad and the Fire Tablet, and a compilation of tablets
 * holds many. A doc→work map can only ever align one of them and silently drops the rest.
 *
 * Ids are CANONICAL copies confirmed by ALIGNMENT COVERAGE, not by title and not by search rank alone.
 * Search rank is not enough on its own: an anthology that QUOTES a work matches its passages and can
 * outrank the work itself — "Bahá'í Sacred Writings" beat Gleanings 1.0 to 0.0 on votes, while alignment
 * coverage separates them decisively (Gleanings 699/746 = 94%; an anthology matches a fraction of its bulk).
 */
export const CTAI_DOC_BY_WORK = Object.freeze({
  'kitab-i-iqan': 20810,                    // 290/292 · fa 272 / ar 18
  gleanings: 8312,                          // 699/746
  'epistle-to-the-son-of-the-wolf': 8273,   // 258/317
  'the-hidden-words': 20809,                // 157/163 after the lead-in merge · ar 78 / fa 79
  'prayers-and-meditations': 20805,         // 846/878 · ar 834 / fa 12
  'will-and-testament': 20920,              // 57/57 — the WHOLE work. ⚠ NOT 8202: that is a duplicate whose
                                            //   content was retired at dedupe, and aligning against it
                                            //   returned 0 and read as "the work isn't here".
  'tablet-of-ahmad': 20762,                 // inside Bahá'í Prayers, 16/17
  'fire-tablet': 20762,                     // inside Bahá'í Prayers, 50/50
  'kitab-i-ahd': 20781,                     // inside Fountain of Wisdom, 14/16
  'tablet-of-carmel': 20781,                // ALSO in Gleanings — see CTAI_EXTRA_HOSTS
  'tablet-of-the-holy-mariner': 20762,      // partial: Bahá'í Prayers carries 16 of its 57 pairs
});

/**
 * A short tablet legitimately appears in SEVERAL compilations, and each copy deserves its original. The map
 * above names one host per work so defaults and coverage listings stay simple; these are the additional
 * confirmed hosts, every one verified by alignment coverage rather than by title.
 */
export const CTAI_EXTRA_HOSTS = Object.freeze([
  { work: 'tablet-of-carmel', docId: 8312 },            // 5/5 in Gleanings
  { work: 'will-and-testament', docId: 20777 },         // 28/59 in Bahá'í Sacred Writings
]);

/** Reverse view for callers that have a doc and want its work(s). */
export const CTAI_WORKS_FOR_DOC = (docId) =>
  Object.entries(CTAI_DOC_BY_WORK).filter(([, id]) => id === Number(docId)).map(([w]) => w);

/** Back-compat: the first work a doc holds. Prefer CTAI_WORKS_FOR_DOC — a doc may hold more than one. */
export const CTAI_WORK_BY_DOC = Object.freeze(
  Object.fromEntries(Object.entries(CTAI_DOC_BY_WORK).map(([w, id]) => [id, w])));

/**
 * Pair count per work, EVERY ONE MEASURED by binary search (2026-08-25). pair_index is 1-based; 0 is empty
 * on every work tested.
 *
 * MEASURED, NOT ESTIMATED — and the difference is not academic. Prayers and Meditations was first entered
 * here as a guessed 700; it is actually 858, so the backfill silently truncated the last 158 pairs and
 * reported 79% coverage as though that were the book. An estimate low by 18% does not fail, it under-fills
 * and looks finished. (A ceiling has the opposite cost: probing 2,000 indexes for a 5-pair tablet is 400×
 * the needed traffic against someone else's API.)
 */
export const CTAI_PAIR_COUNT = Object.freeze({
  'kitab-i-iqan': 291,
  gleanings: 729,
  'the-hidden-words': 160,
  'epistle-to-the-son-of-the-wolf': 268,
  'prayers-and-meditations': 858,
  'will-and-testament': 59,
  'tablet-of-the-holy-mariner': 57,
  'fire-tablet': 50,
  'tablet-of-ahmad': 17,
  'kitab-i-ahd': 16,
  'tablet-of-carmel': 5,
});

/** True when an aligned original can be fetched for this doc at all. */
export const hasAlignment = (docId) => CTAI_WORKS_FOR_DOC(docId).length > 0;

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
