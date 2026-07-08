// INDEX-COVERAGE TEST — every angle of inquiry into the entity spine must hit an index, never a full scan of a
// big table. Runs EXPLAIN QUERY PLAN for each pivot/facet and PASS/FAILs on the plan. Read-only; run ON tower-nas
// after migration 84. Exits non-zero if any angle is unindexed (usable as a CI gate).
//   node scripts/entity-read/test-index-coverage.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');

const BIG = ['entity_claims', 'entity_aliases_v2', 'entity_mentions', 'graph_entities'];   // tables a SCAN of is a failure
// Each angle: a real query a research tool would run. expect: the primary table must be reached by index.
const ANGLES = [
  // ---- entity_claims: the cited-claim pivots (every relationship direction) ----
  ['claims: all facts about a person',        `SELECT * FROM entity_claims WHERE entity_id=?`, [1], 'entity_claims'],
  ['claims: a person + one relation',         `SELECT * FROM entity_claims WHERE entity_id=? AND relation=?`, [1, 'met'], 'entity_claims'],
  ['claims: reverse — who points AT X',       `SELECT * FROM entity_claims WHERE target_entity_id=?`, [1], 'entity_claims'],
  ['claims: relation R to a target (who met X / participated in event E)', `SELECT * FROM entity_claims WHERE relation=? AND target_entity_id=?`, ['participated-in', 1], 'entity_claims'],
  ['claims: everyone with relation R (facet)',`SELECT * FROM entity_claims WHERE relation=?`, ['martyred-at'], 'entity_claims'],
  ['claims: corroborations of a claim group', `SELECT * FROM entity_claims WHERE claim_group=?`, ['g1'], 'entity_claims'],
  ['claims: everything citing a paragraph',   `SELECT * FROM entity_claims WHERE para_id=?`, ['para_369'], 'entity_claims'],
  ['claims: everything from one book/import',  `SELECT * FROM entity_claims WHERE import_batch=?`, ['gpb'], 'entity_claims'],
  ['claims: idempotent hash lookup',          `SELECT * FROM entity_claims WHERE claim_hash=?`, ['h'], 'entity_claims'],
  ['claims: era-gate on a person’s claims', `SELECT * FROM entity_claims WHERE entity_id=? AND valid_to>=?`, [1, '1863'], 'entity_claims'],
  // ---- entity_aliases_v2: resolution / candidate generation ----
  ['alias: resolve by normalized surface',    `SELECT entity_id FROM entity_aliases_v2 WHERE surface_norm=?`, ['mirza qurban-ali'], 'entity_aliases_v2'],
  ['alias: resolve by Arabic-script key',     `SELECT entity_id FROM entity_aliases_v2 WHERE script_key=?`, ['ميرزا قربانعلي'], 'entity_aliases_v2'],
  ['alias: block by phonetic key',            `SELECT entity_id FROM entity_aliases_v2 WHERE phonetic_key=?`, ['mrzqrbnl'], 'entity_aliases_v2'],
  ['alias: all names of an entity',           `SELECT * FROM entity_aliases_v2 WHERE entity_id=?`, [1], 'entity_aliases_v2'],
  ['alias: display name of an entity',        `SELECT surface FROM entity_aliases_v2 WHERE entity_id=? AND is_display=1`, [1], 'entity_aliases_v2'],
  // ---- alias_priors: P(e|m) candidate-gen ----
  ['prior: candidates for a surface',         `SELECT entity_id,count FROM alias_priors WHERE surface_norm=?`, ['the master'], 'alias_priors'],
  // ---- entity_mentions: coreference bindings ----
  ['mention: all mentions of an entity',      `SELECT * FROM entity_mentions WHERE entity_id=?`, [1], 'entity_mentions'],
  // ---- graph_entities: entity-level facets ----
  ['entity: by type (facet)',                 `SELECT id FROM graph_entities WHERE entity_type=?`, ['person'], 'graph_entities'],
  ['entity: by canonical name',               `SELECT id FROM graph_entities WHERE canonical_name=?`, ['x'], 'graph_entities'],
  ['entity: by religion (facet)',             `SELECT id FROM graph_entities WHERE entity_type=? AND religion=?`, ['person', ''], 'graph_entities'],
  ['entity: persons ranked by importance',    `SELECT id FROM graph_entities WHERE entity_type=? ORDER BY importance DESC`, ['person'], 'graph_entities'],
  // NOTE: `side` (Bábí/Bahá'í/opponent) lives in entity_research, so it can't be faceted from graph_entities.
  // The claims backfill denormalizes side onto the entity row (+ index) so "persons of side X" is an index seek.
  ['entity: persons by side (via entity_research)', `SELECT ge.id FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE er.side=?`, ['Bábí'], 'entity_research'],
];

const plan = async (sql, params) => (await queryAll(`EXPLAIN QUERY PLAN ${sql}`, params)).map((r) => r.detail || r.selectid + '' || JSON.stringify(r)).join(' | ');
let fails = 0;
for (const [name, sql, params, table] of ANGLES) {
  let detail; try { detail = await plan(sql, params); } catch (e) { console.log(`  ERR  ${name} :: ${e.message}`); fails++; continue; }
  const scansBig = new RegExp(`SCAN (TABLE )?${table}\\b`).test(detail) && !/USING (COVERING )?INDEX/.test(detail);
  const tempBtree = /USE TEMP B-TREE/.test(detail);                       // unindexed ORDER BY / GROUP BY
  const ok = !scansBig && !tempBtree;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}
console.log(`\n${ANGLES.length - fails}/${ANGLES.length} angles indexed${fails ? `  — ${fails} need an index` : ' — every angle hits an index'}`);
process.exit(fails ? 1 : 0);
