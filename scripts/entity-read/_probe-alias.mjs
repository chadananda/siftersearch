// throwaway: does the resolver's entity_aliases table still map a Muṣṭafá surface to Qurbán-‘Alí (1247617)?
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const a = await queryAll(`SELECT entity_id, surface, surface_norm, lang, confidence, source FROM entity_aliases WHERE surface_norm LIKE '%mustaf%' OR surface LIKE '%ṣṭaf%' OR surface LIKE '%staf%'`);
console.log('entity_aliases rows matching Mustafa:', a.length);
for (const r of a) console.log(' ', JSON.stringify(r));
const q = await queryAll(`SELECT surface, surface_norm, confidence, source FROM entity_aliases WHERE entity_id=1247617 ORDER BY confidence DESC`);
console.log(`\nall entity_aliases for 1247617 (Qurbán-‘Alí): ${q.length}`);
for (const r of q) console.log(' ', JSON.stringify(r));
process.exit(0);
