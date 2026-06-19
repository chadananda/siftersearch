// Data dump for the enrichment fleet: every person with the SIGNALS an importance score reasons over
// (mentions, #distinct-books, relationship-degree) plus current aliases/era/side and the existing
// description (so the agent knows what GPB already supplies and only adds characterizations otherwise).
// One JSON object per line (JSONL). Writes tmp/entity-research/persons-enrich.jsonl. No scoring logic here.
import { writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll, graphQueryAll} = await import('../../../api/lib/db.js');
const BOOK = {21310:'GPB',21308:'DB'};
const rows = await queryAll("SELECT canonical_name, sources, side, aliases, description FROM entity_research WHERE entity_type='person' ORDER BY canonical_name");
const ge = await queryAll("SELECT id, canonical_name, era FROM graph_entities WHERE entity_type='person' AND religion=''");
const geId = new Map(ge.map(g=>[g.canonical_name, g.id])); const geEra = new Map(ge.map(g=>[g.canonical_name, g.era]));
const rel = await queryAll("SELECT source_entity_id AS a, target_entity_id AS b FROM graph_relations");
const degree = new Map(); for (const r of rel){ degree.set(r.a,(degree.get(r.a)||0)+1); degree.set(r.b,(degree.get(r.b)||0)+1); }
const ments = await graphQueryAll("SELECT entity_id, content_id FROM entity_mentions");
// map content_id -> doc_id (sifter.db content)
const cids = [...new Set(ments.map(m=>parseInt(m.content_id,10)).filter(Number.isFinite))];
const docOf = new Map();
for (let i=0;i<cids.length;i+=800){ const ch=cids.slice(i,i+800);
  for (const c of await queryAll(`SELECT id, doc_id FROM content WHERE id IN (${ch.map(()=>'?').join(',')})`, ch)) docOf.set(Number(c.id), c.doc_id); }
const mByE = new Map(), booksByE = new Map();
for (const m of ments){ const e=Number(m.entity_id); mByE.set(e,(mByE.get(e)||0)+1);
  const d=docOf.get(parseInt(m.content_id,10)); if(d!=null){ if(!booksByE.has(e)) booksByE.set(e,new Set()); booksByE.get(e).add(d); } }
const out = rows.map(r=>{
  const id = geId.get(r.canonical_name);
  let al=[]; try{ al=JSON.parse(r.aliases||'[]').filter(a=>a&&a!==r.canonical_name); }catch{}
  const books=[...(booksByE.get(id)||[])].map(d=>BOOK[d]||('#'+d));
  return JSON.stringify({
    name:r.canonical_name, aliases:al, mentions:mByE.get(id)||0, books, rel_degree:degree.get(id)||0,
    side:r.side||'', era:geEra.get(r.canonical_name)||'', has_desc:!!(r.description&&r.description.trim()),
    desc:(r.description||'').replace(/\s+/g,' ').slice(0,400)
  });
});
writeFileSync('tmp/entity-research/persons-enrich.jsonl', out.join('\n')+'\n');
console.log(`persons=${rows.length} -> tmp/entity-research/persons-enrich.jsonl`);
process.exit(0);
