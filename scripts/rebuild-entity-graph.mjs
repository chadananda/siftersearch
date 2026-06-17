#!/usr/bin/env node
// Rebuild the entity GRAPH (NOT content) down to the two authorized books — GPB (21310)
// + Dawn-Breakers (21308). Removes the 2026-04-05 whole-corpus auto-NER bloat (~621K
// orphan graph_entities, ~2.9M relations) + the migration-72 stale-duplicate tables.
//
// CONTENT IS NEVER TOUCHED — only the entity-graph tables. `content` (text + embeddings)
// and `docs` are read-only here.
//
// Uses a DIRECT better-sqlite3 connection (NOT the HTTP single-writer — which timed out on
// big deletes) with foreign_keys=OFF (so the FK web among the tables doesn't block). Because
// it writes directly, the single-writer + pipeline MUST be parked (it becomes the sole writer).
//
// DRY-RUN by default — reports per-table keep/drop counts, writes nothing.
// --apply : backup both DBs → delete non-keepers → VACUUM → verify.
//
// Usage (on tower-nas, with siftersearch-worker + graph workers STOPPED):
//   node scripts/rebuild-entity-graph.mjs            # dry-run
//   node scripts/rebuild-entity-graph.mjs --apply

import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';

const APPLY = process.argv.includes('--apply');
const KEEP_DOCS = [21308, 21310];
const SIFTER = 'data/sifter.db';
const GRAPH = 'data/graph.db';
const BACKUP_ROOT = process.env.BACKUP_DIR || '/tank/backups/siftersearch';

// Tables keyed by graph_entities id — delete a row if ANY listed column points outside the keeper set.
// (Aliases = name-forms of an entity, not a per-book extraction → keeper-entity-scoped. Relations
//  among keeper entities are kept. quote_clusters/significance/bridge are entity-scoped but ~empty.)
const ENTITY_KEYED = {
  graph_relations: ['source_entity_id', 'target_entity_id'],
  entity_aliases: ['entity_id'],
  set_members: ['entity_id'],
  quote_clusters: ['speaker_entity_id'],
  significance_markers: ['subject_entity_id'],
  pending_bridge_relations: ['subject_entity_id', 'target_entity_id'],
};
// Tables keyed by content_id (a paragraph) — keep ONLY rows for the two books' paragraphs.
// A mention/quote is an EXTRACTION from a specific book; we must not keep extractions from
// other books (even of a keeper entity like Bahá'u'lláh in Taherzadeh) — those get extracted
// later when those books are authorized. Research records (verify/*.md) may still cite them.
const CONTENT_KEYED = { entity_mentions: 'content_id', quote_instances: 'content_id', paragraph_roles: 'content_id' };

function preflightApply() {
  const procs = JSON.parse(execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' }));
  const live = procs.filter(p => /graph-(extractor|promoter|resolver|validator)|siftersearch-worker$/.test(p.name) && p.pm2_env.status === 'online');
  if (live.length) throw new Error(`REFUSING --apply: these must be STOPPED first (sole-writer requirement): ${live.map(p => p.name).join(', ')}`);
}

const db = new Database(SIFTER);            // direct connection (sole writer when worker parked)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');
db.exec(`ATTACH '${GRAPH}' AS g`);

const tableExists = (t) => !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t);
const hasCol = (t, c) => db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name=?`).get(t, c);
const count = (sql, p = []) => db.prepare(sql).get(...p).n;

// keeper sets (the two books)
db.exec(`CREATE TEMP TABLE keeper AS SELECT DISTINCT entity_id AS id FROM g.entity_mentions`);
db.exec(`CREATE TEMP TABLE keepcontent AS SELECT id FROM content WHERE doc_id IN (${KEEP_DOCS.join(',')})`);
const keeperN = count(`SELECT COUNT(*) n FROM keeper`);
console.log(`${APPLY ? '⚙ APPLY' : '🔍 DRY-RUN'} — keeper set: ${keeperN} two-books entities\n`);

if (APPLY) {
  preflightApply();
  const ts = execSync('date -u +%Y%m%dT%H%M%SZ', { encoding: 'utf8' }).trim();
  const dir = `${BACKUP_ROOT}/entity-rebuild-${ts}`;
  mkdirSync(dir, { recursive: true });
  execSync(`sqlite3 ${SIFTER} ".backup '${dir}/sifter.db'"`);
  execSync(`sqlite3 ${GRAPH} ".backup '${dir}/graph.db'"`);
  console.log(`✓ backed up sifter.db + graph.db → ${dir}\n`);
}

const plan = [];
for (const [t, cols] of Object.entries(ENTITY_KEYED)) {
  if (!tableExists(t)) continue;
  const live = cols.filter(c => hasCol(t, c));
  if (!live.length) continue;
  const where = live.map(c => `(${c} IS NOT NULL AND ${c} NOT IN (SELECT id FROM keeper))`).join(' OR ');
  plan.push({ t, total: count(`SELECT COUNT(*) n FROM ${t}`), drop: count(`SELECT COUNT(*) n FROM ${t} WHERE ${where}`), where });
}
for (const [t, col] of Object.entries(CONTENT_KEYED)) {
  if (!tableExists(t) || !hasCol(t, col)) continue;
  const where = `CAST(${col} AS INTEGER) NOT IN (SELECT id FROM keepcontent)`;
  plan.push({ t, total: count(`SELECT COUNT(*) n FROM ${t}`), drop: count(`SELECT COUNT(*) n FROM ${t} WHERE ${where}`), where });
}
// graph_entities last (everything referencing it cleaned first)
plan.push({ t: 'graph_entities', total: count(`SELECT COUNT(*) n FROM graph_entities`), drop: count(`SELECT COUNT(*) n FROM graph_entities WHERE id NOT IN (SELECT id FROM keeper)`), where: `id NOT IN (SELECT id FROM keeper)` });

console.log('table                       total        drop        keep');
for (const p of plan) console.log(`  ${p.t.padEnd(24)} ${String(p.total).padStart(9)} ${String(p.drop).padStart(11)} ${String(p.total - p.drop).padStart(11)}`);

if (!APPLY) { console.log(`\n🔍 DRY-RUN — nothing changed. Re-run --apply (worker parked) to execute.`); process.exit(0); }

console.log(`\n=== DELETING (foreign_keys OFF, single txn) ===`);
const run = db.transaction(() => {
  for (const p of plan) {
    const r = db.prepare(`DELETE FROM ${p.t} WHERE ${p.where}`).run();
    console.log(`  ✓ ${p.t}: deleted ${r.changes} (kept ${p.total - r.changes})`);
  }
});
run();
console.log(`\n=== VACUUM ===`);
try { db.exec('VACUUM'); console.log('  ✓ vacuumed sifter.db'); } catch (e) { console.log('  ⚠ vacuum sifter.db: ' + e.message); }
try { db.exec(`VACUUM g`); console.log('  ✓ vacuumed graph.db'); } catch (e) { console.log('  ⚠ vacuum graph.db: ' + e.message); }

console.log(`\n=== VERIFY ===`);
console.log(`graph_entities now: ${count(`SELECT COUNT(*) n FROM graph_entities`)} (expect ${keeperN})`);
console.log(`graph_relations now: ${count(`SELECT COUNT(*) n FROM graph_relations`)}`);
console.log(`✅ entity graph rebuilt to the two books. Content + docs untouched.`);
db.close();
process.exit(0);
