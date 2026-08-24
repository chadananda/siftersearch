// The ONE definition of "a graph entity is live (not a merged duplicate)". Import it; never inline it.
//
// Why this file exists: on 2026-08-24 we found 6,668 hollow entities being served as live people. Merging
// had TWO independent definitions — rag-adapter/store.js appended ' ⟨merged→N⟩' to canonical_name, while
// every reader (entity-api.js, bio.js) tested `last_assessed_version LIKE 'merged-into-%'`. Neither knew
// about the other. The API therefore served 6,666 merged persons whose claims and mentions had already been
// repointed to their survivor, with the marker visible in the name, and every person count was overstated
// by a third (26,026 reported vs 19,360 real). See [[feedback_surface_integrity_divergence]].
//
// The canonical tombstone is `last_assessed_version = 'merged-into-<survivorId>'`. The name marker is
// LEGACY: applyMerge no longer writes it, the repair strips it, and LIVE_SQL keeps excluding it so a stray
// pre-repair row can never be served. Deps: none (pure).

const MARKER_SRC = '\\s*⟨merged→(\\d+)⟩';

// Non-global: /g regexes carry lastIndex between .test() calls, which makes membership checks alternate.
export const MERGE_MARKER = new RegExp(MARKER_SRC);
const MARKER_ALL = new RegExp(MARKER_SRC, 'g');

/**
 * SQL predicate for live entities. Pass the table alias used in the query ('ge.' or '') — it is applied to
 * EVERY column named, because a half-aliased predicate is a runtime error in a joined query.
 */
export const LIVE_SQL = (a = '') =>
  `(${a}last_assessed_version IS NULL OR ${a}last_assessed_version NOT LIKE 'merged-into-%') AND ${a}canonical_name NOT LIKE '%⟨merged→%'`;

/** Remove every merge marker (they stacked up to nine deep) and restore the original name. */
export const stripMergeMarkers = (name) => String(name ?? '').replace(MARKER_ALL, '').trim();

/** Every survivor id named by a row's markers, in the order the merges were applied. */
export function mergeTargets(name) {
  return [...String(name ?? '').matchAll(MARKER_ALL)].map((m) => Number(m[1]));
}

export const tombstoneFor = (survivorId) => `merged-into-${survivorId}`;

/** The survivor id encoded in a tombstone, or null when the string is an ordinary version stamp. */
export function tombstoneTarget(lav) {
  const m = /^merged-into-(\d+)$/.exec(String(lav ?? ''));
  return m ? Number(m[1]) : null;
}

/** Row-level twin of LIVE_SQL — either tombstone form alone means the row is dead. */
export const isMergedRow = (row = {}) =>
  tombstoneTarget(row.last_assessed_version) !== null || MERGE_MARKER.test(String(row.canonical_name ?? ''));

/**
 * Resolve each dead id to its FINAL surviving entity by walking the merge chain (X→A, A→B ⇒ X→B).
 * A consumer holding a dead id needs the entity that actually carries the evidence today, not an
 * intermediate that was itself merged onward.
 *
 * @param edges  Map(deadId → immediateSurvivorId)
 * @param liveIds Set of ids known to exist and be live — the only valid chain terminus.
 * @returns Map(deadId → finalSurvivorId | null). null = cycle, or the chain ends somewhere not live.
 */
export function resolveMergeChain(edges, liveIds = new Set()) {
  const out = new Map();
  for (const start of edges.keys()) {
    const seen = new Set([start]);
    let cur = edges.get(start);
    let resolved = null;
    while (cur != null) {
      if (seen.has(cur)) { resolved = null; break; }       // cycle — unresolvable, report it
      seen.add(cur);
      if (liveIds.has(cur)) { resolved = cur; break; }
      if (!edges.has(cur)) { resolved = null; break; }     // chain ends on a row that is neither live nor merged
      cur = edges.get(cur);
    }
    out.set(start, resolved);
  }
  return out;
}
