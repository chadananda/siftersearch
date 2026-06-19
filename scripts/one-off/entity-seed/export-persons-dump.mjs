// Pure DATA DUMP of every person entity (no dedup logic) for AI dedup analysis. One line per entity:
//   #<idx> | <origin>,<mentions>m | side=.. era=.. | <canonical_name> | aliases: a; b | <desc snippet>
// The dedup decision is made entirely by an AI reading these identities and reasoning about who is who —
// this script only assembles the facts. Writes tmp/entity-research/persons-dump.txt.
import { writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll, graphQueryAll} = await import('../../../api/lib/db.js');
const rows = await queryAll("SELECT canonical_name, sources, side, era, aliases, description FROM entity_research WHERE entity_type='person' ORDER BY canonical_name");
const ge = await queryAll("SELECT id, canonical_name FROM graph_entities WHERE entity_type='person' AND religion=''");
const geId = new Map(ge.map(g=>[g.canonical_name, g.id]));
const mc = await graphQueryAll("SELECT entity_id, COUNT(*) AS n FROM entity_mentions GROUP BY entity_id");
const mById = new Map(mc.map(m=>[m.entity_id, m.n]));
const lines = rows.map((r, i) => {
  const origin = /Dawn-Breakers/.test(r.sources||'') ? 'DB' : 'seed';
  const ments = mById.get(geId.get(r.canonical_name)) || 0;
  let al = []; try { al = JSON.parse(r.aliases||'[]').filter(a=>a && a!==r.canonical_name); } catch {}
  const aliases = al.length ? ' | aliases: ' + al.join('; ') : '';
  const desc = (r.description||'').replace(/\s+/g,' ').slice(0, 260);
  return `#${i} | ${origin},${ments}m | side=${r.side||''} era=${r.era||''} | ${r.canonical_name}${aliases} | ${desc}`;
});
writeFileSync('tmp/entity-research/persons-dump.txt', lines.join('\n') + '\n');
console.log(`persons dumped: ${rows.length} (DB=${rows.filter(r=>/Dawn-Breakers/.test(r.sources||'')).length}) -> tmp/entity-research/persons-dump.txt`);
process.exit(0);
