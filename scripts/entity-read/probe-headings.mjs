// Probe how chapters/headings are structured for a doc, to design chapter segmentation for disambiguation.
//   node scripts/entity-read/probe-headings.mjs 21308
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const doc = +process.argv[2] || 21308;
const ps = await queryAll(`SELECT external_para_id pid, paragraph_index pidx, heading, blocktype, substr(text,1,60) t FROM content WHERE doc_id=? AND deleted_at IS NULL ORDER BY paragraph_index`, [doc]);
console.log(`doc ${doc}: ${ps.length} paragraphs`);
const heads = [...new Set(ps.map((p) => p.heading || ''))];
console.log(`distinct headings: ${heads.length}`);
console.log(`blocktypes: ${[...new Set(ps.map((p) => p.blocktype))].join(', ')}`);
// show heading transitions (chapter starts)
let prev = null, count = 0;
for (const p of ps) { if (p.heading !== prev) { count++; if (count <= 40) console.log(`  @${p.pid} (idx ${p.pidx}) heading="${(p.heading || '').slice(0, 70)}"`); prev = p.heading; } }
console.log(`total heading transitions: ${count}`);
// zoom on the Yazd/Azghandí chapter (paras 524-541)
console.log(`\n--- around Azghandí (pid 524..541) ---`);
for (const p of ps.filter((x) => { const n = +String(x.pid).replace(/\D/g, ''); return n >= 524 && n <= 541; })) console.log(`  ${p.pid} [${p.blocktype}] head="${(p.heading || '').slice(0, 50)}" :: ${p.t}`);
process.exit(0);
