import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
// the full Ṭabarsí martyr roster section; find Jalíl-i-Urúmí + Aḥmad-i-Ibdál entries
const rows = await queryAll(`SELECT external_para_id pid, paragraph_index pix, text FROM content
  WHERE doc_id=21308 AND heading LIKE '%List of the martyrs%' ORDER BY paragraph_index`);
console.log(`martyr-list section: ${rows.length} paragraphs (¶${rows[0]?.pix}-${rows[rows.length-1]?.pix})`);
for (const r of rows) {
  if (/Jalíl|Urúmí|Ibdál|Marág|Aḥmad-i-Ibd/.test(r.text)) console.log(`\n[${r.pid} ¶${r.pix}] ${r.text.replace(/\s+/g,' ').slice(0,420)}`);
}
