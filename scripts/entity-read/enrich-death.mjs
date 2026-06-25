// Death-enrichment: for every person, extract how/where/when they died from their (already source-grounded)
// summary, faithfully — martyrdom stated plainly, nothing inferred, "not established" left null. Attributes the
// source book (highest-authority the person appears in: GPB > Dawn-Breakers). Stores entity_research.research_notes.death.
// Reversible: clear by `UPDATE entity_research SET research_notes=json_remove(research_notes,'$.death')`.
// Run ON tower-nas with SIFTER_WRITER_URL set.  Env: MIN=<importance> LIMIT=<n> CONC=<n> WRITE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const bio = await import('../../api/lib/bio.js');
const ai = await import('../../api/lib/ai.js');
const { query, queryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const MIN = Number(process.env.MIN || 0);
const LIMIT = Number(process.env.LIMIT || 0);
const CONC = Number(process.env.CONC || 4);

const bookOf = await bio.computeBookSources();
const bookLabel = (id) => { const s = bookOf[id]; if (!s) return null; if (s.has('gpb')) return 'God Passes By'; if (s.has('dawn-breakers')) return 'The Dawn-Breakers'; return null; };

let people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.summary, er.research_notes
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion='' AND er.summary IS NOT NULL AND length(er.summary) > 40
  ORDER BY (ge.importance IS NULL), ge.importance DESC`);
if (MIN) people = people.filter((p) => (p.imp || 0) >= MIN);
if (LIMIT) people = people.slice(0, LIMIT);
console.error(`death-enrichment: ${people.length} persons${WRITE ? ' [WRITE]' : ' [dry]'}`);

const SYS = `From a person's biographical summary (early Bábí/Bahá'í history), extract their death IF the summary states or clearly implies it. Return ONLY JSON {"cause":<short phrase or null>,"place":<location or null>,"year":<integer or null>,"martyr":<true|false>}. cause examples: "executed by firing squad","killed in the Ṭabarsí upheaval","strangled","beheaded","died in exile","died of illness". martyr=true only if killed/executed for the Faith. If the summary does NOT establish death, return {"cause":null,"place":null,"year":null,"martyr":false}. Never infer beyond the text.`;

let done = 0, withDeath = 0;
async function one(p) {
  let notes = {}; try { notes = JSON.parse(p.research_notes || '{}'); } catch {}
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `SUMMARY of ${p.cn}:\n${p.summary}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 200, responseFormat: { type: 'json_object' } });
    const m = (res.content || '').match(/\{[\s\S]*\}/); const d = m ? JSON.parse(m[0]) : {};
    if (d && d.cause) {
      const death = { cause: String(d.cause).slice(0, 120), place: d.place ? String(d.place).slice(0, 80) : null,
        year: Number.isInteger(d.year) ? d.year : (parseInt(d.year, 10) || null), martyr: !!d.martyr, source: bookLabel(p.id) };
      notes.death = death; withDeath++;
      if (WRITE) await query(`UPDATE entity_research SET research_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE canonical_name = ?`, [JSON.stringify(notes), p.cn]);
      return `  ${p.id} ${p.cn} :: ${death.martyr ? '☠' : '†'} ${death.cause}${death.place ? ' @ ' + death.place : ''}${death.year ? ' (' + death.year + ')' : ''} [${death.source || '—'}]`;
    }
    return null;
  } catch (e) { return `  ERR ${p.id} ${String(e.message || e).slice(0, 60)}`; }
}
for (let i = 0; i < people.length; i += CONC) {
  const r = await Promise.all(people.slice(i, i + CONC).map(one));
  for (const line of r) if (line) console.log(line);
  done += Math.min(CONC, people.length - i);
  if (Math.floor(done / 100) > Math.floor((done - CONC) / 100)) process.stderr.write(`  …${done}/${people.length} (${withDeath} deaths so far)\n`);
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN'} — death extracted for ${withDeath}/${people.length} persons`);
process.exit(0);
