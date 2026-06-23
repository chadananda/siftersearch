// Correct an entity summary to remove an unsupported claim. Usage: node update-summary.mjs (edit below).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { query, queryOne } = await import('../../api/lib/db.js');
const ID = 1249228;
const SUMMARY = `A Bábí of Shíráz, son of Ḥájí ‘Abdu'l-Majíd; a young shopkeeper at Karbilá whom Bahá'u'lláh, on His journey to Karbilá/Baghdád, befriended — frequenting his shop and urging him to be patient and continue his trade (even giving him money to expand it) until summoned. Unable to bear the separation, he followed Bahá'u'lláh to Ṭihrán; unable to find Him there, he taught openly in the streets (The Chosen Highway). He was arrested in the mass persecution following the 1852 attempt on the life of Náṣiri'd-Dín Sháh, imprisoned in the Síyáh-Chál chained beside Bahá'u'lláh; on the morning of his execution he recounted a radiant dream of soaring through infinite space, received Bahá'u'lláh's own shoes for his bare feet, and was martyred (1852). NOTE: the sources do not state whether he had any part in the attempt itself — his arrest is attributed to following Bahá'u'lláh and to open teaching, but his involvement (or non-involvement) in the plot is not established.`;
const cn = (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [ID])).canonical_name;
const before = (await queryOne("SELECT summary FROM entity_research WHERE canonical_name=? AND entity_type='person'", [cn])).summary;
console.log('BEFORE:', before.slice(0, 120), '...\n');
await query("UPDATE entity_research SET summary=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'", [SUMMARY, cn]);
console.log('UPDATED', ID, cn);
process.exit(0);
