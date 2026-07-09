// Measure RECALL for an entity: every paragraph whose text refers to the person (by name/epithet) vs the
// paragraphs actually bound in the entity index. A large MISS set => the binder isn't pulling all mentions.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
// betrayer Mírzá Ḥusayn-i-Mutavallíy-i-Qumí (1249227) — name/epithet forms
const ENTITY = 1249227;
const PATTERNS = ['%Mutavallí%', '%Siyyid-i-Qumí%', '%siyyid of Qum%', '%siyyid from Qum%', '%betray%', '%deserted the fort%'];
const cmap = new Map((await queryAll(`SELECT id,paragraph_index FROM content WHERE doc_id=${DOC}`)).map(r => [String(r.id), r.paragraph_index]));
const bound = new Set((await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id=?', [ENTITY])).map(r => cmap.get(String(r.content_id))).filter(p => p != null));
const where = PATTERNS.map(() => 'text LIKE ?').join(' OR ');
const rows = await queryAll(`SELECT paragraph_index, substr(text,1,160) t FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL AND (${where}) ORDER BY paragraph_index`, PATTERNS);
console.log(`bound paras (${bound.size}): [${[...bound].sort((a, b) => a - b).join(',')}]`);
console.log(`\ntext references by name/epithet (${rows.length}):`);
let miss = 0;
for (const r of rows) { const b = bound.has(r.paragraph_index); if (!b) miss++; console.log(`  ${b ? 'BOUND' : 'MISS '} [${r.paragraph_index}] ${r.t.replace(/\s+/g, ' ')}`); }
console.log(`\nMISSES (text refers, not bound): ${miss}/${rows.length}`);
// also: scan the Quddús-Bárfurúsh martyrdom region for the mocking scene
console.log('\n=== Quddús-martyrdom region scan (820-875) for mocking/forgiveness ===');
const q = await queryAll(`SELECT paragraph_index,text FROM content WHERE doc_id=${DOC} AND paragraph_index BETWEEN 820 AND 875 AND deleted_at IS NULL ORDER BY paragraph_index`);
for (const r of q) { const t = r.text.replace(/\s+/g, ' '); if (/Qum|Mutavallí|mock|revil|taunt|deride|forgave|forgive|abuse/i.test(t)) console.log(`  ${bound.has(r.paragraph_index) ? 'BOUND' : 'MISS '} [${r.paragraph_index}] ${t.slice(0, 220)}`); }
process.exit(0);
