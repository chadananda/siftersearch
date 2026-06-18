// Read-only: report exact-base duplicate-candidate clusters in entity_research.
// Base-normalize = lowercase, unify apostrophes, strip parentheticals + diacritics, collapse ws.
// Clusters of size>1 sharing a base name are likely (not certain) the same entity — feed to AI adjudication.
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll} = await import('../../../api/lib/db.js');
const rows = await queryAll("SELECT id, canonical_name, entity_type, LENGTH(description) AS dlen FROM entity_research ORDER BY id");
const base = s => s
  .replace(/[’'‘`]/g,"'")
  .replace(/\([^)]*\)/g,' ')
  .normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[_]/g,'')
  .toLowerCase().replace(/[^a-z0-9' ]/g,' ').replace(/\s+/g,' ').trim();
const groups = new Map();
for (const r of rows) { const k = r.entity_type+'|'+base(r.canonical_name); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(r); }
let n=0;
for (const [k,g] of groups) { if (g.length>1) { n++; console.log('### '+k); for (const r of g) console.log('   ['+r.id+'] '+r.entity_type+' :: '+r.canonical_name+'  (desc '+r.dlen+')'); } }
console.log('=== exact-base dup clusters: '+n+' / total entities: '+rows.length);
process.exit(0);
