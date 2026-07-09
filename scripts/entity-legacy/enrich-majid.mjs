// Bind the cross-corpus mention of Ḥájí ‘Abdu'l-Majíd-i-Shírází (1249590) hosting Bahá'u'lláh at Káẓimayn
// (Taherzadeh, Revelation of Bahá'u'lláh I, doc 462 p320) and enrich his summary with the proof he survived
// past 1852 — distinguishing him from the Núr ‘Abdu'l-Vahháb (relations massacred) and from the Níshápúr
// ‘Abdu'l-Majíd (Badí''s father). Reversible (xref-v1 link; entity_research backed up). DRY=1 previews.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const ID = 1249590;
const cn = (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [ID])).canonical_name;
const cid = String((await queryOne('SELECT id FROM content WHERE doc_id=462 AND paragraph_index=320 AND deleted_at IS NULL'))?.id || '');
const SUMMARY = `Ḥájí ‘Abdu'l-Majíd-i-Shírází — a man of standing in the court of the sons of the Farmán-Farmá (governor of Fárs) and father of the martyr ‘Abdu'l-Vahháb-i-Shírází. At the gates of Shíráz he pursued and beat Mullá ‘Alíy-i-Basṭámí (a Letter of the Living) for drawing his son away (1844). Later forced from Shíráz, he settled near Baghdád, where he embraced the Faith; during Bahá'u'lláh's Baghdád exile He was a guest in ‘Abdu'l-Majíd's house at Káẓimayn (Taherzadeh, The Revelation of Bahá'u'lláh, vol. 1). His survival well past 1852 (his son was martyred in the Síyáh-Chál, but he himself lived to host Bahá'u'lláh) shows this family is NOT the ‘Abdu'l-Vahháb of Núr whose kin were massacred in the 1852 Mázindarán persecution. Distinct from Ḥájí ‘Abdu'l-Majíd-i-Níshápúrí, the father of Badí'.`;
console.log(`entity ${ID} ${cn}; Káẓimayn-hosting content_id=${cid || 'NOT FOUND'}`);
if (!DRY) {
  if (cid) { const have = (await graphQueryAll('SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=? AND content_id=?', [ID, cid]))[0].n; if (!have) { await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','xref-v1')", [ID, cid, 'subject', 0.95]); console.log('bound 462:320 -> 1249590'); } else console.log('already bound'); }
  await query("UPDATE entity_research SET summary=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [SUMMARY, cn]);
  console.log('summary updated');
} else console.log('[DRY] nothing written');
process.exit(0);
