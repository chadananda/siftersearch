// Apply a canonical-name cleanup plan (gloss removal / proper-form normalization) for DB-created
// entities. Plan = JSON array of {entity_type, from, to}. RENAME is lossless: updates canonical_name
// in entity_research + graph_entities, and keeps the OLD name as an alias (so prior resolution
// surfaces still match). COLLISION-GUARDED: if `to` already exists for that type (and != from),
// the rename is SKIPPED and logged as needs-merge — never silently fold two rows here (that is the
// dedup pass's job, with repoint). DRY=1 prints. Usage: [DRY=1] node clean-canonical.mjs <plan.json>
import { readFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryOne, graphQuery} = await import('../../../api/lib/db.js');
const {normalizeSurface} = await import('../../../api/lib/graph-db.js');
const DRY = process.env.DRY === '1';
const nk = s => String(s).replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const plan = JSON.parse(readFileSync(process.argv[2],'utf8'))
  .filter(c => c && c.from && c.to && c.entity_type && nk(c.from) !== nk(c.to));
let renamed=0, skippedCollision=0, missing=0;
const needMerge=[];
for (const c of plan) {
  const t = c.entity_type;
  const row = await queryOne("SELECT canonical_name FROM entity_research WHERE canonical_name=? AND entity_type=?", [c.from, t]);
  if (!row) { missing++; continue; }
  const clash = await queryOne("SELECT canonical_name FROM entity_research WHERE canonical_name=? AND entity_type=?", [c.to, t]);
  if (clash) { skippedCollision++; needMerge.push({entity_type:t, keeper:c.to, merged:[c.from], reason:'clean-name collision -> fold'}); continue; }
  if (!DRY) {
    // keep old name as alias on the graph entity before renaming
    const ge = await queryOne("SELECT id FROM graph_entities WHERE canonical_name=? AND entity_type=? AND religion='' ORDER BY id LIMIT 1", [c.from, t]);
    if (ge) await graphQuery("INSERT OR IGNORE INTO entity_aliases (entity_id,surface,surface_norm,lang,source,confidence) VALUES (?,?,?, 'en','clean-canonical',1.0)", [ge.id, c.from, normalizeSurface(c.from)]);
    await query("UPDATE entity_research SET canonical_name=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [c.to, c.from, t]);
    await query("UPDATE graph_entities SET canonical_name=?, name=? WHERE canonical_name=? AND entity_type=? AND religion=''", [c.to, c.to, c.from, t]);
  }
  renamed++;
}
console.log(`${DRY?'[DRY] ':''}renamed=${renamed} skipped_collision(->needMerge)=${skippedCollision} missing=${missing} planned=${plan.length}`);
if (needMerge.length) console.log('NEED_MERGE_JSON='+JSON.stringify(needMerge));
process.exit(0);
