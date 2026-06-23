// Acceptance-test lookup: show every bound mention of an entity, grouped by book, with the paragraph text,
// so a reader can verify each episode genuinely refers to that person. Usage: node show-entity.mjs <id>
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, queryOne, graphQueryAll } = await import('../../api/lib/db.js');
const id = Number(process.argv[2]);
const er = await queryOne('SELECT er.canonical_name, er.aliases, er.summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name WHERE ge.id=?', [id]);
console.log(`ENTITY ${id}: ${er?.canonical_name}`);
console.log(`aliases: ${er?.aliases}`);
console.log(`summary: ${er?.summary || ''}\n`);
const cids = [...new Set((await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id=?', [id])).map(r => String(r.content_id)))];
if (!cids.length) { console.log('(no bound mentions)'); process.exit(0); }
const rows = await queryAll(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, d.title FROM content c JOIN docs d ON d.id=c.doc_id WHERE c.id IN (${cids.map(() => '?').join(',')})`, cids);
const byDoc = new Map();
for (const r of rows) { if (!byDoc.has(r.doc_id)) byDoc.set(r.doc_id, { title: r.title, paras: [] }); byDoc.get(r.doc_id).paras.push(r); }
for (const [doc, g] of byDoc) {
  g.paras.sort((a, b) => a.paragraph_index - b.paragraph_index);
  console.log(`\n=== ${g.title} (doc ${doc}) — ${g.paras.length} mentions ===`);
  for (const p of g.paras) console.log(`  [p${p.paragraph_index}] ${p.text.replace(/\s+/g, ' ').slice(0, 240)}`);
}
console.log(`\nTOTAL: ${rows.length} mentions across ${byDoc.size} book(s)`);
process.exit(0);
