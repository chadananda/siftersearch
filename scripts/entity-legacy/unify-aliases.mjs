// Unify the two divergent alias stores into the typed entity_aliases_v2 shape. Reads graph.db.entity_aliases
// (56k, normalized, has provenance) + sifter.db er.aliases JSON (6.4k) + each entity's canonical name (is_display).
// Computes surface_norm, script_key (Arabic/Persian match key), phonetic_key (transliteration blocking key), and a
// best-effort kind (name/title/epithet/translit). Dedups by (entity_id, surface_norm, kind). DRY by default: reports
// metrics + the STORE DIVERGENCE (JSON-only aliases = the higher-risk set; "Muṣṭafá" lived there). WRITE=1 inserts
// into entity_aliases_v2 via the single-writer. Run ON tower-nas.
//   node scripts/entity-read/unify-aliases.mjs                 # dry report
//   SIFTER_WRITER_URL=http://127.0.0.1:7849 WRITE=1 node scripts/entity-read/unify-aliases.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, graphQueryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';

// --- normalization helpers ---
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
const SCRIPT_RE = /[؀-ۿﭐ-﷿ﹰ-﻿]/;   // Arabic/Persian blocks
const isScript = (s) => SCRIPT_RE.test(String(s || ''));
// script_key: strip tashkeel/tatweel/ZWNJ, unify alef/ya/teh-marbuta so spelling variants collapse to one match key
const scriptKey = (s) => !isScript(s) ? null : String(s)
  .replace(/[ً-ْٰـ‌‍]/g, '')
  .replace(/[آأإ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ').trim();
// phonetic_key: consonant-skeleton over the romanization so Sadiq/Sadeq, Muhammad/Mohammad collapse for BLOCKING
const phoneticKey = (norm) => {
  if (!norm || isScript(norm)) return null;
  let t = norm.replace(/[^a-z ]/g, '');
  t = t.replace(/sh|s_h/g, 'S').replace(/kh|k_h/g, 'K').replace(/gh|g_h/g, 'G').replace(/ch/g, 'C').replace(/dh|d_h|th|t_h|zh/g, 'D');
  t = t.replace(/[aeiou]/g, '');                    // drop short vowels (unstable in transliteration)
  t = t.replace(/(.)\1+/g, '$1');                   // collapse doubles
  return t.replace(/\s+/g, '').toLowerCase() || null;
};
const HON = new Set('mirza haji hajji mulla siyyid sayyid aqa shaykh sheikh ustad karbilai hajj'.split(' '));
const kindOf = (surface, norm) => {
  if (isScript(surface)) return 'name';                                   // original-script name form (lang set separately)
  if (/^(the |known as )/i.test(surface) || /^(the )?(master|beloved|blessed|dervish|báb|bab)$/i.test(surface.trim())) return 'epithet';
  const toks = norm.split(/[ -]/).filter(Boolean);                        // split hyphens too (Qurbán-‘Alí = a NAME, not one token)
  if (toks.length === 1 && !HON.has(toks[0])) return 'title';             // lone non-honorific token → likely a title/epithet (Navváb, Mu'tamid)
  return 'name';
};

// --- load the two stores ---
const gRows = await graphQueryAll(`SELECT entity_id, surface, surface_norm, lang, source, confidence FROM entity_aliases`);
const jRows = await queryAll(`SELECT ge.id entity_id, ge.canonical_name cn, er.aliases al
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE er.aliases IS NOT NULL AND er.aliases NOT IN ('','[]')`);

// unified[entity_id] = Map(dedupKey -> row)
const unified = new Map();
const add = (eid, surface, { lang, source, confidence, is_display }) => {
  if (!surface || !String(surface).trim()) return;
  const norm = nrm(surface); if (!norm) return;
  const kind = kindOf(surface, norm);
  const key = `${norm}|${lang || 'en'}|${kind}`;
  if (!unified.has(eid)) unified.set(eid, new Map());
  const m = unified.get(eid); const prev = m.get(key);
  const row = { entity_id: eid, surface, surface_norm: norm, script_key: scriptKey(surface), phonetic_key: phoneticKey(norm),
    kind, lang: isScript(surface) ? 'fa' : (lang || 'en'), is_display: is_display ? 1 : (prev?.is_display || 0),
    confidence: Math.max(confidence ?? 1, prev?.confidence ?? 0), source: prev ? `${prev.source || ''}+${source || ''}`.replace(/^\+|\+$/g, '') : (source || '') };
  m.set(key, row);
};

// graph.db aliases
const gByEnt = new Map();
for (const r of gRows) { add(r.entity_id, r.surface, { lang: r.lang, source: `graph:${r.source || ''}`, confidence: r.confidence }); (gByEnt.get(r.entity_id) || gByEnt.set(r.entity_id, new Set()).get(r.entity_id)).add(nrm(r.surface)); }
// sifter er.aliases JSON + canonical (is_display)
let jStrings = 0; const jByEnt = new Map();
for (const r of jRows) {
  add(r.entity_id, r.cn, { source: 'canonical', confidence: 1, is_display: 1 });
  let arr = []; try { arr = JSON.parse(r.al); } catch { /* skip */ }
  const set = new Set();
  for (const a of arr) { jStrings++; add(r.entity_id, a, { source: 'json', confidence: 0.9 }); set.add(nrm(a)); }
  jByEnt.set(r.entity_id, set);
}

// --- metrics ---
let unifiedRows = 0, withScript = 0, withPhon = 0, displays = 0; const kinds = {};
for (const m of unified.values()) for (const row of m.values()) { unifiedRows++; if (row.script_key) withScript++; if (row.phonetic_key) withPhon++; if (row.is_display) displays++; kinds[row.kind] = (kinds[row.kind] || 0) + 1; }
// divergence: JSON-only aliases (in er.aliases for an entity but NOT in that entity's graph.db set) — the risk set
const jsonOnly = [];
for (const [eid, jset] of jByEnt) { const g = gByEnt.get(eid) || new Set(); for (const n of jset) if (!g.has(n)) jsonOnly.push({ eid, norm: n }); }

console.log(`graph.db entity_aliases rows : ${gRows.length}`);
console.log(`er.aliases JSON strings      : ${jStrings}  across ${jRows.length} entities`);
console.log(`entities with any alias      : ${unified.size}`);
console.log(`UNIFIED rows (deduped)       : ${unifiedRows}`);
console.log(`  is_display (canonical)     : ${displays}`);
console.log(`  script_key coverage        : ${withScript}`);
console.log(`  phonetic_key coverage      : ${withPhon}`);
console.log(`  kind distribution          : ${JSON.stringify(kinds)}`);
console.log(`\nSTORE DIVERGENCE — JSON-only aliases (not in graph.db for that entity): ${jsonOnly.length}`);
console.log(`  (these are the higher-risk set — the "Muṣṭafá" contamination lived here)`);
for (const x of jsonOnly.slice(0, 25)) console.log(`   [${x.eid}] ${x.norm}`);

console.log(`\nsample unified rows for 1247617 (Mírzá Qurbán-‘Alí):`);
for (const row of (unified.get(1247617)?.values() || [])) console.log(`   ${row.is_display ? '★' : ' '} ${row.kind.padEnd(7)} ${JSON.stringify(row.surface)}  norm=${row.surface_norm}  script=${row.script_key || '-'}  phon=${row.phonetic_key || '-'}`);

if (!WRITE) { console.log(`\nDRY — ${unifiedRows} rows staged for entity_aliases_v2. Set WRITE=1 (with SIFTER_WRITER_URL) to insert.`); process.exit(0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const writeRetry = async (sql, p) => { for (let i = 0; i < 4; i++) { try { return await query(sql, p); } catch (e) { if (i === 3) throw e; await sleep(500 * (i + 1)); } } };
let w = 0;
for (const m of unified.values()) for (const r of m.values()) {
  await writeRetry(`INSERT OR IGNORE INTO entity_aliases_v2 (entity_id,surface,surface_norm,script_key,phonetic_key,kind,lang,is_display,confidence,source,import_batch)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [r.entity_id, r.surface, r.surface_norm, r.script_key, r.phonetic_key, r.kind, r.lang, r.is_display, r.confidence, r.source, 'unify-aliases-v1']);
  if (++w % 500 === 0) { console.log(`  written ${w}/${unifiedRows}`); await sleep(20); }
}
console.log(`DONE — inserted ${w} rows into entity_aliases_v2`);
process.exit(0);
