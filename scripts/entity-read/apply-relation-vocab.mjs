// STEP 3b — apply the relation normalization to the gpb-v1 claims: set relation = controlled key, resolve embedded
// person targets → target_entity_id, and seed the relations vocab table. Reversible: writes a rollback file of each
// claim's prior raw relation. Event-title claims get relation='participated-in' with target left null (event-entity
// creation is a separate step). DRY by default; WRITE=1 (+ SIFTER_WRITER_URL) applies. Run ON tower-nas.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll, query } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const BATCH = process.env.BATCH || 'gpb-v1';
const map = JSON.parse(readFileSync('tmp/siftersearch-relation-map.json', 'utf8'));

const VOCAB = { // key → category (the controlled relations table)
  identity: 'also-known-as letter-of-the-living has-title has-station surnamed-by',
  kinship: 'father-of mother-of son-of daughter-of brother-of sister-of wife-of husband-of uncle-of relative-of',
  connection: 'met accompanied companion-of knew hosted host-of visited corresponded-with addressed-by recipient-of interviewed-by taught-by teacher-of converted-by disciple-of follower-of secretary-of member-of associated-with summoned intervened-for recognized',
  event: 'participated-in',
  office: 'held-office appointed-by ruler-of governor-of cleric custodian-of successor-of',
  death: 'martyred killed executed died imprisoned exiled persecuted buried-in',
  allegiance: 'believer covenant-breaker opponent pioneer',
  characterization: 'characterized-as testified-about praised-by condemned-by prophesied prophesied-by mentioned-in compared-to decreed honored-by significance',
};
const CTRL = new Set(Object.values(VOCAB).flatMap((s) => s.split(' ')));
const catOf = (k) => Object.entries(VOCAB).find(([, ks]) => ks.split(' ').includes(k))?.[0] || 'characterization';
const norm = (m) => { if (m.is_event) return 'participated-in'; return CTRL.has(m.key) ? m.key : 'characterized-as'; };

const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”.\-]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
// person resolver: canonical + aliases → id
const ents = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.aliases FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'`);
const byName = new Map();
for (const e of ents) { const add = (s) => { const k = nrm(s); if (k && !byName.has(k)) byName.set(k, e.id); }; add(e.cn); try { for (const a of JSON.parse(e.aliases || '[]')) add(a); } catch { /* */ } }
const resolve = (name) => name ? (byName.get(nrm(name)) || null) : null;

const claims = await queryAll(`SELECT id, relation, statement FROM entity_claims WHERE import_batch=?`, [BATCH]);
let tgtResolved = 0, tgtUnresolved = 0, evented = 0; const unresolvedNames = {};
const updates = [];
for (const c of claims) {
  const m = map[c.relation]; if (!m) continue;
  const key = norm(m);
  let target = null;
  if (m.is_event) evented++;
  else if (m.target) { target = resolve(m.target); if (target) tgtResolved++; else { tgtUnresolved++; unresolvedNames[m.target] = (unresolvedNames[m.target] || 0) + 1; } }
  updates.push({ id: c.id, rawRel: c.relation, key, target });
}
console.log(`claims: ${claims.length}`);
console.log(`  person targets resolved → id: ${tgtResolved}   unresolved: ${tgtUnresolved}`);
console.log(`  event (participated-in, target deferred): ${evented}`);
console.log(`  top unresolved target names:`);
for (const [n, k] of Object.entries(unresolvedNames).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`     ${String(k).padStart(3)}  ${n}`);
console.log(`  relations vocab to seed: ${CTRL.size} keys`);

if (!WRITE) { console.log(`\nDRY — set WRITE=1 (with SIFTER_WRITER_URL) to apply.`); process.exit(0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wr = async (sql, p) => { for (let i = 0; i < 4; i++) { try { return await query(sql, p); } catch (e) { if (i === 3) throw e; await sleep(500 * (i + 1)); } } };
writeFileSync(`/home/chad/sifter/siftersearch/siftersearch-relation-rollback-${BATCH}.json`, JSON.stringify(updates.map((u) => ({ id: u.id, rawRel: u.rawRel }))));
console.log('rollback written.');
for (const cat of Object.keys(VOCAB)) for (const k of VOCAB[cat].split(' ')) await wr(`INSERT OR IGNORE INTO relations (key,label,category) VALUES (?,?,?)`, [k, k.replace(/-/g, ' '), cat]);
let w = 0;
for (const u of updates) { await wr(`UPDATE entity_claims SET relation=?, target_entity_id=? WHERE id=?`, [u.key, u.target, u.id]); if (++w % 400 === 0) { console.log(`  ${w}/${updates.length}`); await sleep(15); } }
console.log(`DONE — ${w} claims normalized, relations vocab seeded (${CTRL.size} keys)`);
process.exit(0);
