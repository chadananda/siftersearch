// Apply the person-catalog review (entity_catalog_review):
//   group/work/place/concept/junk → graph_entities.entity_type set to that kind (out of the person catalog; the prior
//     type is saved to the rollback file, so it is reversible),
//   title_of with confidence ≥ --min (default 0.9) and a resolved LIVE figure → merged INTO that figure (applyMerge:
//     mentions, claims, relations and importance move; tombstone), mention/claim/relation rows saved first,
//   everything else (low-confidence titles, unresolved figures) → HELD and listed for review.
// DRY by default. --write applies. Output: logs/entity-catalog-apply-<dry|write>-<ts>.json.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
const { queryAll, transaction } = await import('../api/lib/db.js');
const { LIVE_SQL } = await import('../api/lib/entity-live.js');
const { makeStore } = await import('../api/lib/rag-adapter/store.js');

const WRITE = process.argv.includes('--write');
// --retype-only: apply the reversible retypes, merge NOTHING. The first dry run's ≥0.9 merge list held serious errors
// (Ghusn-i-A‘ẓam → Bahá’u’lláh, Zayn al-‘Ábidín → Bahá’u’lláh): the figure a title was RESOLVED to was taken from
// recall without checking its name matched the model's. Merges wait for strict resolution + a second check.
const RETYPE_ONLY = process.argv.includes('--retype-only');
const MIN = Number((process.argv.find((a) => a.startsWith('--min=')) || '').split('=')[1]) || 0.9;
const store = makeStore();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rows = await queryAll(`SELECT r.entity_id id, r.kind, r.same_as, r.same_as_id sid, r.confidence conf, r.reason, ge.canonical_name name, ge.entity_type type,
    f.canonical_name figure, f.last_assessed_version flav
  FROM entity_catalog_review r JOIN graph_entities ge ON ge.id = r.entity_id
  LEFT JOIN graph_entities f ON f.id = r.same_as_id
  WHERE r.kind <> 'individual' AND ge.entity_type = 'person' AND ${LIVE_SQL('ge.')}`);
const retype = rows.filter((r) => ['group', 'work', 'place', 'concept', 'junk'].includes(r.kind));
const titles = rows.filter((r) => r.kind === 'title_of');
const liveFigure = (r) => r.sid && r.figure && !(r.flav || '').startsWith('merged-into-');
const merge = titles.filter((r) => (r.conf || 0) >= MIN && liveFigure(r));
const held = titles.filter((r) => !merge.includes(r));
const report = { mode: WRITE ? 'write' : 'dry', min: MIN, retype: retype.length, retypeByKind: {}, merge: merge.length, held: held.length,
  mergeList: merge.map((r) => `${r.name} → ${r.figure} (${r.conf})`), heldList: held.slice(0, 200).map((r) => `${r.name} → ${r.same_as || '?'}${r.figure ? ` [#${r.sid} ${r.figure}]` : ''} (${r.conf}) — ${r.reason}`) };
for (const r of retype) report.retypeByKind[r.kind] = (report.retypeByKind[r.kind] || 0) + 1;

if (WRITE) {
  mkdirSync('logs', { recursive: true });
  const rollback = { retype: retype.map((r) => ({ id: r.id, type: r.type })), merges: [] };
  writeFileSync(`logs/entity-catalog-rollback-${stamp}.json`, JSON.stringify(rollback));
  // OR IGNORE: a record whose name already exists under the new type ("Bayán" the person vs "Bayán" the work) collides
  // with UNIQUE(canonical_name, entity_type, religion) — that record is a duplicate of the existing entity and is
  // MERGED into it below instead.
  const stmts = retype.map((r) => ({ sql: `UPDATE OR IGNORE graph_entities SET entity_type = ? WHERE id = ? AND entity_type = 'person'`, args: [r.kind, r.id] }));
  for (let i = 0; i < stmts.length; i += 300) await transaction(stmts.slice(i, i + 300), 'entity-catalog-apply');
  const stuck = [];
  for (const r of retype) {
    const still = (await queryAll(`SELECT entity_type t, religion FROM graph_entities WHERE id = ?`, [r.id]))[0];
    if (!still || still.t !== 'person') continue;
    const twin = (await queryAll(`SELECT id FROM graph_entities WHERE canonical_name = ? AND entity_type = ? AND religion IS ? AND ${LIVE_SQL()}`, [r.name, r.kind, still.religion]))[0];
    if (!twin) { stuck.push(r.name); continue; }
    rollback.merges.push({ title: r.id, into: twin.id, retypeCollision: true,
      mentions: await queryAll(`SELECT id, entity_id FROM entity_mentions_v2 WHERE entity_id = ?`, [r.id]),
      claimSubjects: await queryAll(`SELECT id, entity_id FROM entity_claims WHERE entity_id = ?`, [r.id]),
      claimTargets: await queryAll(`SELECT id, target_entity_id FROM entity_claims WHERE target_entity_id = ?`, [r.id]),
      relations: await queryAll(`SELECT * FROM graph_relations WHERE source_entity_id = ? OR target_entity_id = ?`, [r.id, r.id]) });
    writeFileSync(`logs/entity-catalog-rollback-${stamp}.json`, JSON.stringify(rollback));
    await store.applyMerge(twin.id, [r.id], `catalog review: "${r.name}" is a ${r.kind}, merged into the existing ${r.kind} of that name`);
  }
  report.retypeCollisionsMerged = rollback.merges.length;
  report.retypeStuck = stuck;
  for (const r of RETYPE_ONLY ? [] : merge) {
    rollback.merges.push({ title: r.id, into: r.sid,
      mentions: await queryAll(`SELECT id, entity_id FROM entity_mentions_v2 WHERE entity_id = ?`, [r.id]),
      claimSubjects: await queryAll(`SELECT id, entity_id FROM entity_claims WHERE entity_id = ?`, [r.id]),
      claimTargets: await queryAll(`SELECT id, target_entity_id FROM entity_claims WHERE target_entity_id = ?`, [r.id]),
      relations: await queryAll(`SELECT * FROM graph_relations WHERE source_entity_id = ? OR target_entity_id = ?`, [r.id, r.id]) });
    writeFileSync(`logs/entity-catalog-rollback-${stamp}.json`, JSON.stringify(rollback));
    await store.applyMerge(r.sid, [r.id], `catalog review: "${r.name}" is a title of ${r.figure} (${r.conf}) — ${r.reason}`);
  }
  report.rollback = `logs/entity-catalog-rollback-${stamp}.json`;
}
mkdirSync('logs', { recursive: true });
const file = `logs/entity-catalog-apply-${report.mode}-${stamp}.json`;
writeFileSync(file, JSON.stringify(report, null, 1));
console.log(`REPORT ${file}`);
console.log(JSON.stringify({ mode: report.mode, retype: report.retype, byKind: report.retypeByKind, collisionsMerged: report.retypeCollisionsMerged, stuck: report.retypeStuck?.length, merge: RETYPE_ONLY ? 0 : report.merge, held: report.held }));
process.exit(0);
