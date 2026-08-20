// concepts/promote — turn scattered lexicon entries into ONE record per concept.
//
// Why this exists: nothing in the codebase wrote concept_entities (verified 2026-08-20: zero INSERT/UPDATE
// anywhere, three readers). So a concept existed only as N separate interpretations hanging off paragraphs.
// Two things were impossible as a result: asking about a concept across traditions, and linking a concept to
// its counterpart in another tradition — concepts/link reads concept_entities, so `links` could never be
// non-zero however much was extracted. This is the concept twin of the person pipeline's createEntity.
//
// DETERMINISTIC on purpose. Grouping identical symbols and ranking by recorded authority needs no judgement,
// and a deterministic pass can be re-run safely. The judgement calls the design does want — is this the SAME
// concept under a different name, does it correspond to a Buddhist one — belong to reconcile and link, which
// are evidence-based and proof-gated. Promotion must not quietly become an AI merge step.
import { queryAll } from '../../db.js';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Identity of a concept. The ROOT wherever it was captured — one English word collapses distinct concepts
 * (insáf, personal equity, vs ‘adl, societal justice, both gloss "justice"), exactly as a person's identity is
 * the Arabic-script name and not the romanization. The normalised symbol is the fallback, not the rule.
 */
export function conceptKeyOf(entry) {
  const root = String(entry?.root || '').trim();
  return root ? `root:${root.normalize('NFC')}` : `sym:${norm(entry?.symbol)}`;
}

/**
 * Group lexicon entries into concept records. Pure — no db, no model.
 * @param {Array} entries rows from concept_lexicon
 * @returns {Array} one record per concept
 */
export function groupConcepts(entries = []) {
  const byKey = new Map();
  for (const e of entries) {
    if (!norm(e?.symbol)) continue;                       // a nameless concept is not a concept
    const key = conceptKeyOf(e);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(e);
  }
  const out = [];
  for (const [key, rows] of byKey) {
    // canonical = the most-used form, the same rule person names follow. Ties break on first-seen.
    const counts = new Map();
    for (const r of rows) counts.set(r.symbol, (counts.get(r.symbol) || 0) + 1);
    const canonical = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // The authoritative reading wins the summary: LOWER tier = higher authority, and a lower reading fills
    // gaps rather than overriding (§6). Unknown tier sorts last so it can never displace a known one.
    const ranked = [...rows].sort((a, b) => (a.authority_tier ?? 999) - (b.authority_tier ?? 999));
    const top = ranked[0];
    const authorities = new Set(rows.map((r) => r.authority).filter(Boolean));
    out.push({
      key,
      canonical,
      root: rows.find((r) => r.root)?.root || null,
      renderings: [...new Set(rows.map((r) => r.symbol).filter(Boolean))],
      summary: top?.interpretation || null,
      authority: top?.authority || null,
      authority_tier: top?.authority_tier ?? null,
      // Distinct AUTHORITIES, not raw repetition: a concept three books treat is more central than one a
      // single book repeats three times. Same instinct as ranking a person by how many sources name them.
      importance: authorities.size * 10 + rows.length,
      concept_type: 'concept',
      interpretations: rows.map((r) => ({
        interpretation: r.interpretation, authority: r.authority, authority_tier: r.authority_tier,
        layer: r.layer ?? null, proof_doc_id: r.proof_doc_id, proof_verbatim: r.proof_verbatim,
      })),
    });
  }
  return out;
}

/** Promote the whole lexicon into concept_entities. Idempotent: a full rebuild, not an append. */
export async function run(ctx, opts = {}) {
  const rows = await queryAll(
    `SELECT id, symbol, interpretation, authority, authority_tier, layer, proof_doc_id, proof_verbatim
       FROM concept_lexicon LIMIT ?`, [opts.limit ?? 100000], 'concepts:promote-read');
  const concepts = groupConcepts(rows);
  const stats = { lexiconRows: rows.length, concepts: concepts.length, written: 0 };
  if (opts.dryRun) return { ...stats, sample: concepts.slice(0, 10) };
  stats.written = await ctx.store.saveConceptEntities(concepts);
  return stats;
}
