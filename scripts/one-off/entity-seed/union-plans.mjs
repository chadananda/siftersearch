// Combine the two independent AI dedup-analysis plans (dedup-analysis-A/B.json) into one merge plan.
// This is plan ASSEMBLY only — every merge decision was made by the AI passes reasoning about
// identity. Union-find joins groups that share any name; keeper = the member with the most mentions
// (fallback longest name). Writes db-dedup-final.json (merge-dedup format) and prints clusters for review.
import { readFileSync, writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll, graphQueryAll} = await import('../../../api/lib/db.js');
const A = JSON.parse(readFileSync('tmp/entity-research/dedup-analysis-A.json','utf8'));
const B = JSON.parse(readFileSync('tmp/entity-research/dedup-analysis-B.json','utf8'));
const groups = [...A, ...B].map(g => [g.keeper, ...(g.merged||[])].filter(Boolean));

const parent = {};
const find = x => { parent[x] = parent[x] || x; while (parent[x] !== x) { parent[x] = parent[parent[x]] || parent[x]; x = parent[x]; } return x; };
const uni = (a,b) => { parent[find(a)] = find(b); };
for (const g of groups) for (let i=1;i<g.length;i++) uni(g[0], g[i]);
const clusters = {};
for (const n of new Set(groups.flat())) (clusters[find(n)] = clusters[find(n)] || []).push(n);

// mentions per person (graph.db) for keeper selection
const ge = await queryAll("SELECT id, canonical_name FROM graph_entities WHERE entity_type='person' AND religion=''");
const geId = new Map(ge.map(g=>[g.canonical_name, g.id]));
const mc = await graphQueryAll("SELECT entity_id, COUNT(*) AS n FROM entity_mentions GROUP BY entity_id");
const mById = new Map(mc.map(m=>[m.entity_id, m.n]));
const ments = n => mById.get(geId.get(n)) || 0;
// which names each pass agreed on (both = higher confidence)
const inA = new Set(A.flatMap(g=>[g.keeper,...(g.merged||[])]));
const inB = new Set(B.flatMap(g=>[g.keeper,...(g.merged||[])]));

const plan = [];
for (const c of Object.values(clusters).filter(c=>c.length>1)) {
  const sorted = [...c].sort((a,b)=> ments(b)-ments(a) || b.length-a.length);
  const keeper = sorted[0];
  plan.push({ entity_type:'person', keeper, merged: sorted.slice(1), reason:'AI dedup union (A+B)' });
}
writeFileSync('tmp/entity-research/db-dedup-final.json', JSON.stringify(plan, null, 1));
console.log(`clusters=${plan.length} merges=${plan.reduce((s,p)=>s+p.merged.length,0)}\n`);
for (const p of plan) {
  const both = (n)=> (inA.has(n)&&inB.has(n))?'*':' ';
  console.log(`KEEP ${both(p.keeper)}${p.keeper} (${ments(p.keeper)}m)`);
  for (const m of p.merged) console.log(`   <-${both(m)}${m} (${ments(m)}m)`);
}
process.exit(0);
