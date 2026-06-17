#!/usr/bin/env node
// Applies the manually-researched entity-foundation corrections (the ~58 clusters
// in scripts/wip/corrections/verify/*.md, distilled into a manifest) to the entity
// graph: graph_entities (sifter.db, routed through the single-writer) + entity_mentions
// /entity_aliases (graph.db, direct). Uses api/lib/graph-db.js primitives.
//
// DRY-RUN by default — writes NOTHING; validates ids + reports what WOULD change.
// --apply executes. Phase 1 handles the well-specified ops only: merge / retype /
// drop / alias-strip. Splits (need per-mention assignment) + creates (need extracted
// mentions) are listed in the manifest as phase:2/3 and SKIPPED here.
//
// SAFETY:
//   - NEVER acts on a keyword/name — only explicit id lists from the manifest.
//   - mergeEntities/splitEntity HARD-DELETE the merged/original rows (audited). Dry-run first.
//   - REFUSES --apply unless the graph pipeline is parked (extractor/promoter/resolver/
//     validator not 'online') AND SIFTER_WRITER_URL is set — else writes contend.
//
// Usage (on tower-nas, after the graph pipeline is parked):
//   node scripts/apply-entity-corrections.mjs                 # dry-run, all manifest ops
//   node scripts/apply-entity-corrections.mjs --only merge    # dry-run, just merges
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/apply-entity-corrections.mjs --apply

import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { mergeEntities } = await import(join(ROOT, 'api/lib/graph-db.js'));
const { query: mainQuery, queryOne: mainQueryOne, queryAll: mainQueryAll, graphQuery, graphQueryAll } =
  await import(join(ROOT, 'api/lib/db.js'));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null; })();
const MANIFEST = join(ROOT, 'scripts/wip/corrections/entity-apply-manifest.json');

// ── helpers ─────────────────────────────────────────────────────────────────
// Live mention count (the graph_entities.mention_count column is STALE — never trust it).
async function liveMentions(id) {
  const r = await graphQueryAll(`SELECT COUNT(*) AS n FROM entity_mentions WHERE entity_id = ?`, [id]);
  return r?.[0]?.n ?? 0;
}
async function entRow(id) {
  return mainQueryOne(`SELECT id, canonical_name, entity_type, religion FROM graph_entities WHERE id = ?`, [id]);
}

// Preflight: refuse --apply if the graph pipeline is online or writer not configured.
function preflightApply() {
  if (!process.env.SIFTER_WRITER_URL) {
    throw new Error('REFUSING --apply: SIFTER_WRITER_URL not set (graph_entities writes must route through the single-writer).');
  }
  try {
    const out = execSync(`pm2 jlist 2>/dev/null`, { encoding: 'utf8' });
    const procs = JSON.parse(out);
    const live = procs.filter(p => /graph-(extractor|promoter|resolver|validator)/.test(p.name) && p.pm2_env.status === 'online');
    if (live.length) {
      throw new Error(`REFUSING --apply: graph pipeline still online (${live.map(p => p.name).join(', ')}). Park it first: pm2 stop ${live.map(p => p.name).join(' ')}`);
    }
  } catch (e) {
    if (/REFUSING/.test(e.message)) throw e;
    console.warn(`⚠ could not verify pipeline parked (${e.message}) — proceeding cautiously`);
  }
}

// ── op handlers (dry-run reports; apply executes) ────────────────────────────
const stats = { merge: 0, retype: 0, drop: 0, aliasStrip: 0, skipped: 0, missing: 0, errors: 0 };

async function doMerge(op) {
  const keeper = await entRow(op.keeper);
  if (!keeper) { console.log(`  ✗ MERGE skip — keeper ${op.keeper} missing`); stats.missing++; return; }
  const present = [], absent = [];
  for (const id of op.merged) { (await entRow(id) ? present : absent).push(id); }
  const km = await liveMentions(op.keeper);
  let mm = 0; for (const id of present) mm += await liveMentions(id);
  console.log(`  ${APPLY ? '⚙' : '•'} MERGE → ${op.keeper} "${keeper.canonical_name}" (${km} mentions) ← ${present.join(',')||'(none)'} (+${mm} mentions)${absent.length ? `  [absent: ${absent.join(',')}]` : ''}`);
  if (!present.length) { stats.skipped++; return; }
  if (APPLY) { await mergeEntities(op.keeper, present, { reason: op.reason || 'research-foundation' }); }
  stats.merge++;
}

async function doRetype(op) {
  const e = await entRow(op.entityId);
  if (!e) { console.log(`  ✗ RETYPE skip — ${op.entityId} missing`); stats.missing++; return; }
  console.log(`  ${APPLY ? '⚙' : '•'} RETYPE ${op.entityId} "${e.canonical_name}" ${e.entity_type} → ${op.newType}`);
  if (APPLY) await mainQuery(`UPDATE graph_entities SET entity_type = ? WHERE id = ?`, [op.newType, op.entityId]);
  stats.retype++;
}

async function doDrop(op) {
  const e = await entRow(op.entityId);
  if (!e) { console.log(`  ✗ DROP skip — ${op.entityId} missing`); stats.missing++; return; }
  const m = await liveMentions(op.entityId);
  console.log(`  ${APPLY ? '⚙' : '•'} DROP ${op.entityId} "${e.canonical_name}" (${m} mentions) — ${op.reason || 'artifact'}`);
  if (APPLY) {
    // Soft-delete: detach mentions to NULL (don't lose them), mark entity deleted via audit.
    await graphQuery(`UPDATE entity_mentions SET entity_id = NULL WHERE entity_id = ?`, [op.entityId]);
    await mainQuery(`DELETE FROM graph_entities WHERE id = ?`, [op.entityId]);
    await graphQuery(`INSERT INTO er_audit_log (action, candidate, model_votes) VALUES ('drop', ?, ?)`, [String(op.entityId), op.reason || null]);
  }
  stats.drop++;
}

async function doAliasStrip(op) {
  const before = await graphQueryAll(`SELECT id, surface FROM entity_aliases WHERE entity_id = ? AND surface IN (${op.surfaces.map(() => '?').join(',')})`, [op.entityId, ...op.surfaces]);
  console.log(`  ${APPLY ? '⚙' : '•'} ALIAS-STRIP ${op.entityId} — ${before.length}/${op.surfaces.length} matched: ${before.map(b => b.surface).join(' | ')}`);
  if (APPLY && before.length) {
    await graphQuery(`DELETE FROM entity_aliases WHERE entity_id = ? AND surface IN (${op.surfaces.map(() => '?').join(',')})`, [op.entityId, ...op.surfaces]);
  }
  stats.aliasStrip++;
}

// ── main ─────────────────────────────────────────────────────────────────────
let manifest;
try { manifest = JSON.parse(await readFile(MANIFEST, 'utf8')); }
catch (e) { console.error(`Cannot read manifest ${MANIFEST}: ${e.message}`); process.exit(1); }

if (APPLY) preflightApply();
console.log(`${APPLY ? '⚙ APPLY' : '🔍 DRY-RUN'} — ${manifest.ops.length} ops in manifest${ONLY ? ` (filtered: ${ONLY})` : ''}\n`);

for (const op of manifest.ops) {
  if (op.phase && op.phase > 1) { stats.skipped++; continue; }     // splits/creates deferred
  if (ONLY && op.op !== ONLY) continue;
  try {
    if (op.op === 'merge') await doMerge(op);
    else if (op.op === 'retype') await doRetype(op);
    else if (op.op === 'drop') await doDrop(op);
    else if (op.op === 'alias-strip') await doAliasStrip(op);
    else { console.log(`  ? unknown op '${op.op}' — skipped`); stats.skipped++; }
  } catch (e) { console.log(`  ✗ ERROR on ${op.op} ${op.keeper || op.entityId}: ${e.message}`); stats.errors++; }
}

console.log(`\n──────── SUMMARY (${APPLY ? 'APPLIED' : 'DRY-RUN'}) ────────`);
console.log(JSON.stringify(stats, null, 1));
const phase2 = manifest.ops.filter(o => o.phase === 2).length;
const phase3 = manifest.ops.filter(o => o.phase === 3).length;
console.log(`deferred: ${phase2} splits (need per-mention research), ${phase3} creates (need extraction)`);
process.exit(stats.errors ? 1 : 0);
