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

/**
 * Break merge CYCLES — rows that were merged into each other (A→B, B→A), so no chain can terminate.
 * 53 such rows survived the 2026-08-24 repair. Left alone they stay served as live phantoms forever.
 *
 * The rule is evidence, not id order: within each cycle the member holding the most claims+mentions is
 * the survivor (applyMerge repointed evidence onto exactly one of them), ties broken by lowest id for
 * determinism. The survivor is restored to a live entity; every other member tombstones to it.
 *
 * Reported, never silent: the chosen survivor and the evidence counts that chose it are returned.
 */
export async function breakMergeCycles({ dryRun = true, deps = {} } = {}) {
  const qAll = deps.queryAll || queryAll;
  const tx = deps.transaction || transaction;
  const { unresolved } = await planMergeRepair(deps);
  if (!unresolved.length) return { dryRun, cycles: [], applied: 0, detail: 'no merge cycles remain' };

  const ids = unresolved.map((u) => u.id);
  const ph = ids.map(() => '?').join(',');
  const rows = await qAll(
    `SELECT ge.id, ge.canonical_name, ge.last_assessed_version,
            (SELECT COUNT(*) FROM entity_claims c WHERE c.entity_id=ge.id) claims,
            (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id=ge.id) mentions
       FROM graph_entities ge WHERE ge.id IN (${ph})`, ids);
  const info = new Map(rows.map((r) => [r.id, r]));

  // Connected components over the merge edges (undirected — a cycle is mutual by definition).
  const adj = new Map(ids.map((i) => [i, new Set()]));
  for (const u of unresolved) {
    for (const t of u.targets) {
      if (!adj.has(u.id)) adj.set(u.id, new Set());
      adj.get(u.id).add(t);
      if (adj.has(t)) adj.get(t).add(u.id);
    }
  }
  const seen = new Set();
  const components = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id], comp = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      for (const nb of (adj.get(cur) || [])) if (adj.has(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    components.push(comp);
  }

  const cycles = [];
  const statements = [];
  for (const comp of components) {
    const scored = comp.map((i) => {
      const r = info.get(i) || {};
      return { id: i, claims: r.claims || 0, mentions: r.mentions || 0,
        evidence: (r.claims || 0) + (r.mentions || 0), name: stripMergeMarkers(r.canonical_name || '') };
    }).sort((a, b) => b.evidence - a.evidence || a.id - b.id);
    const survivor = scored[0];
    cycles.push({ members: scored, survivor: survivor.id, survivorEvidence: survivor.evidence,
      allEmpty: survivor.evidence === 0 });
    // Survivor becomes a live entity again: markers stripped, no tombstone.
    statements.push({ sql: `UPDATE graph_entities SET canonical_name=?, last_assessed_version=NULL WHERE id=?`,
      args: [survivor.name, survivor.id] });
    for (const m of scored.slice(1)) {
      statements.push({ sql: `UPDATE graph_entities SET canonical_name=?, last_assessed_version=? WHERE id=?`,
        args: [m.name, tombstoneFor(survivor.id), m.id] });
    }
  }

  if (dryRun) return { dryRun: true, cycles, applied: 0, statements: statements.length };
  await tx(statements, 'entity-merge-cycle-break');
  logger.info({ cycles: cycles.length, rows: statements.length }, 'merge cycles broken');
  return { dryRun: false, cycles, applied: statements.length };
}
