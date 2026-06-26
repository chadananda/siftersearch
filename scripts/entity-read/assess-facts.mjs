// Coverage assessment for the cited fact catalog (facts2): how many persons have facts, by importance tier,
// plus verbatim-proof coverage. Read-only. Run: node scripts/entity-read/assess-facts.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const rows = await queryAll(`SELECT ge.importance imp, ge.canonical_name cn, er.research_notes rn
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion='' AND er.summary IS NOT NULL`);
const tierOf = (i) => (i >= 60 ? '60+ ' : i >= 40 ? '40-59' : i >= 20 ? '20-39' : '<20  ');
const B = {}; let withF = 0, empty = 0, totF = 0, q = 0, noq = 0;
const emptyHigh = [];
for (const r of rows) {
  let f = []; try { f = JSON.parse(r.rn || '{}').facts2 || []; } catch {}
  const t = tierOf(r.imp || 0); B[t] ??= { n: 0, withf: 0, facts: 0 };
  B[t].n++;
  if (f.length) { withF++; totF += f.length; B[t].withf++; B[t].facts += f.length; for (const x of f) (x.quote ? q++ : noq++); }
  else { empty++; if ((r.imp || 0) >= 40) emptyHigh.push(`${r.imp} ${r.cn}`); }
}
console.log(`TOTAL ${rows.length} persons · withFacts ${withF} · empty ${empty} · facts ${totF} · proof ${q}/${q + noq} (${Math.round(100 * q / (q + noq || 1))}%)`);
for (const t of ['60+ ', '40-59', '20-39', '<20  ']) if (B[t]) console.log(`  ${t}: ${B[t].withf}/${B[t].n} have facts (${B[t].facts} facts)`);
console.log(`\nHIGH-IMPORTANCE (>=40) with ZERO facts — ${emptyHigh.length}:`);
for (const e of emptyHigh.slice(0, 40)) console.log('  ' + e);
process.exit(0);
