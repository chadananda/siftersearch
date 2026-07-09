// EPISODE extraction — fixes person↔episode association. Per-person sampling loses shared events (Badasht, the
// journey to Ṭabarsí, the Síyáh-Chál) because a shared episode is "about" several people at once. The Dawn-Breakers
// already delineates every scene with its OWN HEADING ("His journey to Shíráz", "The anecdote of …"), so we use
// those headings as episode boundaries and extract each section as a first-class EPISODE — place, time, summary,
// source paragraphs, and the full PARTICIPANT ROSTER with each person's role. Connection queries ("who met
// Bahá'u'lláh") then = the roster, captured once from the episode's own passages.
//
// Phase 1 (this script): detect episodes + rosters per heading-section, dry by default. Env: DOC=21308 CONC=4
//   FROM/TO=<paragraph_index> (test a range) MINP=1 OUT=<json path to write episodes>
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'node:fs';
const ai = await import('../../api/lib/ai.js');
const { queryAll } = await import('../../api/lib/db.js');
const DOC = Number(process.env.DOC || 21308), CONC = Number(process.env.CONC || 4);
const FROM = process.env.FROM ? Number(process.env.FROM) : null, TO = process.env.TO ? Number(process.env.TO) : null;
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const bookOf = (id) => (id === 21308 ? 'The Dawn-Breakers' : 'God Passes By');
// front-matter / non-narrative headings to skip (no event roster)
// skip ONLY unambiguous front-matter / chapter dividers. The model returns null for any non-event section, so do NOT
// over-skip: a too-broad filter (it had matched lowercase "a./b./c." sub-headings) silently ate real narrative
// sub-scenes like "b. His visit to Ṭihrán" — the explicit Mullá Ḥusayn↔Bahá'u'lláh meeting. Uppercase "A./B./C./D."
// are the Introduction's sub-points (front matter); lowercase are narrative scenes.
const SKIP_NAMED = /^(foreword|nabíl|shoghi effendi|introduction|preface|acknowledgment|genealogy|key to|the qájár dynasty|extracts from)/i;
const isSkip = (h) => SKIP_NAMED.test(h || '') || /^[A-D]\.\s/.test(h || '') || /^[-\s\\]*chapter\b/i.test(h || '');

let rows = await queryAll(`SELECT external_para_id pid, paragraph_index pix, text, heading FROM content
  WHERE doc_id=? AND text IS NOT NULL ORDER BY paragraph_index`, [DOC]);
if (FROM != null) rows = rows.filter((r) => r.pix >= FROM && (TO == null || r.pix <= TO));
rows = rows.filter((r) => clean(r.text).length > 40);
// group consecutive paragraphs that share a heading → one section = one candidate episode
const sections = [];
for (const r of rows) {
  const last = sections[sections.length - 1];
  if (last && last.heading === r.heading) last.rows.push(r);
  else sections.push({ heading: r.heading || '(untitled)', rows: [r] });
}
const work = sections.filter((s) => !isSkip(s.heading));
console.error(`episodes: ${rows.length} paragraphs → ${sections.length} heading-sections (${work.length} candidate after skipping front-matter) of doc ${DOC}${process.env.OUT ? ' [WRITE ' + process.env.OUT + ']' : ' [dry]'}`);

const SYS = `You are given ONE titled section of an authoritative Bábí/Bahá'í history (its HEADING + paragraphs). The heading already names the scene. Extract the EPISODE this section recounts: a locatable event in which NAMED people take part together (a gathering/conference, journey, meeting, siege or battle, imprisonment, pilgrimage, martyrdom, declaration).
Output JSON {"episode": {"name": a short canonical name for the event (refine the heading if needed, e.g. "Conference of Badasht"), "place": where it happened (or null), "when": the year/date/era the text gives (or null), "summary": one or two factual sentences naming what happened and who was involved, "participants": [{"name": the person EXACTLY as the text names them, "role": their specific action/role in THIS episode — e.g. "rented three gardens and hosted all 81", "was assigned a garden", "appeared unveiled", "accompanied Bahá'u'lláh from Núr"}]}}.
List EVERY named participant the section places in the event — including central figures (the Báb, Bahá'u'lláh) when present. Copy names EXACTLY as written. A participant must actually take part in the event, not merely be mentioned in passing.
If this section is not a real event with named participants (it is commentary, doctrine, genealogy, a list, or a lone reflection), return {"episode": null}.`;

const all = [];
async function one(sec) {
  const passages = sec.rows.map((r) => ({ ...r, ct: clean(r.text), n: r.pix }));
  const body = passages.map((x) => `[¶${x.n}] ${x.ct.slice(0, 850)}`).join('\n\n');
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `HEADING: ${sec.heading}\n\nPARAGRAPHS:\n${body}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 1600, responseFormat: { type: 'json_object' } });
    let e = null; try { const m = (res.content || '').match(/\{[\s\S]*\}/); e = m ? JSON.parse(m[0]).episode : null; } catch {}
    if (!e || !e.name || !Array.isArray(e.participants) || e.participants.length < 2) return;
    all.push({ name: clean(e.name), heading: sec.heading, place: e.place ? clean(e.place) : null, when: e.when ? clean(String(e.when)).slice(0, 40) : null,
      summary: clean(e.summary || ''), participants: e.participants.map((p) => ({ name: clean(p.name), role: clean(p.role || '') })).filter((p) => p.name),
      source: bookOf(DOC), paraIds: passages.map((x) => x.pid), paraIxs: passages.map((x) => x.n) });
  } catch (e) { /* skip section on error */ }
}
for (let i = 0; i < work.length; i += CONC) { await Promise.all(work.slice(i, i + CONC).map(one)); process.stderr.write(`  …section ${Math.min(i + CONC, work.length)}/${work.length} (${all.length} episodes)\n`); }

// merge episodes that are clearly the same event (same normalized name OR same place+overlapping participants)
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim();
const merged = [];
for (const e of all) {
  const hit = merged.find((m) => norm(m.name) === norm(e.name) || (e.place && m.place && norm(m.place) === norm(e.place) &&
    e.participants.some((p) => m.participants.some((q) => norm(p.name) === norm(q.name)))));
  if (hit) {
    for (const p of e.participants) { const ex = hit.participants.find((q) => norm(q.name) === norm(p.name)); if (ex) { if (p.role && !ex.role.includes(p.role)) ex.role = ex.role ? ex.role + '; ' + p.role : p.role; } else hit.participants.push(p); }
    hit.paraIds = [...new Set([...hit.paraIds, ...e.paraIds])]; hit.paraIxs = [...new Set([...hit.paraIxs, ...e.paraIxs])];
    if (!hit.place && e.place) hit.place = e.place; if (!hit.when && e.when) hit.when = e.when;
    if (e.summary.length > hit.summary.length) hit.summary = e.summary;
  } else merged.push({ ...e });
}
merged.sort((a, b) => Math.min(...(a.paraIxs.length ? a.paraIxs : [1e9])) - Math.min(...(b.paraIxs.length ? b.paraIxs : [1e9])));
for (const e of merged) console.log(`\n■ ${e.name}${e.place ? ' @ ' + e.place : ''}${e.when ? ' (' + e.when + ')' : ''}  [¶${e.paraIxs.slice(0, 6).join(',')}]\n   ${e.summary}\n   roster(${e.participants.length}): ${e.participants.slice(0, 14).map((p) => `${p.name}${p.role ? ' — ' + p.role.slice(0, 40) : ''}`).join(' · ')}`);
console.log(`\n${merged.length} episodes (${all.length} raw) from ${work.length} heading-sections`);
if (process.env.OUT) { writeFileSync(process.env.OUT, JSON.stringify(merged, null, 2)); console.error(`wrote ${merged.length} episodes to ${process.env.OUT}`); }
process.exit(0);
