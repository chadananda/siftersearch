// Build the staged CREATE list of genuinely-new named people from the new-person queue — dedup-checked against
// the seed so duplicates are flagged, NOT created. Writes create-list.json. Creates NOTHING (gated on approval).
// Buckets: clearlyNew (no seed name-match) | possibleDup (a seed entity shares the distinctive name — review).
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const strip = s => norm(s).replace(/\s*\([^)]*\)\s*$/, '').trim();               // drop trailing "(descriptor)"
const core = s => strip(s).replace(/^(the|that|this|an|a) /, '').replace(/ of [a-z‘’'-]+$/, '').trim();
const HON = /^(the |that |mull[aá] |m[ií]rz[aá] |siyyid |ḥ?[aá]j[ií] |[aá]q[aá] |s?h?ay[kḵ]h |mawl[aá]n[aá] |prince |sh?ay[kḵ]hu?'?l-?isl[aá]m )+/i;
const COLLECTIVE = ['disciples', 'companions', 'heirs', 'people of', 'inhabitants', 'believers', 'officials', 'notables', 'assailants', 'mullas', 'siyyids', 'doctors', 'clergy', 'ulama', 'attendants', 'multitude', 'masses', 'crowd', 'army', 'troops', 'guards', 'villagers', 'townspeople', 'adversaries', 'letters of the living', 'men of', 'family of', 'sons of', 'descendants', 'victors', 'emissaries', 'counsellors', 'commanders', 'soldiers', 'regiment'];
const NAME_TOK = ['khan', 'ḵhan', 'mirza', 'mulla', 'siyyid', 'haji', 'aqa', 'shaykh', 's̱hayḵh', 'big', 'bagum', 'khanum', 'sultan', 'nawwab', 'navvab', 'ustad', 'darvish', 'qahru', 'baha', 'quddus', 'tahirih', 'mahd'];
// names already resolved this session (recovered to existing OR confirmed-existing held) — exclude from CREATE
const RESOLVED = ['qahru', 'áqáy-i-kalím', 'mahd-i', 'kalantar', 'najíb páshá', 'shoghi effendi', 'máh-kú', 'shírází (young', 'g̱hulám-riḍáy-i-yazdí', 'muftí of bag', 'íravání', 'ájúdán', 'muqaddas', "ja‘far-qulí khán (brother", 'farrásh-báshí)', 'slain by the adjutant'];

const persons = await queryAll("SELECT er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const coreIdx = new Map();   // core-name -> [canonical...]
for (const p of persons) { const add = n => { const k = core(n); if (!k) return; if (!coreIdx.has(k)) coreIdx.set(k, new Set()); coreIdx.get(k).add(p.canonical_name); }; add(p.canonical_name); try { for (const a of JSON.parse(p.aliases || '[]')) add(a); } catch {} }

const nq = JSON.parse(readFileSync('tmp/entity-research/seqread/review-queue.json', 'utf8')).newPersons || [];
const isCollective = n => COLLECTIVE.some(t => norm(n).includes(t));
const hasName = n => { const c = norm(n); return NAME_TOK.some(t => c.includes(t)) || /(í|á|ú)/.test(strip(n).split(' ')[0] || ''); };
const isResolved = n => RESOLVED.some(t => norm(n).includes(norm(t)));
const clearlyNew = [], possibleDup = [];
for (const p of nq) {
  if (isCollective(p.name) || isResolved(p.name) || !hasName(p.name)) continue;
  const dup = coreIdx.get(core(p.name));
  (dup ? possibleDup : clearlyNew).push({ name: p.name, count: p.count, ...(dup ? { seedMatch: [...dup].slice(0, 4) } : {}) });
}
clearlyNew.sort((a, b) => b.count - a.count); possibleDup.sort((a, b) => b.count - a.count);
writeFileSync('tmp/entity-research/seqread/create-list.json', JSON.stringify({ clearlyNew, possibleDup }, null, 1));
console.log(`CREATE candidates (clearly new, no seed name-match): ${clearlyNew.length}`);
for (const x of clearlyNew.slice(0, 45)) console.log(`  ×${x.count}  ${x.name}`);
console.log(`\nPOSSIBLE DUPLICATES (seed shares the name — review before creating): ${possibleDup.length}`);
for (const x of possibleDup.slice(0, 30)) console.log(`  ×${x.count}  ${x.name}   ~ seed: ${x.seedMatch.join(' | ')}`);
process.exit(0);
