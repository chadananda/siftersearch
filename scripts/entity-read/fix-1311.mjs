// Restore DB para 1311 (a SHARED paragraph) — wrongly removed from ‘Abdu'l-Vahháb. It describes BOTH
// Mírzá Muḥammad-‘Alíy-i-Ṭabíb-i-Zanjání AND Mírzá ‘Abdu'l-Vahháb-i-Shírází (the Karbilá shop / money / follow
// to Ṭihrán / martyrdom). Bind 1311 to both; it is the in-book Karbilá episode.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryOne, queryAll, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const SON = 1249228;
const cid = String((await queryOne("SELECT id FROM content WHERE doc_id=21308 AND paragraph_index=1311 AND deleted_at IS NULL")).id);
const zanj = await queryAll("SELECT ge.id, er.canonical_name FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.religion='' WHERE er.entity_type='person' AND (er.canonical_name LIKE '%Ṭabíb-i-Zanjání%' OR er.canonical_name LIKE '%Muḥammad-‘Alíy-i-Ṭabíb%' OR er.aliases LIKE '%Ṭabíb-i-Zanjání%')");
console.log('Zanjání candidates:', zanj.map(z => z.id + ' ' + z.canonical_name).join(' | ') || '(none)');
const targets = [[SON, 'Mírzá ‘Abdu’l-Vahháb-i-Shírází'], ...zanj.map(z => [z.id, z.canonical_name])];
for (const [eid, nm] of targets) {
  const have = (await graphQueryAll("SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=? AND content_id=?", [eid, cid]))[0].n;
  if (have) { console.log(`  exists ${eid} ${nm}`); continue; }
  await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", [eid, cid, 'subject', 0.95]);
  console.log(`  bound 1311 -> ${eid} ${nm}`);
}
process.exit(0);
