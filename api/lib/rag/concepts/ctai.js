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
export const CTAI_WORK_BY_DOC = Object.freeze({
  20810: 'kitab-i-iqan',
  8312: 'gleanings',
  20809: 'the-hidden-words',
  8273: 'epistle-to-the-son-of-the-wolf',
});

/**
 * Pair count per work, MEASURED by binary search 2026-08-25 — pair_index is 1-based and 0 is empty on every
 * work tested. Without this a backfill probes a fixed ceiling (2,000 requests for a 160-pair book), which is
 * ~12× the needed traffic against someone else's API for no gain.
 */
export const CTAI_PAIR_COUNT = Object.freeze({
  'kitab-i-iqan': 291,
  gleanings: 729,
  'the-hidden-words': 160,
  'epistle-to-the-son-of-the-wolf': 268,
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
