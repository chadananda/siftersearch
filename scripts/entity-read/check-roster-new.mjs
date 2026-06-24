// Diagnostic: verify the questionable p781 bind (Harátí vs Qá'iní nisba) and confirm the 3 recovery
// bind targets are sensible. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, queryOne } = await import('../../api/lib/db.js');
const list = await queryAll("SELECT paragraph_index pi, text FROM content WHERE doc_id=21308 AND heading='List of the martyrs' AND deleted_at IS NULL ORDER BY paragraph_index");
const t = new Map(list.map(r => [r.pi, r.text.replace(/\s+/g, ' ')]));
console.log('=== p781 full text ===\n  ' + (t.get(781) || '(none)'));
for (const id of [1249418, 1249504, 1249516, 1249754]) {
  const e = await queryOne('SELECT id, canonical_name cn, summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name WHERE ge.id=?', [id]);
  console.log(`\n--- ${id}: ${e ? e.cn : '(missing)'} ---\n  ${e ? (e.summary || '').slice(0, 260) : ''}`);
}
// any seed entity whose name mentions Harátí / Herat?
const har = await queryAll("SELECT ge.id, er.canonical_name cn FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' WHERE er.canonical_name LIKE '%Harát%' OR er.canonical_name LIKE '%Herat%' OR er.aliases LIKE '%Harát%'");
console.log('\n=== seed entities mentioning Harát/Herat ===\n  ' + (har.map(h => `${h.id}:${h.cn}`).join(' | ') || '(none)'));
process.exit(0);
