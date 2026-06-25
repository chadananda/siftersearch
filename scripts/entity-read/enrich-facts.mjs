// Cited FACT CATALOG — supersedes the verbatim-clause "characterizations". For each person, produce a catalog
// of clear FACTS (paraphrase allowed), each tagged with a queryable RELATION and grounded in a specific source
// paragraph (citation). This lets connection-analysis be a LOOKUP over typed, cited facts — not LLM guessing.
// e.g. "Letters who met Bahá'u'lláh" = members with a fact whose relation is met-bahaullah.
//
// The Dawn-Breakers (21308) holds the factual detail + relationships GPB omits, so candidates are DB-weighted
// (sampled across the whole arc) plus GPB for authoritative characterization, plus the death scene.
// Stored at research_notes.facts2 = [{statement, relation, target, source, paraId, url}]. Disambiguates namesakes.
// Run ON tower-nas with SIFTER_WRITER_URL set.  Env: MIN=0 LIMIT=0 CONC=5 GMAX=8 DBMAX=18 ONLY=ids WRITE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const ai = await import('../../api/lib/ai.js');
const { query, queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const MIN = Number(process.env.MIN || 0), LIMIT = Number(process.env.LIMIT || 0), CONC = Number(process.env.CONC || 5);
const GMAX = Number(process.env.GMAX || 8), DBMAX = Number(process.env.DBMAX || 18);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
const DBID = 21308;
const bookOf = (id) => (id === DBID ? 'The Dawn-Breakers' : 'God Passes By');
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const normq = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, '').toLowerCase();
const STOPCAP = new Set(['during', 'after', 'among', 'amongst', 'when', 'while', 'having', 'upon', 'this', 'that', 'these', 'those', 'both', 'some', 'many', 'several', 'from', 'with', 'their', 'they', 'then', 'though', 'although', 'before', 'because', 'through', 'which', 'where', 'what', 'here', 'there', 'later', 'meanwhile', 'thus', 'moreover', 'indeed', 'such', 'about', 'first', 'last', 'letter', 'letters', 'living']);
const DEATH = /\b(martyr|martyrdom|slain|slew|beheaded|strangled|put to death|met (his|her) death|suffered martyrdom|was killed|were killed|executed|done to death|breathed his last|breathed her last|fell (a martyr|beneath|in|at|fighting|defending|pierced|mortally))\b/i;

let people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.summary, er.aliases, er.kinship, er.research_notes
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion='' AND er.summary IS NOT NULL ORDER BY (ge.importance IS NULL), ge.importance DESC`);
if (MIN) people = people.filter((p) => (p.imp || 0) >= MIN);
if (ONLY) people = people.filter((p) => ONLY.has(p.id));
if (LIMIT) people = people.slice(0, LIMIT);
console.error(`fact catalog: ${people.length} persons${WRITE ? ' [WRITE]' : ' [dry]'}`);

const SYS = `You build a CITED FACT CATALOG for ONE person from authoritative Bábí/Bahá'í histories (God Passes By = brief/authoritative; The Dawn-Breakers = detailed narrative with the relationships). You get the person's IDENTITY and numbered PASSAGES where a similar name/title appears. Names/titles are widely shared (e.g. "Ásíyih" = Pharaoh's wife; "Navváb" = an adversary), so FIRST judge from the identity context whether each passage is about THIS person — not a namesake.
For each genuine, significant fact about this person, output: {"n": passage number it is drawn from, "relation": a short kebab tag, "statement": a clear factual sentence (you MAY paraphrase for clarity, but it must be supported by passage n; INCLUDE the PLACE where it happened when stated), "when": the time/period the passage gives — a year ("1848"), a date, or an era ("the Baghdád period") — or null if none}.
Cover: identity/role/title; significant deeds and role in the upheavals; CONNECTIONS to other people — family ("father-of", "brother-of", "wife-of"), "converted-by"/"converted", "accompanied", "appointed-by", and especially whether and WHERE they "met"/"recognized" the Báb or Bahá'u'lláh (relations like "met-bahaullah", "recognized-bab", "letter-of-the-living"); and their FATE (e.g. "martyred-at-tabarsi", "executed", "died-in-exile").
For any meeting, event, deed, or fate, the WHERE belongs in the statement and the WHEN in the "when" field whenever the passage gives them — these power who-met-whom-where-when analysis.
RULES: Only assert a fact a passage actually supports — never infer beyond it (if no passage shows they met Bahá'u'lláh, do NOT claim it). COPY proper names and specifics EXACTLY as the passage gives them; NEVER substitute or conflate a different person or event — e.g. if the passage says the Báb grieved over the martyrdom of Quddús, do NOT write "death of Muḥammad Sháh." The fact must be ABOUT this person, not someone else in the passage. A person with a DIFFERENT NISBA (place-of-origin suffix — e.g. "-i-Yazdí" of Yazd vs "-i-Turshízí" of Turshíz) is a DIFFERENT individual; nisbas rarely vary, so never treat them as the same person. Skip trivial narrative and bare co-mentions.
Return ONLY JSON: {"facts":[{"n":<num>,"relation":"<tag>","statement":"<clear fact incl. place>","when":"<period or null>"}]}.`;

let done = 0, withF = 0, total = 0;
async function one(p) {
  let notes = {}; try { notes = JSON.parse(p.research_notes || '{}'); } catch {}
  let aliases = [], kin = [];
  try { aliases = JSON.parse(p.aliases || '[]'); } catch {}
  try { kin = JSON.parse(p.kinship || '[]'); } catch {}
  let cids = [];
  try { cids = [...new Set((await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id = ?', [p.id])).map((m) => String(m.content_id)))]; } catch {}
  if (!cids.length) return null;
  const all = await queryAll(`SELECT c.id, c.external_para_id pid, c.text, c.doc_id, d.source_url url FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.id IN (${cids.slice(0, 600).map(() => '?').join(',')}) AND c.doc_id IN (21310,57347,${DBID}) ORDER BY c.id`, cids.slice(0, 600));
  if (!all.length) return null;
  const gpb = all.filter((r) => r.doc_id !== DBID).slice(0, GMAX);
  const dbAll = all.filter((r) => r.doc_id === DBID);
  const death = dbAll.filter((r) => DEATH.test(r.text)).slice(-3);
  const seen = new Set([...gpb.map((r) => r.id), ...death.map((r) => r.id)]);
  const pool = dbAll.filter((r) => !seen.has(r.id));
  const want = Math.max(1, DBMAX - death.length);
  const sampled = []; const step = pool.length > want ? pool.length / want : 1;
  for (let i = 0; i < pool.length && sampled.length < want; i += step) sampled.push(pool[Math.floor(i)]);
  const rows = [...gpb, ...sampled, ...death];
  const passages = rows.map((r, i) => ({ ...r, ct: clean(r.text), n: i + 1 }));
  const idLine = `PERSON: ${p.cn}${aliases.length ? ' (also: ' + aliases.slice(0, 6).join(', ') + ')' : ''}. ${clean(p.summary).slice(0, 320)}` +
    (kin.length ? ' Kin: ' + kin.slice(0, 4).map((k) => `${k.relation} ${k.who}`).join('; ') + '.' : '');
  const body = passages.map((x) => `[${x.n}] ${x.ct.slice(0, 750)}`).join('\n\n');
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `${idLine}\n\nPASSAGES:\n${body}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1800, responseFormat: { type: 'json_object' } });
    let items = [];
    try { const m = (res.content || '').match(/\{[\s\S]*\}/); items = m ? (JSON.parse(m[0]).facts || []) : []; }
    catch { for (const mm of (res.content || '').matchAll(/"n"\s*:\s*(\d+)[\s\S]*?"relation"\s*:\s*"([^"]*)"[\s\S]*?"statement"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) items.push({ n: +mm[1], relation: mm[2], statement: mm[3].replace(/\\"/g, '"') }); }
    const facts = []; const seenS = new Set();
    for (const it of items) {
      const pass = passages.find((x) => x.n === Number(it.n)); if (!pass || !it.statement) continue;
      const st = clean(it.statement); if (st.length < 10) continue;
      const key = st.toLowerCase().slice(0, 60); if (seenS.has(key)) continue; seenS.add(key);
      // conflation guard: every significant proper noun in the fact must appear in the cited passage — catches
      // paraphrase that imports a different person/event (e.g. "death of Muḥammad Sháh" when the passage names Quddús)
      const ptn = normq(pass.ct).replace(/[^a-z ]/g, ' ');
      const propers = [...new Set((st.match(/[A-ZÁÉÍÓÚÀ-Ý][\wÀ-ÿ’'-]{3,}/g) || []).map((w) => normq(w).replace(/[^a-z]/g, '')).filter((w) => w.length >= 4 && !STOPCAP.has(w)))];
      if (propers.some((w) => !ptn.includes(w.slice(0, Math.min(6, w.length))))) continue;
      const when = it.when && String(it.when).trim() && !/^(null|none|n\/a|unknown)$/i.test(String(it.when).trim()) ? String(it.when).trim().slice(0, 40) : null;
      facts.push({ statement: st, relation: String(it.relation || '').toLowerCase().replace(/[^a-z0-9:-]+/g, '-').slice(0, 40), when,
        source: bookOf(pass.doc_id), paraId: pass.pid, url: pass.url && pass.pid ? `${pass.url}?paraId=${pass.pid}` : null });
    }
    if (!facts.length) return null;
    notes.facts2 = facts; withF++; total += facts.length;
    if (WRITE) await query(`UPDATE entity_research SET research_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE canonical_name = ?`, [JSON.stringify(notes), p.cn]);
    return `  ${p.id} ${p.cn} (${facts.length}): ${facts.slice(0, 6).map((f) => `[${f.relation}] ${f.statement.slice(0, 48)} (${f.source.replace('The ', '')})`).join('  ·  ')}`;
  } catch (e) { return `  ERR ${p.id} ${String(e.message || e).slice(0, 60)}`; }
}
for (let i = 0; i < people.length; i += CONC) {
  const r = await Promise.all(people.slice(i, i + CONC).map(one));
  for (const line of r) if (line) console.log(line);
  done += Math.min(CONC, people.length - i);
  if (Math.floor(done / 100) > Math.floor((done - CONC) / 100)) process.stderr.write(`  …${done}/${people.length} (${withF} persons, ${total} facts)\n`);
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN'} — ${withF}/${people.length} persons given a fact catalog (${total} cited facts)`);
process.exit(0);
