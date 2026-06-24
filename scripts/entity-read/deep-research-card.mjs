// Build the pre-extraction "disambiguation prior" card for a set of persons: mine the wider library
// (cross-corpus Meili), then extract a STRUCTURED, SOURCED card — aliases, kinship, relationships, timeline/
// places, supplemental facts, namesake-firewall notes, contested-fact flags. Hard contamination guard: a fact
// is attached ONLY if the passage verifiably matches THIS person's known discriminators; same-name ambiguity
// is flagged, never merged. Read-only -> research-cards.json. Env: IDS="a,b,c".
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'fs';
const { queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const { getMeili, INDEXES } = await import('../../api/lib/search.js');
const meili = getMeili();
const DOC = 21308;
let IDS = (process.env.IDS || '').split(',').map(Number).filter(Boolean);
const LIMIT = +(process.env.LIMIT || 0), OFFSET = +(process.env.OFFSET || 0);
const docTitle = new Map((await queryAll('SELECT id, substr(title,1,32) t FROM docs')).map(r => [r.id, r.t]));
// DB-cast mention counts (for ordering + cursory-mode threshold)
const cids0 = new Set((await queryAll(`SELECT id FROM content WHERE doc_id=${DOC} AND deleted_at IS NULL`)).map(r => String(r.id)));
const dbCount = new Map();
for (const m of await graphQueryAll('SELECT entity_id, content_id FROM entity_mentions')) if (cids0.has(String(m.content_id))) dbCount.set(m.entity_id, (dbCount.get(m.entity_id) || 0) + 1);
// full-run mode: no IDS -> all DB-cast persons, most-mentioned first
if (!IDS.length) {
  IDS = [...dbCount.keys()].sort((a, b) => (dbCount.get(b) || 0) - (dbCount.get(a) || 0));
  if (LIMIT) IDS = IDS.slice(OFFSET, OFFSET + LIMIT);
}
const ents = (await queryAll(`SELECT ge.id, ge.canonical_name cn, er.summary s, er.side, er.aliases a FROM graph_entities ge JOIN entity_research er ON er.canonical_name=ge.canonical_name WHERE ge.id IN (${IDS.join(',')}) AND ge.entity_type='person'`))
  .sort((a, b) => (dbCount.get(b.id) || 0) - (dbCount.get(a.id) || 0));
console.error(`cards to gather: ${ents.length}`);
// DB discriminators fetched PER ENTITY (capped) inside the loop — bulk-fetching all 854 at once was the hang.
async function dossier(id) {
  const cs = (await graphQueryAll(`SELECT content_id FROM entity_mentions WHERE entity_id=${id} LIMIT 40`)).map(r => String(r.content_id));
  if (!cs.length) return '';
  const rows = await queryAll(`SELECT doc_id, paragraph_index pi, substr(replace(text,char(10),' '),1,200) t FROM content WHERE id IN (${cs.join(',')}) ORDER BY doc_id, paragraph_index LIMIT 15`);
  return rows.map(r => `[¶${r.pi}] ${r.t}`).join('\n');
}
async function discover(cn, aliases) {
  if (!meili) return [];
  const names = [cn.replace(/\(.*?\)/g, '').trim(), ...aliases].filter(x => x && !/^؀-ۿ/.test(x)).slice(0, 3);
  const seen = new Map();
  for (const q of names) {
    try {
      const res = await meili.index(INDEXES.PARAGRAPHS).search(q, { limit: 8, attributesToRetrieve: ['id', 'doc_id'] });
      for (const h of (res.hits || [])) if (h.doc_id !== DOC && !seen.has(h.id)) seen.set(h.id, h.doc_id);
    } catch {}
  }
  const ids = [...seen.keys()].slice(0, 14);
  if (!ids.length) return [];
  const rows = await queryAll(`SELECT id, doc_id, substr(replace(text,char(10),' '),1,300) t FROM content WHERE id IN (${ids.join(',')})`);
  return rows.map(r => `[${docTitle.get(r.doc_id) || r.doc_id}] ${r.t}`);
}
const SYS = `You build a DISAMBIGUATION PRIOR card for one Bábí/Bahá'í figure, to be used later when extracting OTHER books — so the facts must help bind/disambiguate, and must be TRUE of THIS person. You get the entity's known identity (canonical, side, DB mentions = the ground truth discriminators) and candidate passages from OTHER books. CONTAMINATION GUARD: attach a fact ONLY if the passage clearly concerns THIS person (matching nisba/place/kin/episode); if a passage is or might be a same-named different person, put it under "ambiguous" instead, with the discriminator that would settle it. TRANSLITERATION: some books (esp. Memorials of the Faithful, older works) use OLD/variant romanization — match names by consonant-skeleton and treat spelling variants as the SAME person; NEVER split on romanization alone; if a fact rests on a variant spelling, tag it and note the source's spelling. CONTESTED before convenient: if sources disagree on a kinship/identity (e.g. whose daughter/father), put it under "contested" with both versions — never assert one; note when a source's wording is about a RELATIVE (a "married to X" line may concern the mother, not the figure). POSSIBLE IDENTIFICATIONS: when the figure MIGHT be the same as a person named elsewhere, record it under "possible_identifications" as a TENTATIVE lead (marked "possibly"), never a merge. This is the ONE place you MAY use well-established general knowledge to propose a lead even without a supplied passage — e.g. "possibly the Mullá Ni‘matu'lláh-i-Mázindarání cited in the Kitáb-i-Íqán" (note Bárfurúsh lies in Mázindarán); set "authority" to the source that could confirm it (e.g. Khávarí's Qámús-i-Íqán) and basis to "general-knowledge-lead". It is a lead for later verification, NOT a fact and NOT a merge. CURSORY MODE: for a one-mention bare figure, do NOT pad — give the known fact, and only fill arrays a passage actually supports (often just one possible_identification or nothing). Tag every fact's source (book) and basis (corpus-verified | sourced). Output STRICT minified JSON, escaping every interior quote. Return ONLY JSON:
{"aliases":[name-forms seen],"kinship":[{"relation":"father|brother|son|uncle|wife|cousin|...","who":"name","source":"book"}],"relationships":[{"type":"teacher|student|companion|introduced-by|ally|opponent|met","who":"name","episode":"where/when","source":"book"}],"timeline":[{"when":"date/period","event":"...","source":"book"}],"places":["..."],"supplemental_facts":[{"fact":"...","source":"book","basis":"corpus-verified|sourced"}],"possible_identifications":[{"maybe":"other figure named elsewhere","source":"work","authority":"e.g. Khávarí's Qámús-i-Íqán","note":"why tentative"}],"namesake_firewall":[{"not":"other same-named person","discriminator":"how to tell apart"}],"contested":[{"point":"...","versions":"source A says X; source B says Y"}],"ambiguous":[{"passage_gist":"...","why":"may be a different same-named person"}],"importance_suggest":N}`;

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function buildCard(e) {
  let aliases = []; try { aliases = JSON.parse(e.a || '[]'); } catch {}
  const dbm = await dossier(e.id);
  const corpus = await discover(e.cn, aliases);
  const prompt = `ENTITY: "${e.cn}" (side ${e.side || '?'})\nKNOWN ALIASES: ${aliases.join(' | ')}\nDB GROUND TRUTH (The Dawn-Breakers):\n${dbm || '(none)'}\n\nCANDIDATE PASSAGES FROM OTHER BOOKS:\n${corpus.join('\n') || '(none)'}`;
  let j = null, lastErr = '';
  for (let attempt = 0; attempt < 2 && !j; attempt++) {
    try {
      const res = await timeout(chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: prompt }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1100, responseFormat: { type: 'json_object' } }), 90000);
      const m = (res.content || '').match(/\{[\s\S]*\}/); j = JSON.parse(m ? m[0] : res.content);
    } catch (err) { lastErr = String(err).slice(0, 100); }
  }
  return j ? { id: e.id, cn: e.cn, corpusN: corpus.length, card: j } : { id: e.id, cn: e.cn, error: lastErr };
}
const out = []; const CONC = 6, OUTFILE = 'tmp/entity-research/seqread/research-cards.json';
for (let i = 0; i < ents.length; i += CONC) {
  out.push(...await Promise.all(ents.slice(i, i + CONC).map(buildCard)));
  writeFileSync(OUTFILE, JSON.stringify(out, null, 1));   // incremental: persist after every batch
  process.stderr.write(`  ${Math.min(i + CONC, ents.length)}/${ents.length} (err ${out.filter(o => o.error).length})\n`);
}
writeFileSync('tmp/entity-research/seqread/research-cards.json', JSON.stringify(out, null, 1));
for (const o of out) {
  console.log(`\n##### [${o.id}] ${o.cn}  (corpus ${o.corpusN}) #####`);
  if (o.error) { console.log('  ERR ' + o.error); continue; }
  const c = o.card;
  if (c.kinship?.length) console.log('  KIN: ' + c.kinship.map(k => `${k.relation}=${k.who} (${k.source})`).join('; '));
  if (c.relationships?.length) console.log('  REL: ' + c.relationships.map(r => `${r.type}:${r.who}@${r.episode} (${r.source})`).join('; '));
  if (c.timeline?.length) console.log('  TIME: ' + c.timeline.map(t => `${t.when}:${t.event}`).join('; '));
  if (c.supplemental_facts?.length) for (const f of c.supplemental_facts) console.log(`  FACT [${f.basis}/${f.source}]: ${f.fact}`);
  if (c.possible_identifications?.length) for (const f of c.possible_identifications) console.log(`  POSSIBLY: ${f.maybe} — ${f.note} (${f.authority || f.source})`);
  if (c.namesake_firewall?.length) for (const f of c.namesake_firewall) console.log(`  FIREWALL: not ${f.not} — ${f.discriminator}`);
  if (c.contested?.length) for (const f of c.contested) console.log(`  CONTESTED: ${f.point} — ${f.versions}`);
  if (c.ambiguous?.length) for (const f of c.ambiguous) console.log(`  AMBIG: ${f.passage_gist} — ${f.why}`);
}
process.exit(0);
