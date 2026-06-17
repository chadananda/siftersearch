#!/usr/bin/env node
// Purge the entity graph down to ONLY the two authorized books — God Passes By
// (21310) + The Dawn-Breakers (21308). Everything else was extracted by the
// runaway pipeline without permission (555 docs incl. a Dizzy Gillespie jazz bio)
// and must go. ARCHIVES everything first (nothing is hard-deleted without a snapshot).
//
// Keeps:   entity_mentions whose content is in 21308/21310, and the graph_entities
//          they reference (cross-corpus pillars keep ONLY their two-book mentions).
// Deletes: out-of-scope entity_mentions + entity_aliases + the graph_entities that
//          have NO in-scope mention + their graph_relations.
//
// DRY-RUN by default (writes nothing). --apply archives then deletes.
// SAFETY: refuses --apply unless the graph pipeline is parked + SIFTER_WRITER_URL set.
//   graph_entities/graph_relations route through the single-writer (mainQuery);
//   entity_mentions/entity_aliases are direct to graph.db (graphQuery) — safe now
//   that the pipeline is stopped.
//
// Usage (on tower-nas):
//   node scripts/purge-out-of-scope-entities.mjs                # dry-run
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 node scripts/purge-out-of-scope-entities.mjs --apply

import dotenv from 'dotenv';
import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { query: mainQuery, queryAll: mainQueryAll, graphQuery, graphQueryAll } = await import(join(ROOT, 'api/lib/db.js'));

const APPLY = process.argv.includes('--apply');
const KEEP_DOCS = [21308, 21310];
const BACKUP_ROOT = process.env.BACKUP_DIR || '/tank/backups/siftersearch';
const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

function preflight() {
  if (!process.env.SIFTER_WRITER_URL) throw new Error('REFUSING --apply: SIFTER_WRITER_URL not set (graph_entities deletes must route through the single-writer).');
  const procs = JSON.parse(execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' }));
  const live = procs.filter(p => /graph-(extractor|promoter|resolver|validator)/.test(p.name) && p.pm2_env.status === 'online');
  if (live.length) throw new Error(`REFUSING --apply: graph pipeline still online (${live.map(p => p.name).join(', ')}). Park it first.`);
}

// ── compute the in-scope / out-of-scope sets ─────────────────────────────────
console.log('Computing scope sets…');
const inScopeContent = new Set(
  (await mainQueryAll(`SELECT id FROM content WHERE doc_id IN (${KEEP_DOCS.join(',')})`)).map(r => String(r.id))
);
const allMentions = await graphQueryAll(`SELECT id, entity_id, content_id FROM entity_mentions`);
const inScopeEntityIds = new Set();
const outScopeMentionIds = [];
for (const m of allMentions) {
  if (inScopeContent.has(String(m.content_id))) inScopeEntityIds.add(m.entity_id);
  else outScopeMentionIds.push(m.id);
}
const allEntityIds = new Set(allMentions.map(m => m.entity_id));
const deleteEntityIds = [...allEntityIds].filter(id => !inScopeEntityIds.has(id));   // have only out-of-scope mentions

console.log(`\n──────── SCOPE ────────`);
console.log(`KEEP  : ${inScopeEntityIds.size} entities, ${allMentions.length - outScopeMentionIds.length} mentions (the 2 books)`);
console.log(`DELETE: ${deleteEntityIds.length} entities, ${outScopeMentionIds.length} out-of-scope mentions`);
console.log(`(cross-corpus pillars survive, keeping only their two-book mentions)`);

// sample of what's being deleted (so the user sees it's really garbage)
if (deleteEntityIds.length) {
  const sample = await mainQueryAll(`SELECT id, canonical_name, entity_type FROM graph_entities WHERE id IN (${deleteEntityIds.slice(0, 15).join(',')})`);
  console.log(`\nsample of entities to delete:`);
  for (const s of sample) console.log(`   ${s.id}  [${s.entity_type}]  ${s.canonical_name}`);
}

if (!APPLY) { console.log(`\n🔍 DRY-RUN — nothing deleted. Re-run with --apply (writer set) to archive + purge.`); process.exit(0); }

// ── APPLY ─────────────────────────────────────────────────────────────────────
preflight();
const ts = execSync('date -u +%Y%m%dT%H%M%SZ', { encoding: 'utf8' }).trim();
const dir = `${BACKUP_ROOT}/entity-purge-${ts}`;

console.log(`\n=== 1. ARCHIVE → ${dir} ===`);
await mkdir(dir, { recursive: true });
execSync(`sqlite3 ${join(ROOT, 'data/graph.db')} ".backup '${dir}/graph.db'"`);   // full graph.db (all mentions + aliases)
console.log(`   ✓ graph.db backed up (all entity_mentions + entity_aliases)`);
// dump the out-of-scope graph_entities + their relations from sifter.db
const delEnts = [];
for (const c of chunks(deleteEntityIds, 800)) delEnts.push(...await mainQueryAll(`SELECT * FROM graph_entities WHERE id IN (${c.join(',')})`));
const delRels = [];
for (const c of chunks(deleteEntityIds, 800)) delRels.push(...await mainQueryAll(`SELECT * FROM graph_relations WHERE source_entity_id IN (${c.join(',')}) OR target_entity_id IN (${c.join(',')})`));
await writeFile(`${dir}/out-of-scope-graph_entities.json`, JSON.stringify(delEnts));
await writeFile(`${dir}/out-of-scope-graph_relations.json`, JSON.stringify(delRels));
await writeFile(`${dir}/MANIFEST.json`, JSON.stringify({ ts, keepDocs: KEEP_DOCS, deletedEntities: deleteEntityIds.length, deletedMentions: outScopeMentionIds.length, deletedRelations: delRels.length, deleteEntityIds }, null, 1));
console.log(`   ✓ dumped ${delEnts.length} graph_entities + ${delRels.length} graph_relations + MANIFEST`);

console.log(`\n=== 2. DELETE ===`);
let n = 0;
for (const c of chunks(outScopeMentionIds, 500)) { await graphQuery(`DELETE FROM entity_mentions WHERE id IN (${c.map(() => '?').join(',')})`, c); n += c.length; }
console.log(`   ✓ ${n} out-of-scope entity_mentions deleted (graph.db)`);
let a = 0;
for (const c of chunks(deleteEntityIds, 500)) { const r = await graphQuery(`DELETE FROM entity_aliases WHERE entity_id IN (${c.map(() => '?').join(',')})`, c); a += r?.changes || 0; }
console.log(`   ✓ entity_aliases for deleted entities removed (graph.db)`);
for (const c of chunks(deleteEntityIds, 500)) await mainQuery(`DELETE FROM graph_relations WHERE source_entity_id IN (${c.map(() => '?').join(',')}) OR target_entity_id IN (${c.map(() => '?').join(',')})`, [...c, ...c]);
console.log(`   ✓ ${delRels.length} graph_relations removed (sifter.db via writer)`);
for (const c of chunks(deleteEntityIds, 500)) await mainQuery(`DELETE FROM graph_entities WHERE id IN (${c.map(() => '?').join(',')})`, c);
console.log(`   ✓ ${deleteEntityIds.length} out-of-scope graph_entities removed (sifter.db via writer)`);

console.log(`\n=== 3. VERIFY ===`);
const remMentions = (await graphQueryAll(`SELECT COUNT(*) AS n FROM entity_mentions`))[0].n;
const remEntities = (await graphQueryAll(`SELECT COUNT(DISTINCT entity_id) AS n FROM entity_mentions`))[0].n;
console.log(`   entity_mentions remaining: ${remMentions} (expect ~${allMentions.length - outScopeMentionIds.length})`);
console.log(`   entities with mentions remaining: ${remEntities} (expect ~${inScopeEntityIds.size})`);
console.log(`\n✅ Purged to the two books. Archive at ${dir}`);
process.exit(0);
