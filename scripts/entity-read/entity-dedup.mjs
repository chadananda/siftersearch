// ENTITY-DEDUP — merge duplicate PERSON entities that share an exact canonical name (after diacritic/case fold),
// among entities REFERENCED by the pipeline (mentions/claims). Reassigns mentions + claims from the duplicates to a
// single kept entity (lowest id), records a 'merge' decision, and blanks the duplicate rows' name so they drop out of
// listings. Exact full-canonical match ⇒ certainly the same person (safe, deterministic). Reversible via the decision.
//   DRY: node scripts/entity-read/entity-dedup.mjs   ·   WRITE: SIFTER_WRITER_URL=… WRITE=1 node scripts/entity-read/entity-dedup.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();

// entities referenced by the pipeline + all person entities sharing their exact canonical
const refd = new Set((await queryAll(`SELECT DISTINCT entity_id id FROM entity_mentions_v2 WHERE entity_id IS NOT NULL
  UNION SELECT DISTINCT entity_id FROM entity_claims WHERE entity_id IS NOT NULL AND import_batch IN ('db-v2','gpb-v2')`)).map((r) => r.id));
const persons = await queryAll(`SELECT id, canonical_name cn FROM graph_entities WHERE entity_type='person' AND canonical_name IS NOT NULL AND canonical_name!=''`);
const groups = new Map();                              // nrm(canonical) → [ids]
for (const p of persons) { const k = nrm(p.cn); if (k.length < 3) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ id: p.id, cn: p.cn }); }

let merged = 0, dupEnts = 0;
for (const [, ids] of groups) {
  if (ids.length < 2) continue;
  if (!ids.some((e) => refd.has(e.id))) continue;      // only groups the pipeline touches
  // count references to pick the survivor (most-referenced, tiebreak lowest id)
  const counts = await queryAll(`SELECT entity_id id, COUNT(*) n FROM entity_mentions_v2 WHERE entity_id IN (${ids.map(() => '?').join(',')}) GROUP BY entity_id`, ids.map((e) => e.id));
  const cmap = new Map(counts.map((c) => [c.id, c.n]));
  const keep = ids.slice().sort((a, b) => (cmap.get(b.id) || 0) - (cmap.get(a.id) || 0) || a.id - b.id)[0];
  const dups = ids.filter((e) => e.id !== keep.id);
  console.log(`  MERGE “${keep.cn.slice(0, 44)}” keep #${keep.id} ← ${dups.map((d) => '#' + d.id).join(',')}`);
  merged++; dupEnts += dups.length;
  if (WRITE) {
    const dids = dups.map((d) => d.id); const ph = dids.map(() => '?').join(',');
    await query(`UPDATE entity_mentions_v2 SET entity_id=? WHERE entity_id IN (${ph})`, [keep.id, ...dids]);
    await query(`UPDATE entity_claims SET entity_id=? WHERE entity_id IN (${ph})`, [keep.id, ...dids]);
    await query(`UPDATE entity_claims SET target_entity_id=? WHERE target_entity_id IN (${ph})`, [keep.id, ...dids]);
    await query(`UPDATE graph_entities SET name='[merged→' || ? || ']', last_assessed_version='merged-into-' || ? WHERE id IN (${ph})`, [keep.id, keep.id, ...dids]);
    await query(`INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, rationale, actor, actor_tier, confidence, status, decided_at)
      VALUES ('merge','entity',?,?,?,?,?,?,?,unixepoch())`, [JSON.stringify(dids), JSON.stringify({ keep: keep.id, canonical: keep.cn }), 'exact canonical-name duplicate', 'model:dedup', 2, 1, 'applied']);
  }
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY'} — ${merged} groups merged, ${dupEnts} duplicate entities folded into survivors`);
process.exit(0);
