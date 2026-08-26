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

import { alignSequences, detectSourceLang } from './align.js';
import { CTAI_WORK_BY_DOC, CTAI_PAIR_COUNT, fetchPair } from './ctai.js';
import { CLASS, coreEntry } from './core-roster.js';
import { pool } from '../kernel/run.js';

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

/**
 * Fetch every aligned pair of a work — the paragraph-at-a-time path, one request per paragraph.
 *
 * POOLED, because serial is not merely slow here, it is unusable: Gleanings is 729 pairs, and at ~0.8s each
 * a serial fetch runs ~10 minutes — past the edge proxy's request timeout, so the caller gets a 502 while the
 * work continues invisibly on the server. Concurrency brings a whole book inside one request.
 *
 * Order is restored by pair_index afterwards, since the pool completes out of order and the alignment that
 * consumes this is a MONOTONIC sequence match — feeding it shuffled pairs would break the one property that
 * keeps a book in register.
 */
export async function fetchWorkPairs(work, maxPairs, { log, concurrency = 8 } = {}) {
  const indexes = Array.from({ length: maxPairs }, (_, i) => i + 1);
  const fetched = await pool(concurrency, indexes, async (pi) => {
    const p = await fetchPair(work, pi, { log });
    if (!p) return null;                             // a gap in the index is not an error
    return { key: p.pair_index, text: p.translation, source: p.source_text, section: p.section,
      aligned: p.aligned || [] };
  });
  return fetched.filter(Boolean).sort((a, b) => a.key - b.key);
}

/**
 * Align and persist one document's originals.
 *
 * `dryRun` runs the whole read side and reports exactly what WOULD be written — including the coverage and
 * score spread — so a bad alignment is caught before it touches 4.2M rows of content.
 */
export async function backfillDoc(ctx, docId, { maxPairs, minScore = 0.7, dryRun = false, log } = {}) {
  const work = CTAI_WORK_BY_DOC[Number(docId)];
  if (!work) return { docId, skipped: 'no aligned original for this doc', written: 0 };

  const authority = translationAuthorityFor(docId);
  const paras = await ctx.store.getParagraphs(docId);          // already prose-only (paragraph|quote)
  // Measured pair count, not a blanket ceiling: probing 2,000 indexes for a 160-pair book is ~12x the
  // needed traffic against someone else's API for nothing.
  const theirs = await fetchWorkPairs(work, maxPairs ?? CTAI_PAIR_COUNT[work] ?? 2000, { log });
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
      // PER-PARAGRAPH, never per-work: the Íqán is Persian, the Hidden Words has an Arabic part and a
      // Persian part, and Gleanings is compiled from tablets in both. CTAI labels the Íqán 'ar'; trusting
      // that stamped 290 Persian paragraphs as Arabic, which misroutes them to a model that cannot read them.
      originalLang: detectSourceLang(t.source),
      // The word-to-word map, kept so a reader can ask which ORIGINAL term a given English word renders.
      // In Hidden Words Arabic #2 "Justice" is إنصاف (inṣáf, equity), NOT عدل (ʿadl) — different roots,
      // different obligations, one English word. Without these spans that distinction is unrecoverable.
      wordAlignment: t.aligned?.length ? JSON.stringify(t.aligned) : null,
      translationAuthority: authority,
      alignRef: JSON.stringify({ source: 'ctai', work, pairIndex: m.theirKey, section: t.section,
        score: m.score, alignedAt: new Date().toISOString() }),
    };
  });

  const langs = {};
  for (const r of rows) langs[r.originalLang ?? 'unknown'] = (langs[r.originalLang ?? 'unknown'] || 0) + 1;

  const result = {
    docId, work, authority, dryRun, ...stats, originalLangs: langs,
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
