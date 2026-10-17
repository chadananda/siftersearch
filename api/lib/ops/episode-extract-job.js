// episode-extract ops job: the episodes of a predigested history (God Passes By, The Dawn-Breakers — Chad 10-17). The
// book's headings give the boundaries (api/lib/episodes.js); one Haiku call per episode fills place, date, a summary
// citing its paragraphs, participants, key events and the questions it answers (section HyPE). Then CODE checks it:
// a participant whose name is not in the episode's own text is dropped (kept in `dropped`), a citation outside the
// episode is reported in `issues`, an A.H. year becomes a Gregorian one by formula. params { doc, titles?, limit? }.
import { sectionsOfDoc } from '../repos/sections-repo.js';
import { paragraphsInSpans, saveEpisode, episodesOfDoc } from '../repos/episodes-repo.js';
import { episodesFromSections, verifyParticipants } from '../episodes.js';
import { roleCreate, roleModel } from '../role-client.js';
import { logActivity } from '../repos/activity-repo.js';

export const EPISODE_VERSION = 'ep1';
const MAX_CHARS = 60000;   // a whole episode, never a sample: the longest scene in either book is well under this

/** A.H. (lunar) year → the Gregorian year it mostly falls in. */
export const ahToCe = (ah) => Math.round(ah * 0.970229 + 621.5643);

export function episodePrompt(book, ep, paras) {
  const text = paras.map((p) => `[¶${p.paragraph_index}] ${p.text}`).join('\n\n').slice(0, MAX_CHARS);
  return `You are cataloguing one episode of "${book}". The author's own heading names it; read ONLY the text below.

Chapter: ${ep.chapter}
Heading: ${ep.title}
Place in the book: ${ep.path}

TEXT
${text}

Return ONE JSON object, nothing else:
{
  "place": "where it happens, as the text names it, or null",
  "when": "the date or time as the text gives it (e.g. '1264 A.H.', 'summer of 1848'), or null",
  "year": { "ce": <Gregorian year the text states, or null>, "ah": <A.H. year the text states, or null> },
  "summary": "2-4 sentences of what happens, only what this text says; end each sentence with the paragraph it comes from, e.g. [¶552]",
  "participants": [ { "name": "the name EXACTLY as written in the text", "role": "actor | present | speaker | subject | mentioned" } ],
  "events": [ "short phrase for each distinct happening, in order" ],
  "questions": [ "3-5 questions a reader might ask that this episode answers, using the names as the text gives them" ]
}
Rules: no outside knowledge; no person not named in the text; a pronoun is not a participant; "mentioned" is a person only referred to, not there.`;
}

const jsonOf = (s) => { const m = String(s || '').match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

/** One episode: prompt → model → checks. `create` is roleCreate (injectable for tests). */
export async function extractEpisode(book, ep, paras, { create = roleCreate } = {}) {
  let out = null, raw = '';
  for (let attempt = 0; attempt < 2 && !out; attempt++) {   // one retry: a long episode can run past the first reply
    const res = await create('episode-extract', { max_tokens: 4000, temperature: 0, messages: [{ role: 'user', content: episodePrompt(book, ep, paras) }] });
    raw = res?.choices?.[0]?.message?.content || '';
    out = jsonOf(raw);
  }
  if (!out) return { issues: [`no JSON from the model: ${raw.slice(0, 160) || '(empty reply)'}`] };
  const text = paras.map((p) => p.text).join('\n');
  const { kept, dropped } = verifyParticipants(Array.isArray(out.participants) ? out.participants : [], text);
  const own = new Set(paras.map((p) => p.paragraph_index));
  const cites = [...String(out.summary || '').matchAll(/\[¶(\d+)\]/g)].map((m) => Number(m[1]));
  const issues = [];
  const stray = cites.filter((n) => !own.has(n));
  if (stray.length) issues.push(`summary cites paragraphs outside the episode: ${stray.join(', ')}`);
  if (!cites.length && out.summary) issues.push('summary cites no paragraph');
  if (dropped.length) issues.push(`participants not in the text: ${dropped.map((p) => p.name).join(', ')}`);
  const ce = Number(out.year?.ce) || (Number(out.year?.ah) ? ahToCe(Number(out.year.ah)) : null);
  return { place: out.place || null, when_text: out.when || null, year_start: ce || null, year_end: ce || null, summary: out.summary || null,
    participants: kept, dropped, events: Array.isArray(out.events) ? out.events : [], questions: Array.isArray(out.questions) ? out.questions : [], issues };
}

export async function episodeExtractJob({ doc, titles = null, limit = 0, redo = false } = {}, { create = roleCreate, sections = sectionsOfDoc, paragraphs = paragraphsInSpans, save = saveEpisode, existing = episodesOfDoc } = {}) {
  if (!doc) throw new Error('episode-extract needs { doc }');
  const secs = await sections(doc);
  const book = { 21310: 'God Passes By', 21308: 'The Dawn-Breakers' }[doc] || `document ${doc}`;
  let eps = episodesFromSections(secs);
  if (titles?.length) eps = eps.filter((e) => titles.some((t) => e.title.toLowerCase().includes(String(t).toLowerCase())));
  if (limit) eps = eps.slice(0, limit);
  // resumable: an episode already done at this version with no issues is kept (a restart does not pay twice); redo forces all
  const have = redo ? new Map() : new Map((await existing(doc)).filter((e) => e.version === EPISODE_VERSION && !e.issues?.length).map((e) => [e.ord, e]));
  const stats = { doc, episodes: eps.length, done: 0, kept: 0, participants: 0, dropped: 0, with_issues: 0, failed: 0 };
  let lastLog = Date.now();
  for (const ep of eps) {
    if (have.has(ep.ord)) { stats.kept++; continue; }
    const paras = await paragraphs(doc, ep.spans);
    if (!paras.length) continue;
    let r;
    try { r = await extractEpisode(book, ep, paras, { create }); } catch (err) { stats.failed++; r = { issues: [`model call failed: ${String(err.message).slice(0, 120)}`] }; }
    await save({ doc_id: Number(doc), section_id: ep.section_id, ord: ep.ord, title: ep.title, chapter: ep.chapter, path: ep.path, spans: ep.spans,
      para_ids: paras.map((p) => p.id), ...r, model: roleModel('episode-extract'), version: EPISODE_VERSION });
    stats.done++; stats.participants += r.participants?.length || 0; stats.dropped += r.dropped?.length || 0; if (r.issues?.length) stats.with_issues++;
    if (Date.now() - lastLog > 60000) { lastLog = Date.now(); logActivity('index', `episodes · ${book} · ${stats.done}/${stats.episodes} · ${stats.participants} participants checked against the text`); }
  }
  return stats;
}
