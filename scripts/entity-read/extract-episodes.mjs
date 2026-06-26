// EPISODE extraction — fixes person↔episode association. Per-person sampling loses shared events (Badasht, the
// journey to Ṭabarsí, the Síyáh-Chál) because a shared episode is "about" several people at once. This reads the
// NARRATIVE in sequential windows and extracts each EPISODE as a first-class object — place, time, summary, source
// paragraphs, and the full PARTICIPANT ROSTER with each person's role — so every participant is captured once,
// consistently, from the episode's own passages. Connection queries ("who met Bahá'u'lláh") then = the roster.
//
// Phase 1 (this script): detect episodes + rosters from a doc, dry by default. Env: DOC=21308 WIN=8 OVER=2
//   FROM=<paragraph_index> TO=<paragraph_index> (test a range) CONC=4 OUT=<json path to write episodes>
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { writeFileSync } from 'node:fs';
const ai = await import('../../api/lib/ai.js');
const { queryAll } = await import('../../api/lib/db.js');
const DOC = Number(process.env.DOC || 21308), WIN = Number(process.env.WIN || 8), OVER = Number(process.env.OVER || 2);
const CONC = Number(process.env.CONC || 4);
const FROM = process.env.FROM ? Number(process.env.FROM) : null, TO = process.env.TO ? Number(process.env.TO) : null;
const clean = (t) => String(t || '').replace(/\[\^[^\]]*\]/g, '').replace(/\[pg[^\]]*\]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
const bookOf = (id) => (id === 21308 ? 'The Dawn-Breakers' : 'God Passes By');

let rows = await queryAll(`SELECT external_para_id pid, paragraph_index pix, text, doc_id FROM content
  WHERE doc_id=? AND text IS NOT NULL ORDER BY paragraph_index`, [DOC]);
if (FROM != null) rows = rows.filter((r) => r.pix >= FROM && (TO == null || r.pix <= TO));
rows = rows.filter((r) => clean(r.text).length > 40);
console.error(`episodes: ${rows.length} paragraphs of doc ${DOC} (win ${WIN}/over ${OVER})${process.env.OUT ? ' [WRITE ' + process.env.OUT + ']' : ' [dry]'}`);

const SYS = `You read a window of consecutive paragraphs from an authoritative Bábí/Bahá'í history and identify the distinct EPISODES in it. An EPISODE is a SIGNIFICANT, locatable event in which NAMED people take part together: a gathering or conference (e.g. Badasht), a journey, a meeting, a siege or battle (e.g. Fort Ṭabarsí), an imprisonment (e.g. the Síyáh-Chál), a pilgrimage, a martyrdom, a declaration. NOT an episode: general commentary, doctrine, a lone reflection, or a bare name-drop with no event.
For each episode in THIS window output: {"name": a short canonical name ("Conference of Badasht", "Journey to Fort Ṭabarsí"), "place": where it happened (or null), "when": the year/date/era the text gives (or null), "summary": one factual sentence, "participants": [{"name": the person EXACTLY as the text names them, "role": their specific action/role in this episode — e.g. "convened it and assigned a garden", "appeared unveiled", "accompanied Bahá'u'lláh"}], "n": [the paragraph numbers this episode is drawn from]}.
List EVERY named participant the passages place in the episode — including central figures (the Báb, Bahá'u'lláh) when present. Copy names exactly. If an episode clearly continues from an earlier window (same event/place), still report it with the participants visible here; episodes will be merged across windows by name+place.
Return ONLY JSON: {"episodes":[ ... ]} (empty array if the window holds no real episode).`;

const windows = [];
for (let i = 0; i < rows.length; i += (WIN - OVER)) { const w = rows.slice(i, i + WIN); if (w.length) windows.push(w); if (i + WIN >= rows.length) break; }

const all = [];
async function one(w, wi) {
  const passages = w.map((r, i) => ({ ...r, ct: clean(r.text), n: r.pix }));
  const body = passages.map((x) => `[¶${x.n}] ${x.ct.slice(0, 700)}`).join('\n\n');
  try {
    const res = await ai.chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: `PARAGRAPHS:\n${body}` }],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0, maxTokens: 2000, responseFormat: { type: 'json_object' } });
    let eps = []; try { const m = (res.content || '').match(/\{[\s\S]*\}/); eps = m ? (JSON.parse(m[0]).episodes || []) : []; } catch {}
    for (const e of eps) {
      if (!e.name || !Array.isArray(e.participants) || e.participants.length < 2) continue;
      const ns = (Array.isArray(e.n) ? e.n : []).map(Number).filter((n) => !Number.isNaN(n));
      const pidOf = (n) => (passages.find((x) => x.n === n) || {});
      all.push({ name: clean(e.name), place: e.place ? clean(e.place) : null, when: e.when ? clean(String(e.when)).slice(0, 40) : null,
        summary: clean(e.summary || ''), participants: e.participants.map((p) => ({ name: clean(p.name), role: clean(p.role || '') })).filter((p) => p.name),
        source: bookOf(DOC), paraIds: ns.map((n) => pidOf(n).pid).filter(Boolean), paraIxs: ns });
    }
  } catch (e) { /* skip window on error */ }
}
for (let i = 0; i < windows.length; i += CONC) { await Promise.all(windows.slice(i, i + CONC).map((w, j) => one(w, i + j))); process.stderr.write(`  …window ${Math.min(i + CONC, windows.length)}/${windows.length} (${all.length} raw episodes)\n`); }

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
console.log(`\n${merged.length} episodes (${all.length} raw) from ${windows.length} windows`);
if (process.env.OUT) { writeFileSync(process.env.OUT, JSON.stringify(merged, null, 2)); console.error(`wrote ${merged.length} episodes to ${process.env.OUT}`); }
process.exit(0);
