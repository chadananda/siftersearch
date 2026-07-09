// Nisba-conflation audit (read-only): flag person entities whose canonical_name + aliases carry TWO OR MORE
// incompatible nisbas (place-of-origin suffixes) — a sign two distinct people were merged. Different nisbas =
// different people (nisbas rarely vary), EXCEPT a verified big-city/nearby-village pair (e.g. Qazvín/Baraghán).
// Run: node scripts/entity-read/audit-nisba.mjs
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ]/g, '').toLowerCase();
// nisba = the place-adjective in the "<name>-i-<Nisba>" (or "…y-i-…") construct; also a trailing "-i" place word
const nisbasOf = (name) => {
  const out = new Set();
  for (const m of String(name).matchAll(/[-y]i-([A-ZÁÉÍÓÚÀ-ÿ][A-Za-zÀ-ÿ’'-]{3,})/g)) out.add(norm(m[1]).replace(/[^a-z]/g, ''));
  return out;
};
// verified same-person nisba pairs (big city + nearby village/region) — not conflations
const ALLOWED = [['qazvini', 'baraghani'], ['baraghani', 'qazvini'], ['tihrani', 'nuri'], ['nuri', 'mazindarani']];
const okPair = (a, b) => ALLOWED.some(([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)));

const people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.aliases
  FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion=''`);
let flagged = 0;
for (const p of people) {
  let aliases = []; try { aliases = JSON.parse(p.a || p.aliases || '[]'); } catch {}
  const nis = new Set([...nisbasOf(p.cn)]);
  for (const a of aliases) for (const n of nisbasOf(a)) nis.add(n);
  const list = [...nis].filter(Boolean);
  if (list.length < 2) continue;
  // pairwise: any two distinct nisbas that are not an allowed city/village pair?
  let conflict = false;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (list[i] !== list[j] && !list[i].includes(list[j]) && !list[j].includes(list[i]) && !okPair(list[i], list[j])) conflict = true;
  }
  if (conflict) { flagged++; console.log(`  [${String(p.imp || 0).padStart(3)}] ${p.id} ${p.cn}  ::nisbas:: ${list.join(', ')}`); }
}
console.log(`\n${flagged} entities flagged with incompatible nisbas (of ${people.length} persons)`);
process.exit(0);
