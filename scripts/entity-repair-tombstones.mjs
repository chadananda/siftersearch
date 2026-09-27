// Repair rows left pointing at MERGED-AWAY entities. applyMerge used to repoint mentions + claims but not
// graph_relations, so group memberships and other edges stayed on tombstones (two Letters of the Living fell out of
// their group this way), and some claim targets did too. Each tombstone is followed along its merge chain
// ('merged-into-<id>', possibly several hops) to the LIVE survivor; rows are repointed there, duplicates that the
// survivor already has are dropped, and the survivor inherits the highest importance of the records it absorbed.
// DRY by default (counts + samples). --write saves every touched row to a rollback file first.
// Output: logs/entity-repair-<dry|write>-<ts>.json. Triggered by POST /api/admin/server/entity-repair-tombstones.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync, mkdirSync } from 'fs';
const { queryAll, transaction } = await import('../api/lib/db.js');
const { tombstoneTarget } = await import('../api/lib/entity-live.js');

const WRITE = process.argv.includes('--write');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('logs', { recursive: true });

const ents = await queryAll(`SELECT id, canonical_name name, importance, last_assessed_version lav FROM graph_entities`);
const byId = new Map(ents.map((e) => [e.id, e]));
const next = new Map(ents.map((e) => [e.id, tombstoneTarget(e.lav)]).filter(([, t]) => t != null));
const resolve = (id) => {        // follow the chain to a live survivor; null if it ends dead or loops
  const seen = new Set([id]);
  let cur = id;
  while (next.has(cur)) { cur = next.get(cur); if (seen.has(cur)) return null; seen.add(cur); }
  return byId.has(cur) ? cur : null;
};
const dead = [...next.keys()];
const report = { mode: WRITE ? 'write' : 'dry', tombstones: dead.length, unresolved: dead.filter((d) => resolve(d) == null).length,
  relations: { rows: 0, byType: {} }, claimSubjects: 0, claimTargets: 0, mentions: 0, importanceRaised: 0, samples: [] };

const IN = (ids) => ids.map(() => '?').join(',');
const chunks = (a, n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const rel = [], cs = [], ct = [], men = [];
for (const ch of chunks(dead)) {
  rel.push(...await queryAll(`SELECT * FROM graph_relations WHERE source_entity_id IN (${IN(ch)}) OR target_entity_id IN (${IN(ch)})`, [...ch, ...ch]));
  cs.push(...await queryAll(`SELECT id, entity_id FROM entity_claims WHERE entity_id IN (${IN(ch)})`, ch));
  ct.push(...await queryAll(`SELECT id, target_entity_id FROM entity_claims WHERE target_entity_id IN (${IN(ch)})`, ch));
  men.push(...await queryAll(`SELECT id, entity_id FROM entity_mentions_v2 WHERE entity_id IN (${IN(ch)})`, ch));
}
const uniqRel = [...new Map(rel.map((r) => [r.id, r])).values()];
report.relations.rows = uniqRel.length;
for (const r of uniqRel) {
  report.relations.byType[r.relation_type] = (report.relations.byType[r.relation_type] || 0) + 1;
  if (report.samples.length < 25 && (r.relation_type !== 'co-occurs')) {
    const s = resolve(r.source_entity_id) ?? r.source_entity_id, t = resolve(r.target_entity_id) ?? r.target_entity_id;
    report.samples.push(`${byId.get(r.source_entity_id)?.name} —${r.relation_type}→ ${byId.get(r.target_entity_id)?.name}  ⇒  #${s} ${byId.get(s)?.name} → #${t} ${byId.get(t)?.name}`);
  }
}
report.claimSubjects = cs.length; report.claimTargets = ct.length; report.mentions = men.length;

// Importance: a survivor inherits the highest importance among everything merged into it.
const raise = new Map();
for (const d of dead) {
  const s = resolve(d); const imp = byId.get(d)?.importance;
  if (s != null && imp != null && imp > (byId.get(s)?.importance ?? -1) && imp > (raise.get(s) ?? -1)) raise.set(s, imp);
}
report.importanceRaised = raise.size;
report.importanceSamples = [...raise].slice(0, 15).map(([s, imp]) => `#${s} ${byId.get(s)?.name}: ${byId.get(s)?.importance ?? 'null'} → ${imp}`);

if (WRITE) {
  writeFileSync(`logs/entity-repair-rollback-${stamp}.json`, JSON.stringify({ relations: uniqRel, claimSubjects: cs, claimTargets: ct, mentions: men,
    importance: [...raise.keys()].map((s) => ({ id: s, importance: byId.get(s)?.importance ?? null })) }));
  const stmts = [];
  for (const r of uniqRel) {
    const s = resolve(r.source_entity_id) ?? r.source_entity_id, t = resolve(r.target_entity_id) ?? r.target_entity_id;
    if (s === t || !byId.has(s) || !byId.has(t) || next.has(s) || next.has(t)) { stmts.push({ sql: 'DELETE FROM graph_relations WHERE id=?', args: [r.id] }); continue; }
    stmts.push({ sql: 'UPDATE OR IGNORE graph_relations SET source_entity_id=?, target_entity_id=? WHERE id=?', args: [s, t, r.id] });
    stmts.push({ sql: 'DELETE FROM graph_relations WHERE id=? AND (source_entity_id=? OR target_entity_id=?)', args: [r.id, r.source_entity_id, r.target_entity_id].map(Number) });
  }
  for (const c of cs) { const s = resolve(c.entity_id); if (s != null) stmts.push({ sql: 'UPDATE entity_claims SET entity_id=? WHERE id=?', args: [s, c.id] }); }
  for (const c of ct) { const s = resolve(c.target_entity_id); stmts.push({ sql: 'UPDATE entity_claims SET target_entity_id=? WHERE id=?', args: [s, c.id] }); }
  for (const m of men) { const s = resolve(m.entity_id); if (s != null) stmts.push({ sql: 'UPDATE entity_mentions_v2 SET entity_id=? WHERE id=?', args: [s, m.id] }); }
  for (const [s, imp] of raise) stmts.push({ sql: 'UPDATE graph_entities SET importance=? WHERE id=?', args: [imp, s] });
  for (const ch of chunks(stmts, 200)) await transaction(ch, 'entity-repair-tombstones');
  report.statements = stmts.length;
}
const file = `logs/entity-repair-${report.mode}-${stamp}.json`;
writeFileSync(file, JSON.stringify(report, null, 1));
console.log(`REPORT ${file}`);
const { samples, importanceSamples, ...summary } = report;
console.log(JSON.stringify(summary));
process.exit(0);
