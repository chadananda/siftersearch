// CONFLATION detector — the inverse of merge: a single entity that bare-name matching fused from MULTIPLE people.
// Signal: the entity's own aliases + claim statements carry ≥2 DISTINCT nisbas (place-of-origin), e.g. one record
// holding "-i-Mans̱hádí", "of Iṣfahán", and a Ṭabarsí martyr. Different nisbas = different people ([[feedback_nisba_disconflation]]).
// Read-only; reports the blast radius + examples so we can build a split-review. Run ON tower-nas.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll } = await import('../../api/lib/db.js');
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
// nisba stem: strip a trailing adjectival -i so Manshádí≡Manshád, Iṣfahání≡Iṣfahán
const stem = (s) => { let t = nrm(s); if (t.length > 4 && t.endsWith('i')) t = t.slice(0, -1); return t; };
const STOP = new Set('the his her their god akka akká bahaullah bab cause faith lord one his'.split(' '));
const nisbasOf = (text) => { const out = new Set();
  for (const m of String(text).matchAll(/-i-([A-Za-zÀ-ÿ’']{4,})/g)) out.add(stem(m[1]));                 // "-i-Manshádí"
  for (const m of String(text).matchAll(/\bof ([A-ZÀ-Ý][A-Za-zÀ-ÿ’']{3,})/g)) out.add(stem(m[1]));        // "of Iṣfahán"
  return new Set([...out].filter((n) => n && n.length >= 4 && !STOP.has(n))); };

const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const claimRows = await queryAll(`SELECT entity_id, statement FROM entity_claims WHERE import_batch IN ('gpb-v1','db-v1')`);
const stmtBy = new Map(); for (const c of claimRows) { if (!stmtBy.has(c.entity_id)) stmtBy.set(c.entity_id, []); stmtBy.get(c.entity_id).push(c.statement); }

const flagged = [];
for (const r of rows) {
  let al = []; try { al = JSON.parse(r.aliases || '[]'); } catch { /* */ }
  const texts = [r.cn, ...al, ...(stmtBy.get(r.id) || [])];
  const nis = new Set(); for (const t of texts) for (const n of nisbasOf(t)) nis.add(n);
  if (nis.size >= 2) flagged.push({ id: r.id, cn: r.cn, nisbas: [...nis], nAlias: al.length, nClaims: (stmtBy.get(r.id) || []).length });
}
flagged.sort((a, b) => b.nisbas.length - a.nisbas.length || b.nClaims - a.nClaims);
console.log(`person entities: ${rows.length}`);
console.log(`CONFLATION-FLAGGED (≥2 distinct nisbas in own aliases/claims): ${flagged.length}`);
console.log(`\ntop flagged (nisbas · #aliases · #claims):`);
for (const f of flagged.slice(0, 30)) console.log(`  [${f.id}] ${f.cn}\n        nisbas: ${f.nisbas.join(', ')}  (${f.nAlias} aliases, ${f.nClaims} claims)`);
process.exit(0);
