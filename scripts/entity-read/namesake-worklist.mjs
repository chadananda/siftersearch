// Build the namesake cross-contamination worklist: every paragraph bound to >=2 entities that share a
// given-name core, with the paragraph text + each candidate's profile, so identity can be adjudicated by
// reading. Writes namesake-worklist.json. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const HON = /^(the |that |this |an |a |mulla |mirza |siyyid |haji |aqa |shaykh |s?h?ayh |mawlana |prince |imam |mir )+/;
const core = s => { let n = norm(s).replace(/\s*\([^)]*\)\s*$/, ''); let prev; do { prev = n; n = n.replace(HON, ''); } while (n !== prev); return n.replace(/-i-[a-z‘’'-]+$/, '').replace(/ of [a-z‘’'-]+$/, '').trim(); };

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const info = new Map(persons.map(p => [p.id, { canon: p.canonical_name, summary: (p.summary || '').slice(0, 200) }]));
const cmap = new Map((await queryAll(`SELECT id,paragraph_index FROM content WHERE doc_id=${DOC}`)).map(r => [String(r.id), r.paragraph_index]));
const text = new Map((await queryAll(`SELECT paragraph_index,text FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, r.text]));

const entityByPara = new Map();
for (const r of await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')) {
  const p = cmap.get(String(r.content_id)); if (p == null || !info.has(r.entity_id)) continue;
  if (!entityByPara.has(p)) entityByPara.set(p, new Set()); entityByPara.get(p).add(r.entity_id);
}
const work = [];
for (const [p, ids] of entityByPara) {
  if (ids.size < 2) continue;
  // group the bound entities at this para by core; any core with >=2 members = cross-contamination
  const byCore = new Map();
  for (const id of ids) { const c = core(info.get(id).canon); if (!byCore.has(c)) byCore.set(c, []); byCore.get(c).push(id); }
  for (const [c, members] of byCore) {
    if (members.length < 2) continue;
    work.push({ cluster: c, para: p, text: (text.get(p) || '').replace(/\s+/g, ' '), candidates: members.map(id => ({ id, canon: info.get(id).canon, summary: info.get(id).summary })) });
  }
}
work.sort((a, b) => a.cluster.localeCompare(b.cluster) || a.para - b.para);
writeFileSync('tmp/entity-research/seqread/namesake-worklist.json', JSON.stringify(work, null, 1));
const byClu = {}; for (const w of work) byClu[w.cluster] = (byClu[w.cluster] || 0) + 1;
console.log(`cross-contaminated paragraphs: ${work.length} across ${Object.keys(byClu).length} clusters`);
for (const [c, n] of Object.entries(byClu).sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);
process.exit(0);
