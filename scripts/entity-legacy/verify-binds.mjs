// Post-apply verification: confirm the role-title binds went to DISTINCT entities in the RIGHT periods
// (the two Sháhs, the two Grand Vazírs), and report seqread-v1 totals + whether recovered names left the queue.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const ids = {
  1247565: 'Muhammad Shah', 1247566: "Nasiri'd-Din Shah", 1247567: 'Haji Mirza Aqasi',
  1247946: 'Mirza Aqa Khan-i-Nuri', 1247606: "Sa'idu'l-'Ulama", 1247583: 'Manuchihr Khan',
  1247582: "Sultanu'l-'Ulama (Imam-Jumih Isfahan)", 1247636: 'Mahd-i-Ulya',
};
const cmap = new Map((await queryAll('SELECT id,paragraph_index FROM content WHERE doc_id=21308')).map(r => [String(r.id), r.paragraph_index]));
for (const [id, nm] of Object.entries(ids)) {
  const rows = await graphQueryAll('SELECT content_id,extractor_version FROM entity_mentions WHERE entity_id=?', [id]);
  const sv = rows.filter(r => r.extractor_version === 'seqread-v1');
  const paras = sv.map(r => cmap.get(String(r.content_id))).filter(p => p != null).sort((a, b) => a - b);
  console.log(`${id} ${nm}: total=${rows.length} seqread-v1=${sv.length} paras=[${paras.slice(0, 14).join(',')}${paras.length > 14 ? ',…' : ''}]`);
}
const tot = await graphQueryAll("SELECT COUNT(*) c FROM entity_mentions WHERE extractor_version='seqread-v1'");
console.log(`\nTOTAL seqread-v1 rows: ${tot[0].c}`);
const rq = JSON.parse(readFileSync('tmp/entity-research/seqread/review-queue.json', 'utf8'));
const ulamaInQueue = (rq.newPersons || []).filter(p => /ulam/i.test(p.name));
console.log(`new-person queue entries matching 'ulam': ${ulamaInQueue.length ? ulamaInQueue.map(p => p.name + '×' + p.count).join(' | ') : 'NONE (Sa‘ídu’l-‘Ulamá recovered ✓)'}`);
process.exit(0);
