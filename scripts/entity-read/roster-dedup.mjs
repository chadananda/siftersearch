// Dedup-check the roster "NEW" proposals before creating: for each, gather ALL same-core seed entities (broad,
// not surface-prefix) + the place, and let the engine decide bind-to-existing vs genuinely-new. Prevents
// creating duplicates of entities the surface candidate-gen missed (e.g. Harátí, Mullá Maḥmúd-i-Khu'í).
// Writes roster-dedup.json {binds:[{para,id}], creates:[{para,name,fact,place}]}. Read-only.
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { queryAll } = await import('../../api/lib/db.js');
const { chatCompletion } = await import('../../api/lib/ai.js');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’'`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const HON = /^(the |that |mulla |mirza |siyyid |haji |aqa |shaykh |s?h?ayh |karbila'i |mawlana |mir |akhund )+/;
const core = s => { let n = norm(s).replace(/\s*\([^)]*\)\s*$/, '').replace(/,.*$/, ''); let p; do { p = n; n = n.replace(HON, ''); } while (n !== p); return n.replace(/-i-[a-z‘’'-]+$/, '').replace(/ of [a-z‘’'-]+$/, '').trim(); };

const persons = await queryAll("SELECT ge.id, er.canonical_name, er.aliases, er.summary FROM entity_research er JOIN graph_entities ge ON ge.canonical_name=er.canonical_name AND ge.entity_type='person' AND ge.religion='' WHERE er.entity_type='person'");
const byCore = new Map();
for (const p of persons) { let forms = [p.canonical_name]; try { forms.push(...JSON.parse(p.aliases || '[]')); } catch {} const cores = new Set(forms.map(core)); for (const c of cores) { if (!c) continue; if (!byCore.has(c)) byCore.set(c, []); byCore.get(c).push(p); } }
const work = JSON.parse(readFileSync('tmp/entity-research/seqread/broad-worklist.json', 'utf8'));
const textByPara = new Map(work.map(w => [w.para, w.text]));
const roster = JSON.parse(readFileSync('tmp/entity-research/seqread/roster-decisions.json', 'utf8'));
const news = roster.filter(o => o.new && !o.id);

const SYS = `You decide whether a martyr named in The Dawn-Breakers' list already has a record among the candidates, or is genuinely new. You are given the list entry, the PLACE of its section, and ALL existing entities sharing the name's core. RULE: bind to an existing candidate ONLY if its profile fits the name AND place/episode; a shared given name is NOT enough. If no candidate fits, it is NEW. Return ONLY JSON: {"id": <existing id or null>, "evidence": "..."}.`;
const out = []; const CONC = 6;
for (let i = 0; i < news.length; i += CONC) {
  const batch = await Promise.all(news.slice(i, i + CONC).map(async o => {
    const cands = (byCore.get(core(o.new.name)) || []).slice(0, 12);
    if (!cands.length) return { para: o.para, decide: 'new', name: o.new.name, fact: o.new.fact, place: o.place };
    const prompt = `LIST ENTRY (para ${o.para}), martyrs of ${o.place}:\n"${(textByPara.get(o.para) || o.new.name)}"\nName: ${o.new.name}\n\nEXISTING same-core entities:\n` + cands.map(c => `- id ${c.id}: ${c.canonical_name} — ${(c.summary || '').slice(0, 140)}`).join('\n');
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: prompt }], { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 400, responseFormat: { type: 'json_object' } });
      const m = (res.content || '').match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : {};
      return j.id ? { para: o.para, decide: 'bind', id: j.id, name: o.new.name, evidence: j.evidence } : { para: o.para, decide: 'new', name: o.new.name, fact: o.new.fact, place: o.place };
    } catch (e) { return { para: o.para, decide: 'error', name: o.new.name, error: String(e).slice(0, 80) }; }
  }));
  out.push(...batch);
}
const binds = out.filter(o => o.decide === 'bind'), creates = out.filter(o => o.decide === 'new');
writeFileSync('tmp/entity-research/seqread/roster-dedup.json', JSON.stringify({ binds, creates }, null, 1));
const idName = new Map(persons.map(p => [p.id, p.canonical_name]));
console.log(`NEW proposals: ${news.length} -> bind-to-existing: ${binds.length}, genuinely-new (create): ${creates.length}\n`);
console.log('=== would BIND to existing (dedup caught) ==='); for (const b of binds) console.log(`  p${b.para} "${b.name}" -> ${b.id} ${idName.get(b.id) || '?'}`);
console.log('\n=== genuinely NEW (create as "<name>, martyr of <place>") ==='); for (const c of creates) console.log(`  p${c.para} ${c.name} — ${c.place}`);
process.exit(0);
