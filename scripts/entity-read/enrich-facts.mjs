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
// the place-of-origin nisba(s) in a name's "<name>-i-<Nisba>" construct — the strongest namesake discriminator
const nisbasOf = (name) => { const out = new Set(); for (const m of String(name).matchAll(/[-y]i-([A-ZÁÉÍÓÚÀ-ÿ][A-Za-zÀ-ÿ’'-]{3,})/g)) out.add(m[1]); return [...out]; };
const DEATH = /\b(martyr|martyrdom|slain|slew|beheaded|strangled|put to death|met (his|her) death|suffered martyrdom|was killed|were killed|executed|done to death|breathed his last|breathed her last|fell (a martyr|beneath|in|at|fighting|defending|pierced|mortally))\b/i;

let people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.summary, er.aliases, er.kinship, er.research_notes
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion='' AND er.summary IS NOT NULL ORDER BY (ge.importance IS NULL), ge.importance DESC`);
if (MIN) people = people.filter((p) => (p.imp || 0) >= MIN);
if (ONLY) people = people.filter((p) => ONLY.has(p.id));
// STALEONLY: only (re)process people whose facts2 is missing/empty or carries pre-QC facts lacking a proof span —
// leaves the already-QC'd-with-proof people untouched (no wasted re-extraction).
if (process.env.STALEONLY === '1') people = people.filter((p) => {
  let f; try { f = JSON.parse(p.research_notes || '{}').facts2; } catch {}
  return !Array.isArray(f) || f.length === 0 || f.some((x) => !x.quote);
});
if (LIMIT) people = people.slice(0, LIMIT);
console.error(`fact catalog: ${people.length} persons${WRITE ? ' [WRITE]' : ' [dry]'}`);

const SYS = `You build a CITED FACT CATALOG for ONE person from authoritative Bábí/Bahá'í histories (God Passes By = brief/authoritative; The Dawn-Breakers = detailed narrative with the relationships). You get the person's IDENTITY and numbered PASSAGES where a similar name/title appears. Names/titles are widely shared (e.g. "Ásíyih" = Pharaoh's wife; "Navváb" = an adversary), so FIRST judge from the identity context whether each passage is about THIS person — not a namesake.
For each genuine, significant fact about this person, output: {"n": passage number it is drawn from, "relation": a short kebab tag, "statement": a clear factual sentence (you MAY paraphrase for clarity, but it must be supported by passage n; INCLUDE the PLACE where it happened when stated), "quote": the SHORTEST exact verbatim span COPIED from passage n that proves this fact (this is the evidence — copy it character-for-character from the passage, do not paraphrase the quote), "when": the time/period the passage gives — a year ("1848"), a date, or an era ("the Baghdád period") — or null if none}.
Cover: identity/role/title; significant deeds and role in the upheavals; CONNECTIONS to other people — family ("father-of", "brother-of", "wife-of"), "converted-by"/"converted", "accompanied", "appointed-by", and especially whether and WHERE they "met"/"recognized" the Báb or Bahá'u'lláh (relations like "met-bahaullah", "recognized-bab", "letter-of-the-living"); and their FATE (e.g. "martyred-at-tabarsi", "executed", "died-in-exile").
For any meeting, event, deed, or fate, the WHERE belongs in the statement and the WHEN in the "when" field whenever the passage gives them — these power who-met-whom-where-when analysis.
RULES: Only assert a fact a passage actually supports — never infer beyond it (if no passage shows they met Bahá'u'lláh, do NOT claim it). COPY proper names and specifics EXACTLY as the passage gives them; NEVER substitute or conflate a different person or event — e.g. if the passage says the Báb grieved over the martyrdom of Quddús, do NOT write "death of Muḥammad Sháh." The fact must be ABOUT this person, not someone else in the passage. A person with a DIFFERENT NISBA (place-of-origin suffix — e.g. "-i-Yazdí" of Yazd vs "-i-Turshízí" of Turshíz) is a DIFFERENT individual; nisbas rarely vary, so never treat them as the same person. Skip trivial narrative and bare co-mentions.
Return ONLY JSON: {"facts":[{"n":<num>,"relation":"<tag>","statement":"<clear fact incl. place>","quote":"<exact verbatim span proving it>","when":"<period or null>"}]}.`;

const VSYS = `You are a STRICT fact-checker whose ONLY job is to prevent NAMESAKE CONFUSION in a biography. You are given ONE person's verified IDENTITY, then a numbered list of CANDIDATE FACTS — each paired with the exact source PASSAGE it was drawn from. Common names and titles (e.g. "Siyyid Ḥusayn", "Aḥmad", "Mullá Muḥammad") are shared by MANY different people, so a passage that merely contains the person's name is frequently about a DIFFERENT person of the same name.
For each candidate, decide keep=true ONLY if BOTH hold: (1) the subject of the passage is unmistakably THIS SAME person — consistent with the IDENTITY given (their NISBA / place of origin, their role, era, and known deeds) — and NOT a same-named individual of a different nisba, place, station, or period; and (2) the passage genuinely states the claim about this person (not about someone else who merely appears in it).
Set keep=false if the subject could be a different same-named person, if the claimed deed/place/era does not fit this person's established identity, or if the passage does not clearly support the claim. A different NISBA means a different person — reject. When in ANY doubt, keep=false: omitting a true fact is acceptable, asserting a fact about the wrong person is NOT.
Return ONLY JSON: {"v":[{"i":<fact number>,"keep":true|false,"why":"<short reason>"}]}.`;

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
  const myNisbas = [...new Set([...nisbasOf(p.cn), ...aliases.flatMap(nisbasOf)])];
  // sibling disambiguation: other modelled people who SHARE this given-name stem (different nisba) — the bare name
  // in a passage may be one of THEM, so name them explicitly and let the extractor/verifier attribute deeds away.
  const stem = p.cn.split(/[-y]i-/)[0].trim();
  let siblings = [];
  if (stem.length >= 5 && stem.split(/\s+/).length >= 2) {
    try {
      siblings = await queryAll(`SELECT ge.id, ge.canonical_name cn, er.summary FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
        WHERE ge.entity_type='person' AND ge.religion='' AND ge.id != ? AND ge.canonical_name LIKE ? ORDER BY ge.importance DESC LIMIT 14`, [p.id, stem + '%']);
    } catch {}
  }
  const idLine = `PERSON: ${p.cn}${aliases.length ? ' (also: ' + aliases.slice(0, 6).join(', ') + ')' : ''}. ${clean(p.summary).slice(0, 320)}` +
    (kin.length ? ' Kin: ' + kin.slice(0, 4).map((k) => `${k.relation} ${k.who}`).join('; ') + '.' : '') +
    (myNisbas.length ? ` NISBA: ${myNisbas.join('/')} — a same-named person of a different nisba/place is a DIFFERENT individual.` : '') +
    (siblings.length ? `\nDISTINCT OTHER PEOPLE who share the name "${stem}" — their deeds, places, and fate are NOT this person's; if a passage is about one of them, do NOT use it: ` +
      siblings.map((s) => `«${s.cn}»${nisbasOf(s.cn).length ? '' : ''} (${clean(s.summary).slice(0, 90)})`).join('; ') : '');
  const body = passages.map((x) => `[${x.n}] ${x.ct.slice(0, 750)}`).join('\n\n');
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `${idLine}\n\nPASSAGES:\n${body}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1800, responseFormat: { type: 'json_object' } });
    let items = [];
    try { const m = (res.content || '').match(/\{[\s\S]*\}/); items = m ? (JSON.parse(m[0]).facts || []) : []; }
    catch { for (const mm of (res.content || '').matchAll(/"n"\s*:\s*(\d+)[\s\S]*?"relation"\s*:\s*"([^"]*)"[\s\S]*?"statement"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) items.push({ n: +mm[1], relation: mm[2], statement: mm[3].replace(/\\"/g, '"') }); }
    let facts = []; const seenS = new Set();
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
      // verbatim proof span — the evidence the user verifies against. Keep only if it really occurs in the passage.
      let quote = clean(it.quote || '').replace(/^["'“”]+|["'“”]+$/g, '');
      if (quote.length < 8 || !normq(pass.ct).includes(normq(quote))) quote = '';
      if (!quote) {  // fallback: the model paraphrased instead of copying — pick the source sentence that best supports the statement
        const stoks = new Set(normq(st).split(/\s+/).filter((w) => w.length > 3 && !STOPCAP.has(w)));
        let bestS = '', bestO = 0;
        for (const s of pass.ct.split(/(?<=[.!?”’])\s+/)) {
          const o = normq(s).split(/\s+/).filter((w) => stoks.has(w)).length;
          if (o > bestO) { bestO = o; bestS = s; }
        }
        if (bestO >= 3 && bestS.trim().length >= 12) quote = clean(bestS).slice(0, 320);
      }
      facts.push({ statement: st, quote, relation: String(it.relation || '').toLowerCase().replace(/[^a-z0-9:-]+/g, '-').slice(0, 40), when,
        source: bookOf(pass.doc_id), paraId: pass.pid, url: pass.url && pass.pid ? `${pass.url}?paraId=${pass.pid}` : null, _ct: pass.ct });
    }
    if (!facts.length) { if (WRITE && Array.isArray(notes.facts2) && notes.facts2.length) { notes.facts2 = []; await query(`UPDATE entity_research SET research_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE canonical_name = ?`, [JSON.stringify(notes), p.cn]); } return null; }
    // QUALITY CONTROL — strict verification: an independent skeptical pass confirms each fact is about THIS person
    // (consistent with their nisba/role/era), not a same-named individual. The mention layer links by bare given
    // name, so passages about other "Siyyid Ḥusayn"s leak in; this is the gate that rejects them. Default: reject.
    if (facts.length) {
      const vbody = facts.map((f, i) => `[${i + 1}] CLAIM: ${f.statement}\n    PASSAGE: ${f._ct.slice(0, 700)}`).join('\n\n');
      try {
        const vr = await ai.chatCompletion([{ role: 'system', content: VSYS }, { role: 'user', content: `${idLine}\n\nCANDIDATE FACTS (each with the passage it was drawn from):\n${vbody}` }],
          { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1500, responseFormat: { type: 'json_object' } });
        let verdicts = [];
        try { const m = (vr.content || '').match(/\{[\s\S]*\}/); verdicts = m ? (JSON.parse(m[0]).v || []) : []; }
        catch { for (const mm of (vr.content || '').matchAll(/"i"\s*:\s*(\d+)[\s\S]*?"keep"\s*:\s*(true|false)/g)) verdicts.push({ i: +mm[1], keep: mm[2] === 'true' }); }
        if (verdicts.length) {
          const keepSet = new Set(verdicts.filter((v) => v.keep === true || v.keep === 'true').map((v) => Number(v.i)));
          facts = facts.filter((_, i) => keepSet.has(i + 1));
        }
      } catch { /* verifier unavailable — keep extraction as-is rather than drop everything */ }
    }
    facts = facts.map(({ _ct, ...f }) => f);
    if (!facts.length) { if (WRITE && Array.isArray(notes.facts2) && notes.facts2.length) { notes.facts2 = []; await query(`UPDATE entity_research SET research_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE canonical_name = ?`, [JSON.stringify(notes), p.cn]); } return null; }
    notes.facts2 = facts; withF++; total += facts.length;
    if (WRITE) await query(`UPDATE entity_research SET research_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE canonical_name = ?`, [JSON.stringify(notes), p.cn]);
    return `  ${p.id} ${p.cn} (${facts.length}): ${facts.slice(0, 6).map((f) => `[${f.relation}] ${f.statement.slice(0, 44)} ⟨${(f.quote || 'NO-QUOTE').slice(0, 38)}⟩`).join('  ·  ')}`;
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
