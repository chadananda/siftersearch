// Period/title-keyed vizier corrector (DRY diff by default). Rules locked by in-text evidence (para 269):
//   Amír-Niẓám / Mírzá Taqí Khán[-i-Faráhání] / (quoted) Amír-i-Kabír  -> Amír Kabir 1247568
//   I‘timádu'd-Dawlih / Ṣadr-i-A‘ẓam                                   -> Áqá Khán-i-Núrí 1247946
//   Grand Vazír                                                        -> r4 Áqásí 1247567 / r9 Áqá Khán 1247946
//   "the Vazír" / "the late Vazír" (r1)                                -> Bahá'u'lláh's father (Mírzá Buzurg)
//   Special: para 1986 I‘timádu'd-Dawlih is a QUOTED line naming Amír-i-Kabír -> 1247568; para 2030 ambiguous -> skip
// Emits INSERTS (unbound correct vizier refs) and MISBINDS (a vizier entity bound where the rules name a
// different vizier, with no mention justifying it). Apply with WRITE=1 (deletes misbinds, inserts correct;
// all seqread-v1, reversible).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, readdirSync } from 'fs';
const { queryAll, graphQueryAll, graphTransaction } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const dir = 'tmp/entity-research/seqread';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const AQASI = 1247567, KABIR = 1247568, NURI = 1247946;

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const nameIdx = new Map();
for (const p of persons) { const add = n => { const k = norm(n); if (!k) return; if (!nameIdx.has(k)) nameIdx.set(k, new Set()); nameIdx.get(k).add(p.id); }; add(p.canonical_name); try { for (const a of JSON.parse(p.aliases || '[]')) add(a); } catch {} }
const findOne = (...names) => { for (const n of names) { const s = nameIdx.get(norm(n)); if (s && s.size === 1) return [...s][0]; } return null; };
const FATHER = findOne('Mírzá Buzurg', 'Mírzá Buzurg-i-Núrí', 'Mírzá ‘Abbás-i-Núrí', 'Mírzá ‘Abbás', 'Mírzá Buzurg-i-Vazír');
const nameById = new Map(persons.map(p => [p.id, p.canonical_name]));
console.log(`father (the Vazír) entity: ${FATHER ? FATHER + ' ' + nameById.get(FATHER) : 'NOT FOUND in seed'}`);

const regions = readdirSync(dir).filter(f => /^region-\d+\.json$/.test(f)).sort().map(f => { const m = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); return { idx: m.idx, range: m.range }; });
const regionFor = p => regions.find(R => p >= R.range[0] && p <= R.range[1]);

// Ṣadr-i-A‘ẓam = the Grand-Vizier OFFICE, held by 3 different men in this book — assign by period (read in context):
//   1674 Máh-Kú/Muḥammad Sháh -> Áqásí | 1982 Zanján 1850 -> Amír Kabir | 2034 Aug-1852 -> Áqá Khán-i-Núrí
const SADR = { 1674: AQASI, 1982: KABIR, 2034: NURI };
// classify a vizier-ish label (at a given para) to the correct entity, else null (leave for review)
function classify(label, para) {
  const c = norm(label);
  if (para === 2030) return null;                                   // ambiguous footnote — skip
  if (c.includes('sadr') && c.includes('zam')) return SADR[para] ?? null;    // Ṣadr-i-A‘ẓam (NOT "Ṣadr-i-Ardibílí"): period-keyed
  if (para === 1986) return KABIR;                                  // quoted line names Amír-i-Kabír
  if (/abu'l-qasim|qa'im-maqam/.test(c)) return null;               // Qá'im-Maqám, different man
  if (c.includes('amir-niz') || c.includes('amir niz') || c.includes('vazir-niz') || c.includes('amir-i-kabir') || c.includes('amir kabir')) return KABIR;
  if (c.includes('taqi khan') || c.includes('taqi ḵhan')) return KABIR;       // Mírzá/Muḥammad-Taqí Khán (= Amír Kabir; Abu'l-Qásim excluded above)
  if (c.includes("i'timadu") || c.includes('itimadu')) return NURI;           // I‘timádu'd-Dawlih = Áqá Khán-i-Núrí (per para 269)
  if (c === 'grand vazir') { const R = regionFor(para); return R && R.idx <= 4 ? AQASI : NURI; }
  if ((c === 'the vazir' || c === 'vazir' || c === 'the late vazir') && para >= 214 && para <= 333) return FATHER;  // Bahá'u'lláh's father
  return null;                                                      // "Vazír of the city", "Dín-Muḥammad-Vazír", "‘Abbás (Vazír)" etc. — not handled here
}

const cmap = new Map((await queryAll('SELECT id,paragraph_index FROM content WHERE doc_id=21308 AND deleted_at IS NULL')).map(r => [r.paragraph_index, String(r.id)]));
const mentions = JSON.parse(readFileSync(`${dir}/all-mentions.json`, 'utf8'));
const VIZ = ['vazir', 'amir-niz', 'amir niz', 'amir kabir', 'amir-i-kabir', 'taqi khan', "i'timadu", 'itimadu'];
const isViz = c => VIZ.some(t => c.includes(t)) || (c.includes('sadr') && c.includes('zam'));   // sadr+zam excludes "Ṣadr-i-Ardibílí"
const correctByPara = new Map();   // para -> Set(entityId that SHOULD be bound)
const vizierMentionParas = new Set();
for (const m of mentions) {
  const c = norm(m.label); if (!isViz(c)) continue;
  vizierMentionParas.add(m.para);
  const id = classify(m.label, m.para); if (!id) continue;
  if (!correctByPara.has(m.para)) correctByPara.set(m.para, new Set());
  correctByPara.get(m.para).add(id);
}
// current seqread-v1 binds for the four vizier entities (+father)
const VIZ_ENTS = [AQASI, KABIR, NURI, FATHER].filter(Boolean);
const boundByPara = new Map();     // para -> Set(entityId currently bound)
const cidToPara = new Map([...cmap.entries()].map(([p, c]) => [c, p]));
for (const e of VIZ_ENTS) {
  const rows = await graphQueryAll("SELECT content_id FROM entity_mentions WHERE entity_id=? AND extractor_version='seqread-v1'", [e]);
  for (const r of rows) { const p = cidToPara.get(String(r.content_id)); if (p == null) continue; if (!boundByPara.has(p)) boundByPara.set(p, new Set()); boundByPara.get(p).add(e); }
}
const inserts = [], misbinds = [];
for (const [para, want] of correctByPara) {
  const have = boundByPara.get(para) || new Set();
  for (const id of want) if (!have.has(id)) inserts.push({ para, id });
}
for (const para of vizierMentionParas) {
  const want = correctByPara.get(para) || new Set();
  const have = boundByPara.get(para) || new Set();
  for (const id of have) if (VIZ_ENTS.includes(id) && !want.has(id) && want.size) misbinds.push({ para, wrong: id, correct: [...want] });
}
inserts.sort((a, b) => a.para - b.para); misbinds.sort((a, b) => a.para - b.para);
console.log(`\nINSERTS (bind correct vizier where missing): ${inserts.length}`);
for (const x of inserts) console.log(`  +p${x.para} -> ${x.id} ${nameById.get(x.id)}`);
console.log(`\nMISBINDS (remove wrong vizier at para; correct shown): ${misbinds.length}`);
for (const x of misbinds) console.log(`  -p${x.para} REMOVE ${x.wrong} ${nameById.get(x.wrong)}  (correct: ${x.correct.map(i => nameById.get(i)).join(', ')})`);

if (WRITE) {
  const tx = [];
  for (const x of misbinds) tx.push({ sql: "DELETE FROM entity_mentions WHERE entity_id=? AND content_id=? AND extractor_version='seqread-v1'", args: [x.wrong, cmap.get(x.para)] });
  for (const x of inserts) tx.push({ sql: "INSERT INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?,?,?,'resolved','seqread-v1')", args: [x.id, cmap.get(x.para), 'official', 0.95] });
  if (tx.length) { await graphTransaction(tx); console.log(`\nWROTE: ${misbinds.length} deletes + ${inserts.length} inserts`); }
} else console.log('\n[DRY] nothing written — re-run with WRITE=1 to apply');
process.exit(0);
