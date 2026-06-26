import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// the defining shared episodes: passages naming Bahá'u'lláh together with the Letters / Badasht / Ṭabarsí journey
const q = `SELECT d.id doc, c.external_para_id pid, c.paragraph_index pix, c.text FROM content c JOIN docs d ON d.id=c.doc_id
  WHERE c.doc_id IN (21310,21308) AND (
     (c.text LIKE '%Badas%' AND c.text LIKE '%Bahá%') OR
     (c.text LIKE '%three gardens%') OR
     (c.text LIKE '%Bahá%' AND c.text LIKE '%Ṭabarsí%' AND c.text LIKE '%accompan%') )
  ORDER BY d.id, c.paragraph_index LIMIT 12`;
for (const r of await queryAll(q)) console.log(`\n[doc ${r.doc} ${r.pid} ¶${r.pix}] ${r.text.replace(/\s+/g, ' ').slice(0, 400)}`);
process.exit(0);
