// Cleanup-phase map: cluster the Dawn-Breakers PERSON cast by name-core to surface (a) over-splits / namesakes
// needing merge-or-keep adjudication, and (b) fabricated-nisba artifacts — a canonical_name carrying a
// nisba/place the entity's actual mention surface ("DB: <bare name>") never had (e.g. Mírzá Mihdí-i-Iṣfahání
// whose only surface is "Mírzá Mihdí,"). Read-only; writes a worklist for the adjudication step.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const HON = /^(the |that |mulla |mirza |siyyid |haji |aqa |shaykh |karbila'i |mawlana |mir |akhund |ustad |hujjat )+/;
const core = s => { let n = norm(s).replace(/\s*\([^)]*\)\s*$/, '').replace(/,.*$/, ''); let p; do { p = n; n = n.replace(HON, ''); } while (n !== p); return n.replace(/-i-[a-z‘’'-]+$/, '').replace(/ of [a-z‘’'-]+$/, '').trim(); };
const hasNisba = s => /-i-[A-Za-zÁÉÍÓÚáéíóúṬṣḥ’'-]+\s*$|\sof\s[A-Z]/.test(String(s).replace(/\s*\([^)]*\)\s*$/, ''));

const cids = new Set((await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => String(r.id)));
const dbCount = new Map();
for (const m of await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')) if (cids.has(String(m.content_id))) dbCount.set(m.entity_id, (dbCount.get(m.entity_id) || 0) + 1);
const ids = [...dbCount.keys()];
const persons = (await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.description d, er.summary s, er.aliases a FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.entity_type='person' AND ge.id IN (${ids.join(',')})`));

// fabricated-nisba: canonical carries a nisba/place, but the description surface ("DB: X,") is the bare form lacking it
let fabricated = [];
for (const p of persons) {
  const surf = norm((p.d || '').replace(/^DB:\s*/, '').replace(/[.,]\s*$/, ''));
  const canonBare = norm(p.cn.replace(/-i-[^\s]+\s*$/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\sof\s.+$/, ''));
  if (hasNisba(p.cn) && surf && surf === canonBare && /^DB:/.test(p.d || '')) fabricated.push(p);
}
// same-core clusters
const byCore = new Map();
for (const p of persons) { const c = core(p.cn); if (!byCore.has(c)) byCore.set(c, []); byCore.get(c).push(p); }
const clusters = [...byCore.entries()].filter(([, m]) => m.length >= 2).sort((a, b) => b[1].length - a[1].length);

console.log(`persons in cast: ${persons.length}`);
console.log(`same-core clusters (>=2 entities): ${clusters.length}  covering ${clusters.reduce((n, [, m]) => n + m.length, 0)} entities`);
console.log(`fabricated-nisba artifacts (canonical nisba absent from surface): ${fabricated.length}`);
console.log(`\n=== 18 largest same-core clusters ===`);
for (const [c, m] of clusters.slice(0, 18)) console.log(`  "${c}" (${m.length}): ` + m.map(p => `${p.id}/${dbCount.get(p.id)}m ${p.cn}`).join(' | ').slice(0, 200));
console.log(`\n=== sample fabricated-nisba (first 15) ===`);
for (const p of fabricated.slice(0, 15)) console.log(`  ${p.id} "${p.cn}"  <- surface "${p.d}"`);
writeFileSync('tmp/entity-research/seqread/cleanup-clusters.json', JSON.stringify({ clusters: clusters.map(([c, m]) => ({ core: c, members: m.map(p => ({ id: p.id, cn: p.cn, db: dbCount.get(p.id), s: (p.s || p.d || '').slice(0, 120) })) })), fabricated: fabricated.map(p => ({ id: p.id, cn: p.cn, surface: p.d })) }, null, 1));
console.log(`\nwrote cleanup-clusters.json`);
process.exit(0);
