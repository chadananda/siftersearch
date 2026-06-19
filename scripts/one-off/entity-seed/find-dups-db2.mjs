// Second-pass duplicate finder. The first finder keyed on the full normalized name with only
// COMMA/paren epithets stripped, so it missed dups where the SAME epithet is attached as a nisba-
// style suffix on one entry ("Abu'l-Qásim-i-Qá'im-Maqám") and a comma appositive on another
// ("Abu'l-Qásim, the Qá'im-Maqám"). This keys on the CORE given name: strip leading honorifics,
// then cut at the first comma, paren, OR "-i-"/"-y-i-" connector — so all surface forms of one
// person collapse to the same key. Clusters are CANDIDATES only (namesakes share given names too);
// an AI pass adjudicates. Writes tmp/entity-research/db-dup-candidates2.json. TYPE=person to filter.
import { writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll, graphQueryAll} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const TYPE = process.env.TYPE || 'person';

const HON = /^(mirza|mulla|haji|hajji|siyyid|sayyid|aqa|shaykh|sheikh|mir|karbilai|karbila'i|mashhadi|ustad|navvab|nawab|prince|imam|mawlana|the|ibn|abu)\b[\s-]*/;
function coreKey(name){
  let s = normalizeSurface(name);          // diacritics + ayn/hamza folded, lowercased
  s = s.split(/[,(]/)[0];                   // drop comma/paren appositives
  s = s.split(/-i-|-yi-|-y-i-/)[0];         // drop nisba/title suffix after the "-i-" connector
  for (let i=0;i<4;i++){ const t=s.replace(HON,''); if(t===s) break; s=t; }  // strip leading honorifics
  return s.replace(/\s+/g,' ').trim();
}

const rows = await queryAll("SELECT canonical_name, entity_type, description, sources FROM entity_research WHERE entity_type=?", [TYPE]);
const geRows = await queryAll("SELECT id, canonical_name, entity_type FROM graph_entities WHERE religion=''");
const geByName = new Map(geRows.map(g=>[g.canonical_name+' '+g.entity_type, g.id]));
const mc = await graphQueryAll("SELECT entity_id, COUNT(*) AS n FROM entity_mentions GROUP BY entity_id");
const mcById = new Map(mc.map(m=>[m.entity_id, m.n]));

const clusters = new Map();
for (const r of rows) {
  const k = coreKey(r.canonical_name);
  if (k.length < 3) continue;
  if (!clusters.has(k)) clusters.set(k, []);
  const geId = geByName.get(r.canonical_name+' '+r.entity_type);
  clusters.get(k).push({
    canonical: r.canonical_name,
    origin: /Dawn-Breakers/.test(r.sources||'') ? 'DB' : 'seed',
    mentions: geId ? (mcById.get(geId)||0) : 0,
    snippet: (r.description||'').slice(0, 220)
  });
}
const out = [];
for (const [k, members] of clusters) {
  if (members.length < 2) continue;
  if (!members.some(m=>m.origin==='DB')) continue;  // at least one new entry involved
  out.push({ key: k, entity_type: TYPE, members: members.sort((a,b)=>b.mentions-a.mentions) });
}
out.sort((a,b)=> b.members.length - a.members.length);
writeFileSync('tmp/entity-research/db-dup-candidates2.json', JSON.stringify(out, null, 1));
const sizes = out.map(c=>c.members.length);
console.log(`clusters=${out.length} members=${sizes.reduce((a,b)=>a+b,0)} max_cluster=${Math.max(0,...sizes)} (type=${TYPE})`);
console.log('largest: '+out.slice(0,15).map(c=>`${c.key}(${c.members.length})`).join(', '));
process.exit(0);
