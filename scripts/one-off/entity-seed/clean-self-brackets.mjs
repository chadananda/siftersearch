// Remove SELF-referential bracket annotations from entity descriptions. The bracketing pass
// over-inserted brackets that resolve a pronoun to the entity's OWN name (clutter — the entry
// is already about that person). We keep only brackets that resolve to OTHER entities.
// A bracket "[X]" is self-referential if nk(X, sans possessive) matches the entity's own
// canonical_name / alias (exact, or whole-name containment either direction, len>=4).
// Removes the "[X]" token AND its preceding space; leaves the original pronoun + all other text.
// DRY=1 prints counts only. SHOW="<canonical>" prints that entity's before/after. Usage: [DRY=1] node clean-self-brackets.mjs
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryAll} = await import('../../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const SHOW = process.env.SHOW || '';
const nk = s => String(s||'').replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const stripParen = s => String(s||'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
const rows = await queryAll("SELECT canonical_name, entity_type, aliases, description FROM entity_research WHERE description LIKE '%[%]%'");
let changed=0, removed=0, kept=0;
for (const r of rows) {
  const canon = nk(stripParen(r.canonical_name));
  const selfNames = new Set([nk(r.canonical_name), canon]);
  try { for (const a of JSON.parse(r.aliases||'[]')) { selfNames.add(nk(a)); selfNames.add(nk(stripParen(a))); } } catch {}
  let rm=0, kp=0;
  const nd = r.description.replace(/\s*\[([^\]]*)\]/g, (m, content) => {
    const cc = nk(content).replace(/'s$/,'').trim();
    const isSelf = cc.length>=3 && (selfNames.has(cc) || (canon.length>=4 && (canon.includes(cc) || cc.includes(canon))));
    if (isSelf) { rm++; return ''; }
    kp++; return m;
  });
  kept += kp;
  if (nd !== r.description) {
    removed += rm; changed++;
    if (SHOW && nk(r.canonical_name) === nk(SHOW)) { console.log('--- BEFORE ---\n'+r.description+'\n--- AFTER ---\n'+nd+'\n'); }
    if (!DRY) {
      await query("UPDATE entity_research SET description=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [nd, r.canonical_name, r.entity_type]);
      await query("UPDATE graph_entities SET description=? WHERE canonical_name=? AND entity_type=? AND religion=''", [nd, r.canonical_name, r.entity_type]);
    }
  }
}
console.log(`${DRY?'[DRY] ':''}entities_changed=${changed} self_brackets_removed=${removed} other_brackets_kept=${kept}`);
process.exit(0);
