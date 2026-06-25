// Characterization extraction — the foundational per-entity data: precise, correctly-attributed
// characterizations + facts drawn from the CORE sources (God Passes By 21310/57347, The Dawn-Breakers 21308).
//
// A name-mention does NOT mean a paragraph is about a person, and names/titles are widely shared
// ("Ásíyih" → Pharaoh's wife; "Navváb" → an adversary). So for each candidate passage the AI must (1) decide,
// from the person's identity context, whether it genuinely refers to THIS person (not a namesake), and (2) if
// so, excerpt only the SHORT verbatim clause that characterizes them — never whole paragraphs/sentences.
// Every kept quote is verified to occur verbatim in the source (no paraphrase/hallucination), then stored with
// its citation. Result → entity_research.research_notes.characterizations = [{quote, source, paraId, url}].
// Reversible: `UPDATE entity_research SET research_notes = json_remove(research_notes,'$.characterizations')`.
// Run ON tower-nas with SIFTER_WRITER_URL set.  Env: MIN=<importance> LIMIT=<n> CONC=<n> MAXC=<cands> WRITE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const ai = await import('../../api/lib/ai.js');
const { query, queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const MIN = Number(process.env.MIN || 0);
const LIMIT = Number(process.env.LIMIT || 0);
const CONC = Number(process.env.CONC || 5);
const GMAX = Number(process.env.GMAX || 14);     // max GPB candidate passages per person
const DMAX = Number(process.env.DMAX || 14);     // max Dawn-Breakers candidate passages per person
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
const CORE = '21310,57347,21308';
const bookOf = (id) => (id === 21308 ? 'The Dawn-Breakers' : 'God Passes By');
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const normq = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, "'").toLowerCase();
const toks = (s) => normq(s).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
const TITLE = new Set(['the', 'and', 'his', 'her', 'was', 'who', 'son', 'sir', 'lady', 'haji', 'mirza', 'mulla', 'siyyid', 'shaykh', 'aqa', 'khan', 'khanum', 'jinab', 'that', 'this', 'same', 'with', 'for', 'from', 'had', 'has', 'its', 'one', 'mrs']);

let people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.side, er.summary, er.aliases, er.kinship, er.research_notes
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion='' AND er.summary IS NOT NULL
  ORDER BY (ge.importance IS NULL), ge.importance DESC`);
if (MIN) people = people.filter((p) => (p.imp || 0) >= MIN);
if (ONLY) people = people.filter((p) => ONLY.has(p.id));
if (LIMIT) people = people.slice(0, LIMIT);
console.error(`characterizations: ${people.length} persons${WRITE ? ' [WRITE]' : ' [dry]'}`);

const SYS = `You pull the USEFUL REFERENCES to ONE person from authoritative Bábí/Bahá'í histories — passages conveying important information about them: a CHARACTERIZATION (station, rank, title, qualities, role) OR a significant FACT, RELATIONSHIP, or CONNECTION (a defining deed, their fate, who they were related to, who converted/appointed/sent them, where they served). You are given the person's IDENTITY and numbered PASSAGES where a similar name or title appears. Names/titles are widely shared (e.g. "Ásíyih" may be the wife of Pharaoh; "Navváb" may be an adversary), so FIRST judge from the identity context whether each passage refers to THIS person — not a namesake.
DO extract (shortest exact verbatim span that carries the information): characterizations ("the iron-hearted Amír-Niẓám"), facts/fate ("martyred at fort of Shaykh Ṭabarsí"), relationships ("the mother of the Most Great Branch", "father of Badí‘"), connections ("directed by the Báb to Ṭihrán", "one of the first Western pilgrims to reach ‘Akká", "won to the Cause through Ṭáhirih").
DO NOT extract: a bare name in a list or pure co-occurrence with NO information ("accompanied by Quddús", "Dr. and Mrs. Getsinger"), or trivial movement of no significance. If a passage only names the person without conveying any fact, relationship, connection, or characterization, SKIP it.
CRUCIAL: the extracted span must be ABOUT this person — they must be its subject or the one it describes — NEVER a clause about a different individual who merely appears in the same passage. Quote EXACTLY from the passage.
BE REASONABLY COMPREHENSIVE: besides epithets, make sure to capture the person's FATE (how/where they died or were martyred), their major DEEDS, and key RELATIONSHIPS when the passages state them — these matter as much as descriptions.
Return ONLY JSON: {"items":[{"n":<passage number>,"quote":"<exact verbatim span>"}]}.`;

let done = 0, withChars = 0, totalQuotes = 0;
async function one(p) {
  let notes = {}; try { notes = JSON.parse(p.research_notes || '{}'); } catch {}
  let aliases = [], kin = [];
  try { aliases = JSON.parse(p.aliases || '[]'); } catch {}
  try { kin = JSON.parse(p.kinship || '[]'); } catch {}
  // candidate passages = this entity's mentions that fall in the core books (graph.db mention layer)
  let cids = [];
  try { cids = [...new Set((await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id = ?', [p.id])).map((m) => String(m.content_id)))]; } catch {}
  if (!cids.length) return null;
  const all = await queryAll(`SELECT c.id, c.external_para_id pid, c.text, c.doc_id, d.source_url url
    FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id IN (${cids.slice(0, 600).map(() => '?').join(',')}) AND c.doc_id IN (${CORE})
    ORDER BY c.id`, cids.slice(0, 600));
  // balance the candidate set across BOTH books so GPB characterizations AND Dawn-Breakers fate/deeds are seen
  const rows = [...all.filter((r) => r.doc_id !== 21308).slice(0, GMAX), ...all.filter((r) => r.doc_id === 21308).slice(0, DMAX)];
  if (!rows.length) return null;
  const passages = rows.map((r, i) => ({ ...r, ct: clean(r.text), n: i + 1 }));
  const idLine = `PERSON: ${p.cn}${aliases.length ? ' (also: ' + aliases.slice(0, 6).join(', ') + ')' : ''}. ${clean(p.summary).slice(0, 320)}` +
    (kin.length ? ' Kin: ' + kin.slice(0, 4).map((k) => `${k.relation} ${k.who}`).join('; ') + '.' : '');
  const body = passages.map((x) => `[${x.n}] ${x.ct.slice(0, 800)}`).join('\n\n');
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `${idLine}\n\nPASSAGES:\n${body}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 2000, responseFormat: { type: 'json_object' } });
    let items = [];
    try { const m = (res.content || '').match(/\{[\s\S]*\}/); items = m ? (JSON.parse(m[0]).items || []) : []; }
    catch { for (const mm of (res.content || '').matchAll(/"n"\s*:\s*(\d+)\s*,\s*"quote"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) items.push({ n: +mm[1], quote: mm[2].replace(/\\"/g, '"') }); }
    const nameToks = new Set([...toks(p.cn), ...aliases.flatMap(toks)]);
    const chars = []; const seen = new Set();
    for (const it of items) {
      const pass = passages.find((x) => x.n === Number(it.n)); if (!pass || !it.quote) continue;
      const q = clean(it.quote).replace(/^["'“”]+|["'“”]+$/g, '');
      if (q.length < 8) continue;
      if (!normq(pass.ct).includes(normq(q))) continue;   // VERIFY: quote must occur verbatim in the source
      if (toks(q).filter((t) => !nameToks.has(t) && !TITLE.has(t)).length < 2) continue;   // must add ≥2 descriptive words (drop bare name/title co-mentions)
      const key = normq(q); if (seen.has(key)) continue; seen.add(key);
      chars.push({ quote: q, source: bookOf(pass.doc_id), paraId: pass.pid, url: pass.url && pass.pid ? `${pass.url}?paraId=${pass.pid}` : null });
    }
    if (!chars.length) return null;
    notes.characterizations = chars; withChars++; totalQuotes += chars.length;
    if (WRITE) await query(`UPDATE entity_research SET research_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE canonical_name = ?`, [JSON.stringify(notes), p.cn]);
    return `  ${p.id} ${p.cn} (${chars.length}): ${chars.map((c) => '“' + c.quote.slice(0, 60) + '…” [' + c.source.replace('The ', '') + ']').join('  ·  ')}`;
  } catch (e) { return `  ERR ${p.id} ${String(e.message || e).slice(0, 60)}`; }
}
for (let i = 0; i < people.length; i += CONC) {
  const r = await Promise.all(people.slice(i, i + CONC).map(one));
  for (const line of r) if (line) console.log(line);
  done += Math.min(CONC, people.length - i);
  if (Math.floor(done / 100) > Math.floor((done - CONC) / 100)) process.stderr.write(`  …${done}/${people.length} (${withChars} persons, ${totalQuotes} quotes)\n`);
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN'} — ${withChars}/${people.length} persons given characterizations (${totalQuotes} verbatim quotes)`);
process.exit(0);
