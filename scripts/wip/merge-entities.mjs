#!/usr/bin/env node
// Merge duplicate entities (subscription/Claude Code; reviewed plan: merge-plan.md).
// SAME-NAME: auto-find groups with same (normalized canonical_name, entity_type), keeper =
//   the row with the MOST mentions (= most-used), merge the rest in. Excludes HOLD names
//   (bare-name namesake buckets + mistyped titles — left for Step-3 re-resolution).
// CROSS-NAME: explicit list — add the rare name as an ALIAS on the keeper, then merge
//   (keeper = the most-used name per the doctrine; rare title/alias is preserved, not canonical).
// mergeEntities HARD-DELETES merged rows (repoints aliases/mentions/relations first). Back up first.
//   node scripts/wip/merge-entities.mjs            # dry-run
//   node scripts/wip/merge-entities.mjs --apply
// Requires SIFTER_WRITER_URL (graph_entities/relations route through the single-writer).

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { queryAll, graphQueryAll } = await import(join(ROOT, 'api/lib/db.js'));
const { mergeEntities, addAlias, normalizeSurface } = await import(join(ROOT, 'api/lib/graph-db.js'));

const APPLY = process.argv.includes('--apply');

// Bare-name namesake buckets (resolve by context in Step 3) + titles mistyped as persons.
const HOLD_NORM = new Set(['ahmad', 'siyyid muhammad', 'mirza mihdi', 'mufti', 'mujtahid']);
// Cross-name: keeper (most-used name) ← merged (rare name preserved as alias).
const CROSS = [
  { keeper: 1219258, merged: 613854,  name: 'Báb' },                    // → the Báb
  { keeper: 1219861, merged: 638223,  name: 'Siyyid Yaḥyáy-i-Dárábí' }, // → Vaḥíd
  { keeper: 614731,  merged: 1219728, name: 'Center of the Covenant' }, // → 'Abdu'l-Bahá
  { keeper: 614482,  merged: 614485,  name: 'Christ' },                 // → Jesus
];

// mention counts per entity (graph.db)
const mc = new Map();
for (const r of await graphQueryAll(`SELECT entity_id, COUNT(*) c FROM entity_mentions GROUP BY entity_id`)) mc.set(Number(r.entity_id), r.c);
const M = (id) => mc.get(Number(id)) || 0;

// dup groups
const ents = await queryAll(`SELECT id, canonical_name, entity_type FROM graph_entities`);
const groups = new Map();
for (const e of ents) {
  const k = normalizeSurface(e.canonical_name) + '||' + e.entity_type;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

const sameMerges = []; // {keeper, merged[], name, type}
let held = 0;
for (const [k, members] of groups) {
  if (members.length < 2) continue;
  const norm = k.split('||')[0];
  if (HOLD_NORM.has(norm)) { held++; continue; }
  const sorted = members.slice().sort((a, b) => M(b.id) - M(a.id)); // most-used first
  const keeper = sorted[0];
  sameMerges.push({ keeper: keeper.id, name: keeper.canonical_name, type: keeper.entity_type, merged: sorted.slice(1).map(e => e.id) });
}

console.log(`SAME-NAME groups to merge: ${sameMerges.length} (held namesake/mistyped: ${held})`);
for (const g of sameMerges) console.log(`  keep #${g.keeper} "${g.name}" [${g.type}] (${M(g.keeper)}m) ← ${g.merged.map(id => `#${id}(${M(id)}m)`).join(', ')}`);
console.log(`\nCROSS-NAME merges: ${CROSS.length}`);
for (const c of CROSS) console.log(`  keep #${c.keeper}(${M(c.keeper)}m) ← #${c.merged}(${M(c.merged)}m) "${c.name}" (→ alias)`);

if (!APPLY) { console.log('\nDRY-RUN — re-run with --apply'); process.exit(0); }

let merged = 0, aliased = 0;
// 1. same-name
for (const g of sameMerges) {
  await mergeEntities(g.keeper, g.merged, { reason: 'same-name+type duplicate (religion/case variant); keeper=most-mentioned', evidence: 'merge-plan.md §A' });
  merged += g.merged.length;
}
// 2. cross-name (alias then merge), only if both still exist
const live = new Set((await queryAll(`SELECT id FROM graph_entities`)).map(r => Number(r.id)));
for (const c of CROSS) {
  if (!live.has(Number(c.keeper)) || !live.has(Number(c.merged))) { console.log(`  ⚠ skip cross #${c.keeper}←#${c.merged} (missing)`); continue; }
  await addAlias(c.keeper, { surface: c.name, source: 'merge-crossname', confidence: 0.95 }); aliased++;
  await mergeEntities(c.keeper, [c.merged], { reason: 'cross-name: same person/place under a less-used name (preserved as alias)', evidence: 'merge-plan.md §C' });
  merged += 1;
}
console.log(`\n⚙ APPLIED: ${merged} entities merged, ${aliased} cross-name aliases added.`);
process.exit(0);
