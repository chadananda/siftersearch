// Triage the new-person review queue into actionable buckets:
//   collective  — "the disciples", "heirs of Mullá Taqí", "the multitude", Letters of the Living -> DROP (not a person)
//   recover     — uniquely matches an existing seed entity by name-core -> bind, don't create
//   named-new   — carries a real name token (Khán/Mírzá/Mullá/Siyyid/Ḥájí/Áqá/Shaykh/Big/Bagum…) -> CREATE candidate
//   descriptive — pure role/relation, no name ("the messenger of Kand", "the executioner") -> resolve by library search
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const core = s => norm(s).replace(/^(the|that|this|an|a) /, '').replace(/ of [a-z‘’'-]+$/, '').trim();
const COLLECTIVE = ['disciples', 'companions', 'heirs', 'people of', 'inhabitants', 'believers', 'officials', 'notables',
  'assailants', 'mullas', 'siyyids', 'doctors', 'clergy', 'ulama', 'attendants', 'multitude', 'masses', 'crowd', 'army',
  'troops', 'guards', 'villagers', 'townspeople', 'adversaries', 'letters of the living', 'men of', 'family of', 'sons of',
  'descendants', 'victors', 'emissaries', 'counsellors', 'commanders', 'soldiers', 'regiment', 'both ', 'leading ', 'and '];
const NAME_TOK = ['khan', 'ḵhan', 'mirza', 'mulla', 'siyyid', 'haji', 'aqa', 'shaykh', 's̱hayḵh', 'big', 'bagum', 'khanum',
  'sultan', 'mير', 'mir ', 'nawwab', 'navvab', 'ustad', 'karbila', 'darvish', 'qahru', 'baha', 'quddus', 'tahirih'];
const isCollective = n => COLLECTIVE.some(t => norm(n).includes(t));
const hasName = n => { const c = norm(n); return NAME_TOK.some(t => c.includes(t)) || /^[a-z‘’']*(í|á|ú)/.test(core(n).split(' ')[0] || ''); };

const persons = await queryAll("SELECT er.canonical_name, er.aliases FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const nameIdx = new Map();
for (const p of persons) { const add = n => { const k = norm(n); if (!k) return; nameIdx.set(k, (nameIdx.get(k) || 0) + 1); }; add(p.canonical_name); try { for (const a of JSON.parse(p.aliases || '[]')) add(a); } catch {} }
const uniqMatch = n => nameIdx.get(core(n)) === 1 || nameIdx.get(norm(n)) === 1;

const nq = JSON.parse(readFileSync('tmp/entity-research/seqread/review-queue.json', 'utf8')).newPersons || [];
const bucket = { collective: [], recover: [], named: [], descriptive: [] };
for (const p of nq) {
  if (isCollective(p.name)) bucket.collective.push(p);
  else if (uniqMatch(p.name)) bucket.recover.push(p);
  else if (hasName(p.name)) bucket.named.push(p);
  else bucket.descriptive.push(p);
}
const sum = b => b.reduce((s, x) => s + x.count, 0);
console.log(`new-person queue: ${nq.length} labels, ${sum(nq)} mentions`);
for (const k of ['collective', 'recover', 'named', 'descriptive']) console.log(`  ${k}: ${bucket[k].length} labels, ${sum(bucket[k])} mentions`);
const show = (k, n) => { console.log(`\n=== ${k} (top ${n}) ===`); for (const x of bucket[k].sort((a, b) => b.count - a.count).slice(0, n)) console.log(`  ×${x.count}  ${x.name}`); };
show('named', 40);
show('descriptive', 25);
show('recover', 15);
process.exit(0);
