// Correct the "Mírzá" gloss in name_meaning for PREFIX-Mírzá names. Mírzá BEFORE a name is an
// honorific for an educated gentleman/civil dignitary ("Mr."); only Mírzá AFTER a name (‘Abbás Mírzá)
// means "prince". The native-script pass mis-glossed several prefix cases as prince/"after a name".
// Replaces ONLY the leading Mírzá segment (up to the first ';' or ' + '), preserving the rest of the
// meaning. Touches only entities whose canonical_name starts with "Mírzá ". DRY=1 prints. Usage: [DRY=1] node fix-mirza-gloss.mjs
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryAll} = await import('../../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const FIX = 'Mírzá = honorific “Mr.”/gentleman (prefix — an educated civil dignitary, not royalty)';
const rows = await queryAll("SELECT canonical_name, entity_type, name_meaning FROM entity_research WHERE canonical_name LIKE 'Mírzá %' AND name_meaning IS NOT NULL AND name_meaning<>''");
let fixed=0; const samples=[];
for (const r of rows) {
  const m = r.name_meaning;
  if (!/^Mírzá[\s=(]/.test(m)) continue; // only when the meaning leads with a Mírzá gloss
  const semi = m.indexOf(';'); const plus = m.indexOf(' + ');
  let cut = -1;
  if (semi >= 0 && (plus < 0 || semi < plus)) cut = semi;
  else if (plus >= 0) cut = plus;
  const nm = cut >= 0 ? FIX + m.slice(cut) : FIX;
  if (nm === m) continue;
  if (samples.length < 8) samples.push(`[${r.canonical_name}]\n   was: ${m.slice(0,90)}\n   now: ${nm.slice(0,90)}`);
  if (!DRY) {
    await query("UPDATE entity_research SET name_meaning=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [nm, r.canonical_name, r.entity_type]);
    await query("UPDATE graph_entities SET name_meaning=? WHERE canonical_name=? AND entity_type=? AND religion=''", [nm, r.canonical_name, r.entity_type]);
  }
  fixed++;
}
console.log(`${DRY?'[DRY] ':''}mirza_prefix_glosses_fixed=${fixed} / ${rows.length} prefix-Mírzá entities`);
for (const s of samples) console.log(s);
process.exit(0);
