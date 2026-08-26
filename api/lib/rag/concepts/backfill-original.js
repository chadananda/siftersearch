// concepts/backfill-original — populate the bilingual layer on `content`: for each paragraph of a work
// Shoghi Effendi translated, store the ORIGINAL beside his rendering, and mark that the rendering is his.
//
// Chad, 2026-08-25: "extend our content database with original_text and translation_text fields so we can
// populate the original on translations and the translations on originals… then whenever we process a
// document we could use either or both depending on the capability of the LLM. And always note a Shoghi
// Effendi translation when available. This is very significant for any analysis."
//
// The pairing is a DERIVED CLAIM about two texts, so it is stored with its provenance (align_ref: source,
// work, pair index, match score, timestamp) and it is re-runnable. A silent mis-pairing would attach one
// passage's original to another passage's doctrine — undetectable afterwards — so alignment happens as a
// monotonic sequence match with a length-aware score (see align.js for the measurements that forced both),
// and anything below threshold is left NULL rather than bound to its best available candidate.
//
// Measured on the Kitáb-i-Íqán (2026-08-25): 290 of 292 paragraphs aligned, zero non-monotonic steps, zero
// pairs claimed twice. The two unaligned are genuine: our opening invocation (which CTAI folds into its
// first pair) and a trailing footnote-definitions block.
// Deps: align.js (pure), ctai.js (transport), the injected store.

import { alignSequences } from './align.js';
import { CTAI_WORK_BY_DOC, fetchPair } from './ctai.js';
import { CLASS, coreEntry } from './core-roster.js';

/**
 * Who rendered the English, and therefore what the English is EVIDENCE OF.
 *
 * 'shoghi-effendi' is not a credit line — it marks that the word-choice is an authoritative interpretive act
 * fixing WHICH SENSE of a polysemous original is operative. A committee rendering (the Kitáb-i-Aqdas) is an
 * authoritative TEXT with no such sense-fixing power, and a provisional translation is neither. Downstream
 * analysis must be able to tell those apart, which is why this is a string and not a boolean.
 */
export function translationAuthorityFor(docId) {
  const cls = coreEntry(docId)?.cls;
  if (cls === CLASS.GUARDIAN_TRANSLATION) return 'shoghi-effendi';
  if (cls === CLASS.DESIGNATED) return 'committee';
  return null;                                       // GUARDIAN_ORIGINAL has no translation; nor does anything else
}

/** Fetch every aligned pair of a work, in order. One request per paragraph — the paragraph-at-a-time path. */
export async function fetchWorkPairs(work, maxPairs, { log, onProgress } = {}) {
  const pairs = [];
  for (let pi = 1; pi <= maxPairs; pi++) {
    const p = await fetchPair(work, pi, { log });
    if (!p) continue;                                // a gap in the index is not an error
    pairs.push({ key: p.pair_index, text: p.translation, source: p.source_text, section: p.section });
    onProgress?.(pi, maxPairs);
  }
  return pairs;
}

/**
 * Align and persist one document's originals.
 *
 * `dryRun` runs the whole read side and reports exactly what WOULD be written — including the coverage and
 * score spread — so a bad alignment is caught before it touches 4.2M rows of content.
 */
export async function backfillDoc(ctx, docId, { maxPairs = 2000, minScore = 0.7, dryRun = false, log } = {}) {
  const work = CTAI_WORK_BY_DOC[Number(docId)];
  if (!work) return { docId, skipped: 'no aligned original for this doc', written: 0 };

  const authority = translationAuthorityFor(docId);
  const paras = await ctx.store.getParagraphs(docId);          // already prose-only (paragraph|quote)
  const theirs = await fetchWorkPairs(work, maxPairs, { log });
  if (!theirs.length) return { docId, work, error: 'aligned source returned no pairs', written: 0 };

  // Key on the CONTENT ROW ID, not `pid`: pid is COALESCE(external_para_id, 'p'||id), so for a doc carrying
  // external ids it is not the primary key and the UPDATE would match nothing while reporting success.
  const ours = paras.map((p) => ({ key: p.id, text: p.text }));
  const { matches, unmatchedOurs, unmatchedTheirs, stats } = alignSequences(ours, theirs, { minScore });
  const byKey = new Map(theirs.map((t) => [t.key, t]));

  const rows = matches.map((m) => {
    const t = byKey.get(m.theirKey);
    return {
      paraId: m.ourKey,
      originalText: t.source,
      originalLang: 'ar',                            // CTAI reports source_lang 'ar' for this corpus
      translationAuthority: authority,
      alignRef: JSON.stringify({ source: 'ctai', work, pairIndex: m.theirKey, section: t.section,
        score: m.score, alignedAt: new Date().toISOString() }),
    };
  });

  const result = {
    docId, work, authority, dryRun, ...stats,
    unmatchedOurs: unmatchedOurs.length, unmatchedTheirs: unmatchedTheirs.length,
    // Name them: an unmatched paragraph is a thing to look at, not a rounding error.
    unmatchedSamples: unmatchedOurs.slice(0, 5).map((u) => ({ index: u.index, text: String(u.text).slice(0, 90) })),
    written: 0,
  };
  if (dryRun) return result;

  result.written = await ctx.store.saveParagraphOriginals(rows);
  log?.info?.(result, 'concepts/backfill-original');
  return result;
}
