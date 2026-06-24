// Apply the disambiguation-prior cards (research-cards.json) to the existing entity_research structured
// fields: union aliases; write kinship/relations/dates; pack supplemental_facts + possible_identifications +
// namesake_firewall + contested + ambiguous into research_notes (JSON). Emits an ANCHOR queue (relatives/
// associates named in cards that are not yet entities) and AUTO-CREATEs those named by >=2 distinct sources
// with a clear relationship (the rest queued). Reversible (backup first). DRY=1 previews. Writes via :7849.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { query, queryOne, queryAll } = await import('../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const cards = JSON.parse(readFileSync('tmp/entity-research/seqread/research-cards.json', 'utf8')).filter(c => !c.error && c.card);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const existing = await queryAll("SELECT id, canonical_name cn, aliases a FROM graph_entities WHERE entity_type='person'");
const nameSet = new Set(); for (const e of existing) { nameSet.add(norm(e.cn)); try { for (const x of JSON.parse(e.a || '[]')) nameSet.add(norm(x)); } catch {} }

let wrote = 0; const anchorVotes = new Map();   // norm(name) -> {name, rels:Set(relation), sources:Set, fromCards:[]}
for (const o of cards) {
  const c = o.card, cn = (await queryOne('SELECT canonical_name FROM graph_entities WHERE id=?', [o.id]))?.canonical_name;
  if (!cn) continue;
  const er = await queryOne("SELECT aliases FROM entity_research WHERE canonical_name=? AND entity_type='person'", [cn]);
  const aliases = new Set(); try { for (const a of JSON.parse(er?.aliases || '[]')) aliases.add(a); } catch {}
  for (const a of (c.aliases || [])) if (a && a !== cn) aliases.add(a);
  // RELIABLE (passage-grounded) fields apply now; kinship/relations are gathered-but-UNVERIFIED (DeepSeek
  // inverts directions / misremembers genealogies), so they go into research_notes as *_gathered and the
  // authoritative kinship/relations/dates COLUMNS are left for the verification pass to populate.
  const notes = { facts: c.supplemental_facts || [], possible_ids: c.possible_identifications || [], firewall: c.namesake_firewall || [], contested: c.contested || [], ambiguous: c.ambiguous || [], places: c.places || [], kinship_gathered: c.kinship || [], relations_gathered: c.relationships || [], timeline_gathered: c.timeline || [], kinship_verified: false };
  if (!DRY) {
    await query(`UPDATE entity_research SET aliases=?, research_notes=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type='person'`,
      [JSON.stringify([...aliases]), JSON.stringify(notes), cn]);
  }
  wrote++;
  // tally anchor candidates from kinship + relationships
  for (const k of (c.kinship || [])) { if (!k.who) continue; const key = norm(k.who); if (nameSet.has(key)) continue; if (!anchorVotes.has(key)) anchorVotes.set(key, { name: k.who, rels: new Set(), sources: new Set(), via: [] }); const v = anchorVotes.get(key); v.rels.add(k.relation); v.sources.add(k.source); v.via.push(`${cn}:${k.relation}`); }
}
// anchors: auto-create when >=2 distinct sources name them; else queue
const create = [], queue = [];
for (const v of anchorVotes.values()) { const rec = { name: v.name, relations: [...v.rels], sources: [...v.sources], via: v.via }; if (v.sources.size >= 2 && v.name.length > 4) create.push(rec); else queue.push(rec); }
writeFileSync('tmp/entity-research/seqread/anchor-create.json', JSON.stringify(create, null, 1));
writeFileSync('tmp/entity-research/seqread/anchor-queue.json', JSON.stringify(queue, null, 1));
console.log(`${DRY ? '[DRY] would write' : 'WROTE'} ${wrote} cards | anchor auto-create (>=2 sources): ${create.length} | queued: ${queue.length}`);
for (const r of create.slice(0, 20)) console.log(`  CREATE? "${r.name}" [${r.relations.join('/')}] sources: ${r.sources.join(', ')}`);
process.exit(0);
