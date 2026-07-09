// Probe the embedded <h> TOC / heading hierarchy for a doc, to drive chapter(segment)+scene disambiguation.
//   node scripts/entity-read/probe-toc.mjs 21308
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const doc = +process.argv[2] || 21308;
const cols = await queryAll(`PRAGMA table_info(content)`, []);
console.log('content columns:', cols.map((c) => c.name).join(', '));
const bt = await queryAll(`SELECT blocktype, COUNT(*) n FROM content WHERE doc_id=? AND deleted_at IS NULL GROUP BY blocktype`, [doc]);
console.log('blocktypes:', bt.map((b) => `${b.blocktype}=${b.n}`).join(', '));
// any heading/level-bearing columns?
for (const c of ['heading', 'heading_level', 'level', 'depth', 'html', 'raw', 'markdown', 'attrs', 'meta', 'metadata']) if (cols.find((x) => x.name === c)) {
  const s = await queryAll(`SELECT ${c} v FROM content WHERE doc_id=? AND deleted_at IS NULL AND ${c} IS NOT NULL AND ${c}!='' LIMIT 3`, [doc]);
  if (s.length) console.log(`\ncol '${c}' samples:`, s.map((r) => JSON.stringify(String(r.v).slice(0, 120))).join('  '));
}
// does the raw text carry markdown/html heading markers (#, <h1>)?
const marks = await queryAll(`SELECT external_para_id pid, substr(text,1,90) t FROM content WHERE doc_id=? AND deleted_at IS NULL AND (text LIKE '#%' OR text LIKE '<h%' OR text LIKE '%<h1%' OR text LIKE '%<h2%' OR text LIKE '%<h3%') ORDER BY paragraph_index LIMIT 12`, [doc]);
console.log(`\nparagraphs with #/<h markers: ${marks.length}`); marks.forEach((m) => console.log(`  ${m.pid}: ${m.t}`));
// unique headings that look like CHAPTER titles (no leading 'a.'/'His'/'The account', short, Title Case or Roman)
const heads = await queryAll(`SELECT DISTINCT heading h, MIN(paragraph_index) idx FROM content WHERE doc_id=? AND deleted_at IS NULL AND blocktype='paragraph' AND heading IS NOT NULL AND heading!='' GROUP BY heading ORDER BY idx`, [doc]);
console.log(`\ndistinct paragraph headings: ${heads.length}. First-letter pattern of each (to spot hierarchy):`);
const roman = heads.filter((h) => /^(chapter\s+)?[IVXLC]+\b|^[0-9]+\.|^chapter/i.test(h.h));
console.log(`  heading-strings matching chapter/roman/number pattern: ${roman.length}`);
roman.slice(0, 40).forEach((h) => console.log(`    idx ${h.idx}: ${h.h.slice(0, 70)}`));
process.exit(0);
