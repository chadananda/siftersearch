// TRIAGE / SURFACING ONLY — decides nothing. Lists person entities whose NAMES look similar
// (share significant tokens and/or are near-identical spellings) so a human or an AI pass can
// INVESTIGATE whether they're the same individual. This is a review aid, NOT a dedup rule:
// the actual same-or-not decision must still be made by reading + reasoning about identity.
// Writes a readable report to tmp/entity-research/similar-names-report.txt.
import { writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll, graphQueryAll} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');

const STOP = new Set(['mirza','mulla','haji','hajji','siyyid','sayyid','aqa','shaykh','sheikh','mir','karbilai',
  "karbila'i",'mashhadi','ustad','navvab','nawab','prince','imam','mawlana','the','of','ibn','bin','son',
  'brother','father','uncle','daughter','sister','wife','mother','and','his','her','khan','big','beg','effendi','pasha','pasa']);
const tokensOf = (name) => {
  let s = normalizeSurface(name).replace(/[(),]/g,' ').replace(/-i-|-yi-|-y-i-/g,' ');
  return new Set(s.split(/\s+/).map(t=>t.replace(/^[-']+|[-']+$/g,'')).filter(t=>t && !STOP.has(t)));
};
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=Array.from({length:n+1},(_,i)=>i);
  for(let i=1;i<=m;i++){let prev=p[0];p[0]=i;for(let j=1;j<=n;j++){const t=p[j];p[j]=Math.min(p[j]+1,p[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t;}}return p[n];}
const editRatio = (a,b)=>{const d=lev(a,b);const L=Math.max(a.length,b.length);return L?1-d/L:1;};
const jac = (A,B)=>{let inter=0;for(const t of A)if(B.has(t))inter++;return inter/(A.size+B.size-inter||1);};

const rows = await queryAll("SELECT canonical_name, sources, description FROM entity_research WHERE entity_type='person'");
const ge = await queryAll("SELECT id, canonical_name FROM graph_entities WHERE entity_type='person' AND religion=''");
const geId = new Map(ge.map(g=>[g.canonical_name, g.id]));
const mc = await graphQueryAll("SELECT entity_id, COUNT(*) AS n FROM entity_mentions GROUP BY entity_id");
const mById = new Map(mc.map(m=>[m.entity_id, m.n]));
const E = rows.map(r=>({name:r.canonical_name, norm:normalizeSurface(r.name||r.canonical_name), toks:tokensOf(r.canonical_name),
  origin:/Dawn-Breakers/.test(r.sources||'')?'DB':'seed', ments:mById.get(geId.get(r.canonical_name))||0,
  desc:(r.description||'').replace(/\s+/g,' ').slice(0,150)}));
E.forEach(e=>{ e.normFull = normalizeSurface(e.name); });

// candidate pairs: only compare entities that share at least one significant token (keeps it tractable)
const byTok = new Map();
E.forEach((e,i)=>{ for(const t of e.toks) { if(!byTok.has(t)) byTok.set(t,[]); byTok.get(t).push(i); } });
const pairSeen = new Set(), flagged = [];
for (const idxs of byTok.values()) {
  for (let a=0;a<idxs.length;a++) for (let b=a+1;b<idxs.length;b++) {
    const i=idxs[a], j=idxs[b], key=i<j?i+'-'+j:j+'-'+i;
    if (pairSeen.has(key)) continue; pairSeen.add(key);
    const J = jac(E[i].toks, E[j].toks), R = editRatio(E[i].normFull, E[j].normFull);
    if (J>=0.6 || R>=0.85) flagged.push([i,j,Math.max(J,R)]);
  }
}
// union-find flagged pairs into clusters
const parent={}; const find=x=>{parent[x]=parent[x]??x;while(parent[x]!==x){parent[x]=parent[parent[x]]??parent[x];x=parent[x];}return x;};
for(const [i,j] of flagged){parent[find(i)]=find(j);}
const score=new Map(); for(const [i,j,s] of flagged){for(const x of [i,j]){const r=find(x);score.set(r,Math.max(score.get(r)||0,s));}}
const clusters=new Map(); for(const [i,j] of flagged){for(const x of [i,j]){const r=find(x);if(!clusters.has(r))clusters.set(r,new Set());clusters.get(r).add(x);}}
const out=[...clusters.entries()].map(([r,set])=>({s:score.get(r)||0,members:[...set]})).filter(c=>c.members.length>1)
  .sort((a,b)=>b.s-a.s);

const lines=[`POSSIBLE-DUPLICATE TRIAGE — ${out.length} groups of name-similar persons to INVESTIGATE (not auto-merged).`,
  `Each group: names that look alike by tokens/spelling. Decide same-or-distinct by reading the descriptions.`,''];
out.forEach((c,n)=>{
  lines.push(`#${n+1}  (similarity ${(c.s).toFixed(2)})`);
  c.members.sort((x,y)=>E[y].ments-E[x].ments).forEach(i=>lines.push(`   [${E[i].origin},${E[i].ments}m] ${E[i].name}  —  ${E[i].desc}`));
  lines.push('');
});
writeFileSync('tmp/entity-research/similar-names-report.txt', lines.join('\n'));
console.log(`similar-name groups=${out.length} (persons involved=${out.reduce((s,c)=>s+c.members.length,0)}) -> tmp/entity-research/similar-names-report.txt`);
console.log('top groups:'); out.slice(0,18).forEach((c,n)=>console.log(`#${n+1} ${(c.s).toFixed(2)}: ${c.members.map(i=>E[i].name+' ('+E[i].ments+'m)').join('  |  ')}`));
process.exit(0);
