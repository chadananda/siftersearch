// Remove REDUNDANT repeated bracket disambiguations. Within a sentence/fragment, once a referent has
// been disambiguated (e.g. "His [Bahá'u'lláh's]"), later pronouns for the SAME person don't need
// re-bracketing — keep the first, drop the consecutive repeats. A DIFFERENT bracketed referent resets
// the run (so "[A] … [B] … [A]" re-brackets the second A). Fragment boundary ( " … " ) also resets, so
// each extracted statement keeps its own first-mention bracket. Drops the bracket token + its leading
// space, leaving the original pronoun. Syncs entity_research + graph_entities. DRY=1 prints examples.
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryAll} = await import('../../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const FRAG = ' … ';
const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['`´‘’‛ʻʼʽʹ′]/g,'').toLowerCase().replace(/\s+/g,' ').trim().replace(/s$/,''); // fold + strip possessive
const collapse = desc => desc.split(FRAG).map(frag => {
  let last = null;
  return frag.replace(/(\s*)\[([^\]]*)\]/g, (full, sp, content) => {
    const k = norm(content);
    if (k && k === last) return '';   // same referent as the previous kept bracket → redundant
    last = k; return full;            // first of a run (or new referent) → keep
  });
}).join(FRAG);
const rows = await queryAll("SELECT canonical_name, entity_type, description FROM entity_research WHERE description LIKE '%]%' AND description LIKE '%[%'");
let changed=0, removed=0; const samples=[];
for (const r of rows) {
  const before = (r.description.match(/\[[^\]]*\]/g)||[]).length;
  const nd = collapse(r.description);
  const after = (nd.match(/\[[^\]]*\]/g)||[]).length;
  if (nd !== r.description) {
    changed++; removed += (before - after);
    if (samples.length < 6) samples.push(`[${r.canonical_name}] ${before}->${after} brackets`);
    if (!DRY) {
      await query("UPDATE entity_research SET description=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [nd, r.canonical_name, r.entity_type]);
      await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [nd, r.canonical_name, r.entity_type]);
    }
  }
}
console.log(`${DRY?'[DRY] ':''}entities_changed=${changed} redundant_brackets_removed=${removed}`);
for (const s of samples) console.log('   '+s);
process.exit(0);
