// Dawn-Breakers facts pass — the general characterization run was GPB-weighted, so the Dawn-Breakers (Nabíl's
// detailed narrative — the substance: deeds, episodes, fate) was under-mined. This pass goes DB-heavy for the
// IMPORTANT, multi-mention characters: extract the most important verbatim FACTS from The Dawn-Breakers (21308),
// disambiguated + about-the-person + verbatim-verified, and MERGE them into research_notes.characterizations
// (dedup against the existing GPB extracts). Run ON tower-nas with SIFTER_WRITER_URL set.
// Env: MIN=<importance, default 30> MINMENT=<min DB mentions, default 3> DBMAX=<cands, 24> CONC=5 ONLY=ids WRITE=1
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
const ai = await import('../../api/lib/ai.js');
const { query, queryAll, graphQueryAll } = await import('../../api/lib/db.js');
const WRITE = process.env.WRITE === '1';
const MIN = Number(process.env.MIN || 30);
const MINMENT = Number(process.env.MINMENT || 3);
const DBMAX = Number(process.env.DBMAX || 24);
const CONC = Number(process.env.CONC || 5);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
const DB = 21308;
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const normq = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ"“”]/g, "'").toLowerCase();
const toks = (s) => normq(s).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
const TITLE = new Set(['the', 'and', 'his', 'her', 'was', 'who', 'son', 'sir', 'lady', 'haji', 'mirza', 'mulla', 'siyyid', 'shaykh', 'aqa', 'khan', 'khanum', 'jinab', 'that', 'this', 'same', 'with', 'for', 'from', 'had', 'has', 'its', 'one', 'mrs']);
const DEATH = /\b(martyr|martyrdom|slain|slew|beheaded|strangled|put to death|met (his|her) death|suffered martyrdom|was killed|were killed|executed|done to death|breathed his last|breathed her last|fell (a martyr|beneath|in|at|fighting|defending|pierced|mortally))\b/i;

let people = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.importance imp, er.summary, er.aliases, er.kinship, er.research_notes
  FROM graph_entities ge JOIN entity_research er ON er.canonical_name = ge.canonical_name
  WHERE ge.entity_type='person' AND ge.religion='' AND er.summary IS NOT NULL ORDER BY (ge.importance IS NULL), ge.importance DESC`);
if (MIN) people = people.filter((p) => (p.imp || 0) >= MIN);
if (ONLY) people = people.filter((p) => ONLY.has(p.id));
console.error(`DB facts: ${people.length} candidate persons (imp>=${MIN})${WRITE ? ' [WRITE]' : ' [dry]'}`);

const SYS = `You extract the MOST IMPORTANT FACTS about ONE person from The Dawn-Breakers (Nabíl's detailed narrative of the Bábí period). You are given the person's IDENTITY and numbered PASSAGES where a similar name/title appears. Names/titles are widely shared, so FIRST judge from the identity context whether each passage is about THIS person — not a namesake.
Extract the SIGNIFICANT facts AND RELATIONSHIPS (the Dawn-Breakers holds the factual detail and the connections between people that the briefer God Passes By omits): their defining deeds and role in the upheavals (Shaykh Ṭabarsí, Zanján, Nayríz, Badasht…); CONNECTIONS to other figures — family ties (father/son/brother/wife of…), who converted them or whom they converted, whom they accompanied, who appointed or sent them, and whether they met or attained the presence of the Báb or Bahá'u'lláh; titles conferred on them; and their FATE (how/where they died or were martyred). Capturing the connections between people is especially important. Give the shortest exact verbatim span that states each fact.
DO NOT extract trivial narrative — movements ("came back to Karbilá"), gestures ("sprang to his feet"), dialogue beats, or bare co-mentions. Prefer the 3–6 MOST IMPORTANT facts; quality over quantity.
CRUCIAL: each span must be ABOUT this person (their own deed/fate/relationship) — NEVER a clause about someone else who merely appears in the passage. Quote EXACTLY.
Return ONLY JSON: {"items":[{"n":<passage number>,"quote":"<exact verbatim span>"}]}.`;

let done = 0, touched = 0, added = 0, skippedFew = 0;
async function one(p) {
  let notes = {}; try { notes = JSON.parse(p.research_notes || '{}'); } catch {}
  const existing = Array.isArray(notes.characterizations) ? notes.characterizations : [];
  const have = new Set(existing.map((c) => normq(c.quote)));
  let aliases = [], kin = [];
  try { aliases = JSON.parse(p.aliases || '[]'); } catch {}
  try { kin = JSON.parse(p.kinship || '[]'); } catch {}
  let cids = [];
  try { cids = [...new Set((await graphQueryAll('SELECT content_id FROM entity_mentions WHERE entity_id = ?', [p.id])).map((m) => String(m.content_id)))]; } catch {}
  if (!cids.length) return null;
  const all = await queryAll(`SELECT c.id, c.external_para_id pid, c.text, d.source_url url FROM content c JOIN docs d ON d.id = c.doc_id
    WHERE c.id IN (${cids.slice(0, 600).map(() => '?').join(',')}) AND c.doc_id = ${DB} ORDER BY c.id`, cids.slice(0, 600));
  if (all.length < MINMENT) { skippedFew++; return null; }   // focus on multi-mention characters
  // sample EVENLY across the whole narrative arc (early recognition → climactic deeds → martyrdom) so a prolific
  // figure's important later events aren't crowded out by early-life passages; plus the death scene explicitly.
  const death = all.filter((r) => DEATH.test(r.text)).slice(-3);
  const seen = new Set(death.map((r) => r.id));
  const pool = all.filter((r) => !seen.has(r.id));
  const want = Math.max(1, DBMAX - death.length);
  const sampled = [];
  const step = pool.length > want ? pool.length / want : 1;
  for (let i = 0; i < pool.length && sampled.length < want; i += step) sampled.push(pool[Math.floor(i)]);
  const rows = [...sampled, ...death];
  const passages = rows.map((r, i) => ({ ...r, ct: clean(r.text), n: i + 1 }));
  const idLine = `PERSON: ${p.cn}${aliases.length ? ' (also: ' + aliases.slice(0, 6).join(', ') + ')' : ''}. ${clean(p.summary).slice(0, 320)}` +
    (kin.length ? ' Kin: ' + kin.slice(0, 4).map((k) => `${k.relation} ${k.who}`).join('; ') + '.' : '');
  const body = passages.map((x) => `[${x.n}] ${x.ct.slice(0, 800)}`).join('\n\n');
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `${idLine}\n\nPASSAGES:\n${body}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1400, responseFormat: { type: 'json_object' } });
    let items = [];
    try { const m = (res.content || '').match(/\{[\s\S]*\}/); items = m ? (JSON.parse(m[0]).items || []) : []; }
    catch { for (const mm of (res.content || '').matchAll(/"n"\s*:\s*(\d+)\s*,\s*"quote"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) items.push({ n: +mm[1], quote: mm[2].replace(/\\"/g, '"') }); }
    const nameToks = new Set([...toks(p.cn), ...aliases.flatMap(toks)]);
    const fresh = [];
    for (const it of items) {
      const pass = passages.find((x) => x.n === Number(it.n)); if (!pass || !it.quote) continue;
      const q = clean(it.quote).replace(/^["'“”]+|["'“”]+$/g, '');
      if (q.length < 8) continue;
      if (!normq(pass.ct).includes(normq(q))) continue;                                  // verbatim in source
      if (toks(q).filter((t) => !nameToks.has(t) && !TITLE.has(t)).length < 2) continue;  // not a bare name/title
      const key = normq(q); if (have.has(key) || fresh.some((f) => normq(f.quote) === key)) continue;   // dedup vs existing + within
      fresh.push({ quote: q, source: 'The Dawn-Breakers', paraId: pass.pid, url: pass.url && pass.pid ? `${pass.url}?paraId=${pass.pid}` : null });
    }
    if (!fresh.length) return null;
    notes.characterizations = [...existing, ...fresh]; touched++; added += fresh.length;
    if (WRITE) await query(`UPDATE entity_research SET research_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE canonical_name = ?`, [JSON.stringify(notes), p.cn]);
    return `  ${p.id} ${p.cn} +${fresh.length} DB: ${fresh.map((c) => '“' + c.quote.slice(0, 55) + '…”').join('  ·  ')}`;
  } catch (e) { return `  ERR ${p.id} ${String(e.message || e).slice(0, 60)}`; }
}
for (let i = 0; i < people.length; i += CONC) {
  const r = await Promise.all(people.slice(i, i + CONC).map(one));
  for (const line of r) if (line) console.log(line);
  done += Math.min(CONC, people.length - i);
  if (Math.floor(done / 100) > Math.floor((done - CONC) / 100)) process.stderr.write(`  …${done}/${people.length} (+${added} DB facts to ${touched} persons)\n`);
}
console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN'} — added ${added} Dawn-Breakers facts to ${touched} persons (${skippedFew} skipped: <${MINMENT} DB mentions)`);
process.exit(0);
