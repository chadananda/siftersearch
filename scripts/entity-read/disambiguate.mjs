// STANDARD evidence-based disambiguation engine (the reusable procedure, not a one-off fix).
// For each ambiguous reference it gives the judgment model the PASSAGE + every same-name candidate's profile,
// and asks it to decide each candidate by TRIANGULATION (place/period/role/kinship/deeds/episode) — never by
// the name. A paragraph may refer to several candidates or none. Writes disambiguation-decisions.json.
// This run is read-only (decisions only); apply step removes/keeps bindings per the decisions. Reusable per book.
//   Usage: node disambiguate.mjs [worklist.json]   (default: namesake-worklist.json — the cross-contaminated set)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { readFileSync, writeFileSync } from 'fs';
const { chatCompletion } = await import('../../api/lib/ai.js');
const dir = 'tmp/entity-research/seqread';
const work = JSON.parse(readFileSync(`${dir}/${process.argv[2] || 'namesake-worklist.json'}`, 'utf8'));

const SYSTEM = `You identify which historical person each reference in a Bahá'í-history text points to, for an entity index.
RULE: a name is only a research lead — NEVER assume two people with the same name are the same person, and remember a different name, title, epithet, or pronoun may denote the SAME person. Decide each candidate by TRIANGULATING the evidence in the passage (place, period/date, role, kinship, deeds, the episode it belongs to) against that candidate's profile. A passage may legitimately refer to several of the candidates, or to none of them.
WHY: the corpus is dense with namesakes (many "Muḥammad", "Ḥusayn", "‘Alí Khán"); matching by name alone both drops real references and fuses different people.
Return ONLY a JSON array, one object per candidate: [{"id":<id>,"refers":true|false,"evidence":"<the specific words/attributes in THIS passage that decide it>"}]. Set refers=true only when the passage's evidence positively fits that specific person; otherwise false.`;

const build = e => `PASSAGE (The Dawn-Breakers, paragraph ${e.para}):\n"${e.text}"\n\nCANDIDATES who share this name — decide for EACH whether THIS passage refers to them:\n` +
  e.candidates.map(c => `- id ${c.id}: ${c.canon}\n    profile: ${(c.summary || '(no profile)').slice(0, 180)}`).join('\n');

async function decide(e) {
  try {
    const res = await chatCompletion([{ role: 'system', content: SYSTEM }, { role: 'user', content: build(e) }],
      { provider: 'anthropic', model: 'claude-sonnet-4-6', temperature: 0, maxTokens: 900 });
    const m = (res.content || '').match(/\[[\s\S]*\]/);
    if (!m) return { ...e, error: 'no-json', raw: (res.content || '').slice(0, 100) };
    return { cluster: e.cluster, para: e.para, decisions: JSON.parse(m[0]) };
  } catch (err) { return { ...e, error: String(err).slice(0, 120) }; }
}

// bounded concurrency
const out = []; const CONC = 5;
for (let i = 0; i < work.length; i += CONC) {
  const batch = await Promise.all(work.slice(i, i + CONC).map(decide));
  out.push(...batch);
  process.stderr.write(`  ${Math.min(i + CONC, work.length)}/${work.length}\n`);
}
writeFileSync(`${dir}/disambiguation-decisions.json`, JSON.stringify(out, null, 1));
let remove = 0, errs = 0;
for (const o of out) { if (o.error) { errs++; continue; } for (const d of o.decisions) if (d.refers === false) remove++; }
console.log(`\ndecided ${out.length - errs}/${out.length} paragraphs; ${errs} errors; proposed REMOVALS (refers=false): ${remove}`);
for (const o of out.filter(x => x.decisions)) for (const d of o.decisions) if (d.refers === false) console.log(`  p${o.para}: drop ${d.id} — ${d.evidence?.slice(0, 90)}`);
process.exit(0);
