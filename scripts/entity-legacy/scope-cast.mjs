// Scope the Dawn-Breakers cast: how many entities are bound to doc 21308, by type, and how enriched they
// are (substantive summary vs bare "DB: <name>" / bare-roster stub vs fabricated-nisba split). Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const cids = (await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => String(r.id));
const cset = new Set(cids);
// distinct entities bound to DB, with mention count within DB
const ment = await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions');
const dbCount = new Map();
for (const m of ment) if (cset.has(String(m.content_id))) dbCount.set(m.entity_id, (dbCount.get(m.entity_id) || 0) + 1);
const ids = [...dbCount.keys()];
console.log(`distinct entities bound to The Dawn-Breakers (doc ${DOC}): ${ids.length}`);
// enrichment status
const ge = await queryAll(`SELECT ge.id, ge.entity_type t, er.summary s FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id IN (${ids.join(',')})`);
const byType = {}, enrich = { substantive: 0, bareDB: 0, bareRoster: 0, none: 0 };
for (const r of ge) {
  byType[r.t] = (byType[r.t] || 0) + 1;
  const s = (r.s || '').trim();
  if (!s) enrich.none++;
  else if (/^DB:/.test(s) || s.length < 40) enrich.bareDB++;
  else if (/Named only in|bare-name roster|no further biographical|minimal detail|named with minimal|named once/i.test(s)) enrich.bareRoster++;
  else enrich.substantive++;
}
console.log('by type:', JSON.stringify(byType));
console.log('enrichment:', JSON.stringify(enrich));
// mention-count distribution (how many are 1-mention vs recurring)
const buckets = { '1': 0, '2-3': 0, '4-9': 0, '10+': 0 };
for (const c of dbCount.values()) buckets[c === 1 ? '1' : c <= 3 ? '2-3' : c <= 9 ? '4-9' : '10+']++;
console.log('DB mention-count buckets:', JSON.stringify(buckets));
process.exit(0);
