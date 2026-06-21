// Bind confirmed cross-corpus (non-Dawn-Breakers) mentions to existing seed entities, tagged 'xref-v1'
// (reversible: DELETE FROM entity_mentions WHERE extractor_version='xref-v1'). Additive only.
// Completes the ‘Abdu'l-Vahháb-i-Shírází (son, 1249228) + Ḥájí ‘Abdu'l-Majíd (father, 1249590) Karbilá episode,
// which lives in The Chosen Highway (11335), Conqueror of Hearts (5660) and Robe of Light (8465) — NOT in DB.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryOne, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const SON = 1249228, FATHER = 1249590;
const BINDS = [
  [SON, 11335, 2982], [SON, 11335, 2987], [SON, 11335, 2988], [SON, 5660, 20], [SON, 5660, 22], [SON, 8465, 768],
  [FATHER, 11335, 2984], [FATHER, 11335, 2985], [FATHER, 11335, 2986],
];
let n = 0;
for (const [eid, doc, para] of BINDS) {
  const c = await queryOne("SELECT id FROM content WHERE doc_id=? AND paragraph_index=? AND deleted_at IS NULL", [doc, para]);
  if (!c) { console.log(`  no content ${doc}:${para}`); continue; }
  const cid = String(c.id);
  const have = (await graphQueryAll("SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=? AND content_id=?", [eid, cid]))[0].n;
  if (have) { console.log(`  exists ${eid} <- ${doc}:${para}`); continue; }
  await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','xref-v1')", [eid, cid, 'subject', 0.95]);
  console.log(`  bound ${eid} <- ${doc}:${para}`); n++;
}
console.log(`bound ${n} cross-corpus mentions (reverse: DELETE FROM entity_mentions WHERE extractor_version='xref-v1')`);
process.exit(0);
