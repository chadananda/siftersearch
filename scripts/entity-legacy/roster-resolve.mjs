// Resolve the held martyr-LIST entries using their section's PLACE (the roster is grouped by "believers of
// <place>" sub-headings). For each held roster line: give the engine the place + the candidates (some tagged
// "martyr of <place>") and ask it to pick the place-matching person, or declare NEW = "<name>, martyr of
// <place>" when no candidate fits. Output roster-decisions.json (binds + NEW-to-create list). Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const DOC = 21308;
// the martyr list with paragraph order, to assign each entry its governing place sub-heading
const list = await queryAll(`SELECT paragraph_index, text FROM content WHERE doc_id=${DOC} AND heading='List of the martyrs' AND deleted_at IS NULL ORDER BY paragraph_index`);
const placeOf = new Map(); let place = 'Fort Ṭabarsí';
for (const r of list) {
  const m = r.text.match(/believers of ([A-ZṬŠḴḤ][^,.:]+?)[,:]|adherents of the Faith in ([A-Z][^,.:]+?)[,:]|martyrs? of ([A-Z][^,.:]+?)[,.:]/);
  if (m && r.text.length < 160) { place = (m[1] || m[2] || m[3]).trim(); }   // a section sub-heading line
  placeOf.set(r.paragraph_index, place);
}
const listParas = new Set(list.map(r => r.paragraph_index));

const work = JSON.parse(readFileSync('tmp/entity-research/seqread/broad-worklist.json', 'utf8'));
const dec = JSON.parse(readFileSync('tmp/entity-research/seqread/broad-decisions.json', 'utf8'));
const held = [];
for (let i = 0; i < work.length; i++) {
  const d = dec[i]; if (!d || d.error || !d.decisions) continue;
  if (d.decisions.some(x => x.refers === true)) continue;
  if (!listParas.has(work[i].para)) continue;                 // only martyr-list entries
  held.push(work[i]);
}
console.log(`held martyr-list entries to re-resolve with place context: ${held.length}`);

const SYS = `You resolve which martyr a line in The Dawn-Breakers' "List of the martyrs" refers to. The list is grouped by place; you are told the PLACE this entry falls under. RULE: pick the candidate whose profile matches BOTH the name AND that place/episode (some candidates are explicitly tagged "martyr of <place>"). If NONE of the candidates is the martyr of this place, do NOT force one — instead propose a NEW entity. Return ONLY JSON: {"id": <id or null>, "evidence": "...", "new": null | {"name":"<name as given>","fact":"martyr of <place> (named in the Dawn-Breakers list of martyrs; no further detail in this source)"}}.`;
const build = e => `LIST ENTRY (paragraph ${e.para}), under the martyrs of ${placeOf.get(e.para)}:\n"${e.text}"\n\nCANDIDATES (same name):\n` + e.candidates.map(c => `- id ${c.id}: ${c.canon} — ${(c.summary || '').slice(0, 150)}`).join('\n');

const out = []; const CONC = 8;
for (let i = 0; i < held.length; i += CONC) {
  const batch = await Promise.all(held.slice(i, i + CONC).map(async e => {
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: build(e) }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 600, responseFormat: { type: 'json_object' } });
      const m = (res.content || '').match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : {};
      return { para: e.para, surface: e.surface, place: placeOf.get(e.para), id: j.id ?? null, evidence: j.evidence, new: j.new || null };
    } catch (err) { return { para: e.para, surface: e.surface, error: String(err).slice(0, 80) }; }
  }));
  out.push(...batch); process.stderr.write(`  ${Math.min(i + CONC, held.length)}/${held.length}\n`);
}
writeFileSync('tmp/entity-research/seqread/roster-decisions.json', JSON.stringify(out, null, 1));
const binds = out.filter(o => o.id), news = out.filter(o => o.new && !o.id);
console.log(`\nresolved to existing place-tagged entity: ${binds.length}; NEW to store ("<name>, martyr of <place>"): ${news.length}`);
console.log('\n=== binds (sample) ==='); for (const b of binds.slice(0, 15)) console.log(`  p${b.para} "${b.surface}" (${b.place}) -> ${b.id}`);
console.log('\n=== NEW to store (sample) ==='); for (const n of news.slice(0, 20)) console.log(`  p${n.para} ${n.new.name} — ${n.new.fact}`);
process.exit(0);
