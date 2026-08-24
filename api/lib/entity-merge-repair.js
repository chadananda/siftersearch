// One-shot repair for the merge-tombstone divergence found 2026-08-24 (see entity-live.js header).
//
// Merged duplicates were marked by appending ' ⟨merged→N⟩' to canonical_name — a form no API reader checked —
// so 6,668 hollow rows were served as live entities. This rewrites them into the canonical tombstone
// (`last_assessed_version='merged-into-<finalSurvivor>'`) and restores the original name.
//
// Two properties that make it safe to re-run:
//   • IDEMPOTENT — a row already carrying the right tombstone and a clean name produces no statement.
//   • CHAIN-RESOLVED — X merged into A, A later merged into B ⇒ X is tombstoned to B, the entity that
//     actually holds the evidence today. 149 rows carry markers naming different survivors.
// Anything that cannot be resolved (cycle, or a chain ending on a row that is not live) is REPORTED, never
// guessed at. Writes go through db.js in small chunks so the single writer is never held for long.
// Deps: db.js, entity-live.js.
import { queryAll, transaction } from './db.js';
import { stripMergeMarkers, mergeTargets, tombstoneFor, tombstoneTarget, MERGE_MARKER, LIVE_SQL } from './entity-live.js';
import { resolveMergeChain } from './entity-live.js';
import { logger } from './logger.js';

/**
 * Build the repair plan without writing anything.
 * @returns {{ repairs: Array, unresolved: Array, stats: object }}
 */
export async function planMergeRepair(deps = {}) {
  const qAll = deps.queryAll || queryAll;

  // Every row, because chain resolution needs to know which ids are live.
  const rows = await qAll(
    `SELECT id, canonical_name, entity_type, religion, last_assessed_version FROM graph_entities`);

  const marked = [];
  const liveIds = new Set();
  const edges = new Map();

  for (const r of rows) {
    const name = String(r.canonical_name ?? '');
    const hasMarker = MERGE_MARKER.test(name);
    const tomb = tombstoneTarget(r.last_assessed_version);
    if (!hasMarker && tomb === null) { liveIds.add(r.id); continue; }

    // Immediate survivor: an existing tombstone is authoritative; otherwise the LAST marker, which is the
    // most recent merge decision applied to this row.
    const targets = mergeTargets(name);
    const immediate = tomb ?? (targets.length ? targets[targets.length - 1] : null);
    if (immediate != null) edges.set(r.id, immediate);
    marked.push({ ...r, name, targets, immediate, hasMarker, tomb });
  }

  const resolved = resolveMergeChain(edges, liveIds);

  const repairs = [];
  const unresolved = [];
  for (const m of marked) {
    const finalId = resolved.get(m.id) ?? null;
    if (finalId == null) {
      unresolved.push({ id: m.id, name: m.name, targets: m.targets, tombstone: m.last_assessed_version,
        reason: m.immediate == null ? 'no survivor recorded' : 'chain cycles or ends on a non-live row' });
      continue;
    }
    const cleanName = stripMergeMarkers(m.name);
    const wantLav = tombstoneFor(finalId);
    // Idempotent: nothing to do when the row already reads correctly.
    if (m.last_assessed_version === wantLav && cleanName === m.name) continue;
    repairs.push({ id: m.id, from: { name: m.name, lav: m.last_assessed_version },
      to: { name: cleanName, lav: wantLav }, redirectedTo: finalId, chained: m.immediate !== finalId });
  }

  return {
    repairs,
    unresolved,
    stats: {
      totalRows: rows.length,
      liveBefore: liveIds.size,
      marked: marked.length,
      markerOnly: marked.filter((m) => m.hasMarker && m.tomb === null).length,
      tombstoneOnly: marked.filter((m) => !m.hasMarker && m.tomb !== null).length,
      both: marked.filter((m) => m.hasMarker && m.tomb !== null).length,
      chainResolved: repairs.filter((r) => r.chained).length,
      toRepair: repairs.length,
      unresolved: unresolved.length,
    },
  };
}

/**
 * Apply the plan. dryRun (the default) reports exactly what would change and writes nothing.
 */
export async function repairMergeTombstones({ dryRun = true, chunkSize = 200, deps = {} } = {}) {
  const plan = await planMergeRepair(deps);
  const tx = deps.transaction || transaction;

  if (dryRun) return { dryRun: true, applied: 0, failedChunks: [], ...plan, sample: plan.repairs.slice(0, 5) };

  let applied = 0;
  const failedChunks = [];
  for (let i = 0; i < plan.repairs.length; i += chunkSize) {
    const chunk = plan.repairs.slice(i, i + chunkSize);
    const statements = chunk.map((r) => ({
      sql: `UPDATE graph_entities SET last_assessed_version=?, canonical_name=? WHERE id=?`,
      args: [r.to.lav, r.to.name, r.id],
    }));
    try {
      await tx(statements, 'entity-merge-repair');
      applied += chunk.length;
    } catch (err) {
      // A chunk failure must not be silent — it means rows are still being served wrong.
      failedChunks.push({ offset: i, size: chunk.length, error: String(err?.message || err) });
      logger.error({ err, offset: i, size: chunk.length }, 'entity-merge-repair chunk failed');
    }
  }

  logger.info({ applied, failed: failedChunks.length, unresolved: plan.unresolved.length },
    'entity-merge-repair complete');
  return { dryRun: false, applied, failedChunks, ...plan, sample: plan.repairs.slice(0, 5) };
}

/**
 * DETECTOR — the check that would have caught this on day one. Counts rows where the two historical
 * definitions of "merged" disagree. Consumed by scripts/system-checks.mjs and the audit runner.
 */
export async function mergeTombstoneDivergence(deps = {}) {
  const qAll = deps.queryAll || queryAll;
  const [row] = await qAll(
    `SELECT
       SUM(canonical_name LIKE '%⟨merged→%'
           AND (last_assessed_version IS NULL OR last_assessed_version NOT LIKE 'merged-into-%')) AS servedButMerged,
       SUM(canonical_name LIKE '%⟨merged→%') AS anyMarker
     FROM graph_entities`);
  const servedButMerged = Number(row?.servedButMerged || 0);
  return {
    ok: servedButMerged === 0,
    servedButMerged,
    anyMarker: Number(row?.anyMarker || 0),
    detail: servedButMerged === 0
      ? 'no merged entity is being served as live'
      : `${servedButMerged} merged entities are being served as LIVE (marker in canonical_name, no tombstone) — run POST /api/admin/entities/repair-merge-tombstones`,
  };
}

/**
 * DETECTOR — natural-key uniqueness among LIVE entities. `(canonical_name, entity_type, religion)` is the
 * durable identity external consumers re-resolve against when ids renumber, so a collision silently breaks
 * their mapping. The table's UNIQUE constraint does NOT guarantee this: 16,318 rows have religion NULL and
 * SQLite compares NULLs distinct, so the constraint never fires for them.
 */
export async function naturalKeyCollisions(deps = {}) {
  const qAll = deps.queryAll || queryAll;
  const rows = await qAll(
    `SELECT canonical_name, entity_type, COALESCE(religion,'') rel, COUNT(*) n, GROUP_CONCAT(id) ids
       FROM graph_entities
      WHERE ${LIVE_SQL()}
      GROUP BY canonical_name, entity_type, COALESCE(religion,'')
     HAVING n > 1
      ORDER BY n DESC LIMIT 50`);
  const collisions = rows.length;
  return {
    ok: collisions === 0,
    collisions,
    rowsInvolved: rows.reduce((s, r) => s + r.n, 0),
    sample: rows.slice(0, 5).map((r) => ({ name: r.canonical_name, type: r.entity_type, count: r.n, ids: r.ids })),
    detail: collisions === 0
      ? 'every live entity has a unique natural key'
      : `${collisions} natural keys map to more than one LIVE entity — external id re-resolution is ambiguous for these`,
  };
}
