// Build the BROAD disambiguation worklist: every (paragraph, surface) where the surface name maps to >=2
// candidate people (true namesakes for THAT surface — narrowed by prefix/equality, not the bare core, so
// "Mullá Ḥusayn" -> the Mullá-Ḥusayns, not all 19 "Ḥusayn"s). Person-name surfaces only (roles/collectives
// are handled by the context role-binds). Writes broad-worklist.json for disambiguate.mjs.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const DOC = 21308;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const ROLE_COLL = ['imam-jum', "mu'tamid", 'vazir', 'shah', 'governor', 'kad-khuda', 'mujtahid', 'martyr', 'prince', ' king', 'minister', 'ulama', 'divines', 'clergy', 'doctors', 'companions', 'disciples', 'people of', 'inhabitants', 'siyyids', 'mullas', 'believers', 'god', 'multitude', 'crowd', 'army', 'troops', 'guards', 'officials', 'notables', 'assailants', 'heirs', ' and ', 'the youth', 'his son', 'my son', 'his brother', 'the child', 'the friend', 'the matter', 'the truth', 'masjid', 'fort', 'the men', 'the women', 'sons of', 'family of'];
const isRoleColl = s => { const n = norm(s); return ROLE_COLL.some(t => n.includes(t)) || n.split(' ').length < 2; }; // also skip 1-token bare names (too generic)

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases, er.summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const forms = persons.map(p => { let a = []; try { a = JSON.parse(p.aliases || '[]'); } catch {} return { id: p.id, canon: p.canonical_name, summary: p.summary || '', forms: [...new Set([p.canonical_name, ...a].map(norm))] }; });
function candidates(surface) {
  const s = norm(surface).replace(/^(the|that|this|a|an) /, '');
  if (s.length < 4) return [];
  const hit = [];
  for (const p of forms) for (const f of p.forms) {
    if (f === s || f.startsWith(s + ' ') || f.startsWith(s + '-i-') || f.startsWith(s + ', ') || s.startsWith(f + ' ') || s.startsWith(f + '-i-')) { hit.push(p); break; }
  }
  return hit;
}

const text = new Map((await queryAll(`SELECT paragraph_index, text FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => [r.paragraph_index, r.text]));
const mentions = JSON.parse(readFileSync('tmp/entity-research/seqread/all-mentions.json', 'utf8'));
const seen = new Set(); const work = [];
for (const m of mentions) {
  if (!m.label || m.label === 'null' || isRoleColl(m.label)) continue;
  const key = m.para + '|' + norm(m.label); if (seen.has(key)) continue; seen.add(key);
  const cands = candidates(m.label);
  if (cands.length < 2 || cands.length > 10) continue;       // ambiguous & tractable
  work.push({ cluster: norm(m.label).slice(0, 24), para: m.para, surface: m.label, text: (text.get(m.para) || '').replace(/\s+/g, ' '), candidates: cands.map(c => ({ id: c.id, canon: c.canon, summary: c.summary.slice(0, 180) })) });
}
work.sort((a, b) => a.para - b.para);
writeFileSync('tmp/entity-research/seqread/broad-worklist.json', JSON.stringify(work, null, 1));
console.log(`broad worklist: ${work.length} (paragraph, ambiguous-surface) entries`);
const hist = {}; for (const w of work) hist[w.candidates.length] = (hist[w.candidates.length] || 0) + 1;
console.log('candidate-count histogram:', JSON.stringify(hist));
console.log('sample:', work.slice(0, 5).map(w => `p${w.para} "${w.surface}" (${w.candidates.length})`).join(' | '));
process.exit(0);
