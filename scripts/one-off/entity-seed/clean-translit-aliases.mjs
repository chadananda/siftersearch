// Remove TRANSLITERATION-VARIANT aliases from entity_research.aliases. A name that only differs
// from the canonical by transliteration ("Mulla Sadiq" vs "Mullá Sádiq", "Ḵhán" vs "Khán") is NOT a
// real alias — normalizeSurface (NFD + strip combining marks) and Meili de-accenting already match
// these. Real aliases are genuinely different names/titles ("Mullá Sádiq" → "Ismu'lláhu'l-Asdaq").
// Drops: aliases whose norm == norm(canonical) / norm(stripParen(canonical)); and intra-list dups
// sharing a surface_norm (keeps the first = most-diacritized form). Keeps all distinct names.
// DRY=1 prints counts + examples. Usage: [DRY=1] node clean-translit-aliases.mjs
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryAll} = await import('../../../api/lib/db.js');
const DRY = process.env.DRY === '1';
const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[‘’'`]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const stripParen = s => String(s||'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
const rows = await queryAll("SELECT canonical_name, entity_type, aliases FROM entity_research WHERE aliases IS NOT NULL AND aliases<>'' AND aliases<>'[]'");
let entChanged=0, dropped=0, kept=0; const samples=[];
for (const r of rows) {
  let arr; try { arr = JSON.parse(r.aliases); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  const canonNorms = new Set([norm(r.canonical_name), norm(stripParen(r.canonical_name))]);
  const seen = new Set(); const out = []; const drops = [];
  for (const a of arr) {
    const n = norm(a);
    if (!a || canonNorms.has(n) || seen.has(n)) { drops.push(a); dropped++; continue; }
    seen.add(n); out.push(a); kept++;
  }
  if (out.length !== arr.length) {
    entChanged++;
    if (samples.length < 12) samples.push(`[${r.canonical_name}] dropped: ${JSON.stringify(drops)} | kept: ${JSON.stringify(out)}`);
    if (!DRY) await query("UPDATE entity_research SET aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [JSON.stringify(out), r.canonical_name, r.entity_type]);
  }
}
console.log(`${DRY?'[DRY] ':''}entities_changed=${entChanged} translit/dup_aliases_dropped=${dropped} true_aliases_kept=${kept}`);
for (const s of samples) console.log('   '+s);
process.exit(0);
