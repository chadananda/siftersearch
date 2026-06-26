import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// Mullá Ḥusayn's stored episodes
const r = await queryAll(`SELECT research_notes rn FROM entity_research WHERE canonical_name='Mullá Ḥusayn'`);
let eps = []; try { eps = JSON.parse(r[0]?.rn || '{}').episodes || []; } catch {}
console.log(`Mullá Ḥusayn episodes (${eps.length}):`);
for (const e of eps) console.log(`  ■ ${e.name}${e.place ? ' @ ' + e.place : ''} — ${String(e.statement).slice(0, 90)}`);
// the DB/GPB passages about the Ṭihrán meeting (Mystery in Ṭihrán / Mu'allim / pages to Bahá'u'lláh)
console.log('\n--- source passages on Mullá Ḥusayn ↔ Bahá'+"'"+'u'+"'"+'lláh in Ṭihrán ---');
const p = await queryAll(`SELECT doc_id, external_para_id pid, paragraph_index pix, substr(text,1,420) t FROM content
  WHERE doc_id IN (21308,21310) AND text LIKE '%Mu_allim%' AND (text LIKE '%Ṭihrán%' OR text LIKE '%Núr%' OR text LIKE '%Bahá%') ORDER BY doc_id, paragraph_index LIMIT 8`);
for (const x of p) console.log(`  [${x.doc_id} ${x.pid} ¶${x.pix}] ${x.t.replace(/\s+/g, ' ')}`);
process.exit(0);
