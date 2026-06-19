// Export the current entity seed as a compact roster for resolve-against-seed gather agents.
// DB (and later books) must reuse the seed's EXACT canonical_name when a mention is already known,
// so new books attach mentions to existing entities instead of creating transliteration duplicates.
// Writes tmp/entity-research/seed-roster.txt (one line per entity: TYPE | canonical | aliases…).
// Persons first (the priority type), then groups, works, places. Run from project root.
import { writeFileSync } from 'fs';
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {queryAll} = await import('../../../api/lib/db.js');
const rows = await queryAll("SELECT canonical_name, entity_type, aliases, name_meaning FROM entity_research ORDER BY entity_type, canonical_name");
const ORDER = {person:0, group:1, work:2, place:3};
rows.sort((a,b)=> (ORDER[a.entity_type]??9)-(ORDER[b.entity_type]??9) || a.canonical_name.localeCompare(b.canonical_name));
const lines = [];
let lastType = null;
for (const r of rows) {
  if (r.entity_type !== lastType) { lines.push(`\n### ${r.entity_type.toUpperCase()}S`); lastType = r.entity_type; }
  let al = [];
  try { al = JSON.parse(r.aliases||'[]'); } catch {}
  // drop the canonical itself + native-script (agents match on transliterated forms); keep distinct display aliases
  al = al.filter(a => a && a !== r.canonical_name && /[A-Za-z]/.test(a)).slice(0, 6);
  lines.push(`${r.canonical_name}${al.length? '  «'+al.join(' | ')+'»':''}`);
}
const out = `SEED ROSTER (${rows.length} entities) — reuse these EXACT canonical names for known mentions.\n` +
  `Transliteration varies (Ḥusayn=Husayn, Sádiq=Sadiq, ‘=’='); match by sound/identity, not exact glyphs.\n` +
  lines.join('\n') + '\n';
writeFileSync('tmp/entity-research/seed-roster.txt', out);
console.log(`roster written: ${rows.length} entities, ${out.length} bytes -> tmp/entity-research/seed-roster.txt`);
process.exit(0);
