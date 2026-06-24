// From the HAND-VERIFIED kinship (kinship_verified:true) collect referenced relatives that are not yet
// entities — clean missing-anchor candidates (the gathered-kinship version was unreliable; this uses only
// verified relations). Read-only -> verified-anchor-candidates.json. Groups by normalized name with the
// relation(s) + source entity, so creation can be approved as a batch.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
const existing = await queryAll("SELECT ge.canonical_name cn, er.aliases a FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person'");
const nameSet = new Set(); for (const e of existing) { nameSet.add(norm(e.cn)); try { for (const x of JSON.parse(e.a || '[]')) nameSet.add(norm(x)); } catch {} }
// known non-cast / titles to skip (Manifestations' relatives already covered, generic descriptors)
const SKIP = /unnamed|unknown|the prophet|prophet muhammad|imám|imam |^lot$|aaron|zipporah|amram|isaac|ishmael|jacob|manasseh|ephraim|fáṭimih$|nargis|shahrbánú|napoleon|louis bonaparte|abdülmecid|abdu'l-majíd \(abd/i;
const rows = await queryAll("SELECT ge.canonical_name cn, ge.importance imp, er.kinship k FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND er.kinship IS NOT NULL AND er.kinship!='[]'");
const cand = new Map();
for (const r of rows) {
  let kin = []; try { kin = JSON.parse(r.k || '[]'); } catch {}
  for (const k of kin) {
    if (!k.who) continue;
    const key = norm(k.who);
    if (!key || key.length < 4 || nameSet.has(key) || SKIP.test(k.who)) continue;
    if (!cand.has(key)) cand.set(key, { name: k.who.replace(/\s*\([^)]*\)\s*$/, '').trim(), refs: [] });
    cand.get(key).refs.push(`${r.cn}:${k.relation}`);
  }
}
const out = [...cand.values()].sort((a, b) => b.refs.length - a.refs.length);
writeFileSync('tmp/entity-research/seqread/verified-anchor-candidates.json', JSON.stringify(out, null, 1));
console.log(`missing-anchor candidates from VERIFIED kinship: ${out.length}\n`);
for (const c of out) console.log(`  ${c.refs.length}×  "${c.name}"  <- ${c.refs.slice(0, 3).join(', ')}`);
process.exit(0);
