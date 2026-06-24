// Finalize the martyr-list resolution: (a) bind held roster lines to the existing place-tagged entities the
// engine matched; (b) CREATE the genuinely-new bare martyrs as "<name> (martyr of <place>)" storing the one
// known fact. Holds the shaky p793 bind. Reversible (backup taken; new mentions tagged disambig-v1).
// DRY=1 previews. Writes route via SIFTER_WRITER_URL.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { query, queryAll, queryOne, graphQuery, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308, WRITE = process.env.WRITE === '1';
const HOLD = new Set([793]);
const resolve = JSON.parse(readFileSync('tmp/entity-research/seqread/roster-decisions.json', 'utf8'));
const dedup = JSON.parse(readFileSync('tmp/entity-research/seqread/roster-dedup.json', 'utf8'));
const binds = [...resolve.filter(o => o.id).map(o => ({ para: o.para, id: o.id })), ...dedup.binds.map(b => ({ para: b.para, id: b.id }))].filter(b => !HOLD.has(b.para));
const creates = dedup.creates.filter(c => !HOLD.has(c.para));
const cmap = new Map((await queryAll(`SELECT paragraph_index, id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, String(r.id)]));
const bound = new Set((await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')).map(r => r.entity_id + '|' + r.content_id));
let nextId = (await queryOne('SELECT MAX(id) m FROM graph_entities')).m + 1;

let addedBinds = 0, created = 0;
console.log(`binds: ${binds.length} | creates: ${creates.length} (holding p793)`);
for (const b of binds) {
  const cid = cmap.get(b.para); if (!cid || bound.has(b.id + '|' + cid)) continue;
  console.log(`  BIND p${b.para} -> ${b.id}`);
  if (WRITE) await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','disambig-v1')", [b.id, cid, 'subject', 0.9]);
  addedBinds++;
}
for (const c of creates) {
  const canon = `${c.name.replace(/,.*$/, '').trim()} (martyr of ${c.place})`;
  const exists = await queryOne('SELECT id FROM graph_entities WHERE canonical_name=?', [canon]);
  if (exists) { console.log(`  (exists) ${canon}`); continue; }
  const id = nextId++;
  const summary = `Named only in The Dawn-Breakers' list of the martyrs of ${c.place}; no further biographical detail is given in this source. A bare-name roster entry — may be identified or enriched from other histories.`;
  console.log(`  CREATE ${id} "${canon}"`);
  if (WRITE) {
    await query("INSERT INTO entity_research (canonical_name, entity_type, summary, aliases, updated_at) VALUES (?,?,?,?,datetime('now'))", [canon, 'person', summary, JSON.stringify([c.name.replace(/,.*$/, '').trim()])]);
    await query("INSERT INTO graph_entities (id, name, canonical_name, entity_type, religion, description) VALUES (?,?,?,?,?,?)", [id, canon, canon, 'person', '', summary]);
    const cid = cmap.get(c.para); if (cid) await graphQuery("INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','disambig-v1')", [id, cid, 'subject', 0.9]);
  }
  created++;
}
console.log(`\n${WRITE ? 'APPLIED' : '[DRY]'}: ${addedBinds} binds, ${created} new martyr entities`);
process.exit(0);
