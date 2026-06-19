// Remove TRANSLITERATION-VARIANT aliases from entity_research.aliases. A name that only differs
// from the canonical (or another alias) by transliteration is NOT a real alias — matching folds it.
// Equivalence (all the SAME name): accented↔plain vowels (Sádiq=Sadiq), dotted↔plain consonants
// (Ḥusayn=Husayn), and any apostrophe glyph for ayn/hamza (‘ = ' = ʻ = ʼ …). Real aliases are
// genuinely different names/titles (Mullá Sádiq → Ismu'lláhu'l-Asdaq).
// Drops aliases whose fold-key == the canonical's; among aliases sharing a fold-key keeps the
// MOST-PROPER spelling (most diacritics / curly glyphs). Native-script (Arabic) aliases survive
// (different script → distinct key). DRY=1 prints counts + examples. Usage: [DRY=1] node clean-translit-aliases.mjs
import dotenv from 'dotenv'; dotenv.config({path:'.env-secrets'}); dotenv.config({path:'.env-public'});
const {query, queryAll} = await import('../../../api/lib/db.js');
const DRY = process.env.DRY === '1';
// fold-key: strip diacritics (NFD + combining marks) AND the whole ayn/hamza apostrophe class, lowercase.
const APOS = /['`´‘’‛ʻʼʽʹ′]/g;
const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(APOS,'').toLowerCase().replace(/\s+/g,' ').trim();
const stripParen = s => String(s||'').replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
const score = s => [...String(s||'')].filter(c => c.charCodeAt(0) > 127).length; // diacritics + curly glyphs = the proper form
const rows = await queryAll("SELECT canonical_name, entity_type, aliases FROM entity_research WHERE aliases IS NOT NULL AND aliases<>'' AND aliases<>'[]'");
let entChanged=0, dropped=0, kept=0; const samples=[];
for (const r of rows) {
  let arr; try { arr = JSON.parse(r.aliases); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  const canonKeys = new Set([norm(r.canonical_name), norm(stripParen(r.canonical_name))]);
  const bestByKey = new Map(); const orderKeys = []; const drops = [];
  for (const a of arr) {
    if (!a) { drops.push(a); dropped++; continue; }
    const k = norm(a);
    if (canonKeys.has(k)) { drops.push(a); dropped++; continue; }        // pure transliteration variant of the canonical
    if (!bestByKey.has(k)) { bestByKey.set(k, a); orderKeys.push(k); }
    else { dropped++; if (score(a) > score(bestByKey.get(k))) { drops.push(bestByKey.get(k)); bestByKey.set(k, a); } else drops.push(a); } // dup → keep most-proper glyph
  }
  const out = orderKeys.map(k => bestByKey.get(k)); kept += out.length;
  if (out.length !== arr.length) {
    entChanged++;
    if (samples.length < 12) samples.push(`[${r.canonical_name}] dropped: ${JSON.stringify(drops)} | kept: ${JSON.stringify(out)}`);
    if (!DRY) await query("UPDATE entity_research SET aliases=?, updated_at=datetime('now') WHERE canonical_name=? AND entity_type=?", [JSON.stringify(out), r.canonical_name, r.entity_type]);
  }
}
console.log(`${DRY?'[DRY] ':''}entities_changed=${entChanged} translit/dup_aliases_dropped=${dropped} true_aliases_kept=${kept}`);
for (const s of samples) console.log('   '+s);
process.exit(0);
