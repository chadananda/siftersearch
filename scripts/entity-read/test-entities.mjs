// Self-test battery for this session's corrections (queries the entity DB, not text search).
// Asserts the period-split viziers/shahs, the de-conflated intro, the ‘Abdu'l-Vahháb merge, and a regression
// on the Quddús-martyrdom betrayer scene. Reports PASS/FAIL with evidence.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const { queryAll, queryOne, graphQueryAll } = await import('../../api/lib/db.js');
const cmap = new Map((await queryAll('SELECT id,paragraph_index FROM content WHERE doc_id=21308')).map(r => [String(r.id), r.paragraph_index]));
const parasOf = async id => (await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=? AND extractor_version='seqread-v1'", [id])).map(r => cmap.get(String(r.content_id))).filter(p => p != null).sort((a, b) => a - b);
const nameOf = async id => (await queryOne("SELECT canonical_name FROM graph_entities WHERE id=?", [id]))?.canonical_name;
let pass = 0, fail = 0;
const check = (label, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); ok ? pass++ : fail++; };

// 1. Amír Kabir gets the Báb's-execution-era binds; the misbind paras moved off Áqá Khán-i-Núrí
const kabir = await parasOf(1247568), nuri = await parasOf(1247946);
check('Amír Kabir (1247568) richly bound (>40)', kabir.length > 40, `${kabir.length} paras`);
check('p1129/1982/1986 are Amír Kabir, NOT Áqá Khán-i-Núrí', [1129, 1982, 1986].every(p => kabir.includes(p) && !nuri.includes(p)), `kabir has=${[1129, 1982, 1986].filter(p => kabir.includes(p))}`);
check('Áqá Khán-i-Núrí keeps the 1852 Síyáh-Chál cluster (p1375)', nuri.includes(1375), `núri paras=${nuri.slice(0, 6)}…`);

// 2. Two/three monarchs distinct; intro de-conflated
const nasiri = await parasOf(1247566), muh = await parasOf(1247565), fath = await parasOf(1247687);
check('Náṣiri’d-Dín intro generics unbound (no p47/50/64)', ![47, 50, 64].some(p => nasiri.includes(p)), `nasiri=${nasiri}`);
check('Náṣiri’d-Dín keeps p52 (his European travels)', nasiri.includes(52) || nasiri.includes(41), `nasiri=${nasiri}`);
check('Fatḥ-‘Alí Sháh bound to the Shaykh-Aḥmad scenes (p113/117)', [113, 117].some(p => fath.includes(p)), `fath=${fath}`);
check('Muḥammad Sháh ≠ Náṣiri’d-Dín (disjoint binds)', !muh.some(p => nasiri.includes(p)) && muh.length > 0, `muh=${muh.slice(0, 8)}`);

// 3. ‘Abdu'l-Vahháb merge: martyr whole, assassin separate, dup gone
const vahhab = await parasOf(1249228);
check('‘Abdu’l-Vahháb martyr (1249228) consolidated (≥8 mentions)', (await graphQueryAll("SELECT COUNT(*) n FROM entity_mentions WHERE entity_id=1249228"))[0].n >= 8);
check('martyr covers the Síyáh-Chál scene (p1369/1370)', vahhab.some(p => p === 1369 || p === 1370 || (p >= 1369 && p <= 1372)), `vahhab=${vahhab}`);
check('assassin 1250012 still a separate entity', !!(await nameOf(1250012)));
check('duplicate 1249589 removed', !(await nameOf(1249589)));

// 4. REGRESSION: the Quddús-martyrdom betrayer (the Siyyid-i-Qumí / Mutavallí) — captured at the Bárfurúsh scene?
const betrayer = await queryOne("SELECT ge.id, er.canonical_name FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.religion='' WHERE er.entity_type='person' AND (er.canonical_name LIKE '%Qumí%' OR er.canonical_name LIKE '%Mutavallí%' OR er.aliases LIKE '%Siyyid-i-Qumí%')");
if (betrayer) { const bp = await parasOf(betrayer.id); check(`Quddús-betrayer entity exists (${betrayer.id} ${betrayer.canonical_name})`, true); check('  …and is bound to Bárfurúsh-martyrdom-era paras (820-960)', bp.some(p => p >= 820 && p <= 960), `paras=${bp}`); }
else check('Quddús-betrayer (Siyyid-i-Qumí/Mutavallí) entity present', false, 'no entity matched');

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(0);
