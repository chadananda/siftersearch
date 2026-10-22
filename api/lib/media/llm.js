// The media pipeline's model calls (roles in model-roles.js: media-meta, media-correct, media-quotes, media-verify — all
// Haiku-class, never a hard-coded model). Each returns its result + the tokens it used; the guard in vocab.js decides what
// a correction may change. Deps injected: create = roleCreate.
import { roleCreate } from '../role-client.js';
import { getModel } from '../model-registry.js';
import { modelFor } from '../model-roles.js';
import { paragraphText } from './paragraphs.js';
import { formatTime } from './range.js';
import { exactEdits, suspects, guardEdits, applyEdits } from './vocab.js';

const jsonOf = (s) => { const m = String(s || '').match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

/** $ for a response's usage on a role's model (registry prices are per 1K tokens). */
export function costOf(role, usage) {
  const p = getModel(modelFor(role).model)?.pricing;
  if (!p || !usage) return 0;
  return ((usage.prompt_tokens || 0) * p.input + (usage.completion_tokens || 0) * p.output) / 1000;
}

async function ask(role, prompt, { create = roleCreate, max = 6000, spend } = {}) {
  const res = await create(role, { max_tokens: max, messages: [{ role: 'user', content: prompt }] });
  const usd = costOf(role, res?.usage);
  if (spend) { spend.usd = (spend.usd || 0) + usd; spend.calls = (spend.calls || 0) + 1; spend.in = (spend.in || 0) + (res?.usage?.prompt_tokens || 0); spend.out = (spend.out || 0) + (res?.usage?.completion_tokens || 0); }
  return jsonOf(res?.choices?.[0]?.message?.content);
}

/** Before transcription: clean name hints from the path + file tags (the slug comes from these). */
export async function nameItem({ rel, tags = {}, hints = {}, duration }, opts = {}) {
  const out = await ask('media-meta', `A recorded talk is being added to a library of the world's religions (mostly Bahá'í). From its FILE PATH, the file's TAGS and parsed HINTS, give its catalogue name. Use Shoghi Effendi's transliteration for Bahá'í names (Bahá'u'lláh, ‘Abdu'l-Bahá, Furútan, Nakhjavání). Say only what these state; null when unknown.
PATH: ${rel}
TAGS: ${JSON.stringify(tags).slice(0, 800)}
HINTS: ${JSON.stringify(hints)}
DURATION: ${formatTime(duration || 0)}
Return JSON {"speaker": "full name or null", "title": "the talk's title (no speaker, no date)", "date": "YYYY-MM-DD or null", "year": number|null, "language_hint": "en|fa|ar|… or null", "event": "or null", "place": "or null", "kind": "talk|lecture|class|interview|recollection|q-and-a|music|reading|other"}`, { ...opts, max: 3000 });
  return out || {};
}

/**
 * Names and terms only. 1) the safe vocabulary pass (marks restored on exact matches), 2) per chunk of ~1,500 words the
 * model judges the name-like runs that sound like a vocabulary term; its edits pass the guard or are refused.
 * → { paragraphs (new words), diff: [{ p, at, from, to, method }], refused: [...] }
 */
export async function correctParagraphs(paragraphs, vocab, { chunkWords = 1500, ...opts } = {}) {
  const diff = [], refused = [];
  let ps = paragraphs.map((p) => {
    const e = exactEdits(p.words, vocab);
    for (const x of e) diff.push({ p: p.n, at: p.words[x.i0].s, from: x.from, to: x.to, method: x.method });
    return e.length ? { ...p, words: applyEdits(p.words, e) } : p;
  });
  const chunks = [];
  let cur = [], n = 0;
  for (const p of ps) { cur.push(p); n += p.words.length; if (n >= chunkWords) { chunks.push(cur); cur = []; n = 0; } }
  if (cur.length) chunks.push(cur);
  const byN = new Map(ps.map((p) => [p.n, p]));
  for (const ch of chunks) {
    const sus = ch.flatMap((p) => suspects(p.words, vocab, { limit: 15 }).map((s) => ({ ...s, p: p.n })));
    if (!sus.length) continue;
    const offered = [...new Set(sus.flatMap((s) => s.candidates))];
    const out = await ask('media-correct', `You correct a speech-recognition transcript of a talk about the Bahá'í Faith. Fix ONLY proper names and religious terms that were misheard, replacing them with the exact spelling from VOCABULARY. Never change any other word; never rephrase, never fix grammar, never add or remove words. When unsure, leave it.
SUSPECTS (paragraph: heard → possible spellings):
${sus.map((s) => `[${s.p}] ${s.from} → ${s.candidates.join(' | ')}`).join('\n')}
VOCABULARY: ${offered.join(' | ')}
TRANSCRIPT:
${ch.map((p) => `[${p.n}] ${paragraphText(byN.get(p.n))}`).join('\n')}
Return JSON {"edits":[{"p": paragraph number, "from": "exact words from the transcript (1-4 words)", "to": "exact VOCABULARY entry"}]} — {"edits":[]} when nothing needs fixing.
"from" holds ONLY the misheard name itself — never a neighbouring word: {"from": "Sogefendik", "to": "Shoghi Effendi"}, not {"from": "Sogefendik expressed", "to": "Shoghi Effendi expressed"}.`, opts);
    const byP = new Map();
    for (const e of out?.edits || []) { if (!byP.has(Number(e.p))) byP.set(Number(e.p), []); byP.get(Number(e.p)).push(e); }
    for (const [pn, edits] of byP) {
      const p = byN.get(pn);
      if (!p) { refused.push(...edits.map((e) => ({ ...e, why: 'no such paragraph' }))); continue; }
      const g = guardEdits(p.words, edits, vocab);
      refused.push(...g.refused.map((r) => ({ p: pn, ...r })));
      if (!g.ok.length) continue;
      for (const x of g.ok) diff.push({ p: pn, at: p.words[x.i0].s, from: x.from, to: x.to, method: 'model' });
      byN.set(pn, { ...p, words: applyEdits(p.words, g.ok) });
    }
  }
  ps = ps.map((p) => byN.get(p.n));
  return { paragraphs: ps, diff, refused };
}

/** The transcript as the model reads it: "[n @mm:ss S1] text". */
const asLines = (ps, speakers = true) => ps.map((p) => `[${p.n} @${formatTime(p.t0)}${speakers && p.spk ? ` ${p.spk}` : ''}] ${paragraphText(p)}`).join('\n');

/** After correction: speaker names per diarized voice, summary, topics, chapters, date/place/event (only what is stated). */
export async function describeTalk(paragraphs, hints = {}, opts = {}) {
  const lines = asLines(paragraphs);
  const text = lines.length > 300000 ? `${lines.slice(0, 150000)}\n…\n${lines.slice(-150000)}` : lines;   // stay well under 100k tokens
  const out = await ask('media-meta', `A transcript of a recorded talk (lines: [paragraph @time voice] text). Catalogue HINTS from its file: ${JSON.stringify(hints)}.
Give its catalogue description from what the recording itself says (and the hints). Never invent: null when not stated.
- speakers: each voice label (S1, S2…) → the person's name if stated, else a role ("Questioner", "Interpreter", "Chair").
- chapters: a section title every 5-15 minutes where the subject changes, by the paragraph number it starts at.
${text}
Return JSON {"title": "…", "speaker": "main speaker's full name or null", "speakers": {"S1": "…"}, "date": "YYYY-MM-DD or null", "year": number|null, "place": "…|null", "event": "…|null", "language": "en|fa|…", "summary": "2-3 plain sentences", "topics": ["5-10 short topics"], "chapters": [{"p": number, "title": "…"}]}`, { ...opts, max: 8000 });
  return out || {};
}

/**
 * Literal QUOTATIONS (recited words of the Central Figures / Shoghi Effendi / the House of Justice) and ATTRIBUTED
 * TEACHINGS ("the Guardian taught that…") per chunk. → { quotes: [{ p, text, writer, intro }], teachings: [{ p, writer, claim, words }] }
 */
export async function findQuotations(paragraphs, { chunkWords = 2000, ...opts } = {}) {
  const quotes = [], teachings = [];
  const chunks = [];
  let cur = [], n = 0;
  for (const p of paragraphs) { cur.push(p); n += p.words.length; if (n >= chunkWords) { chunks.push(cur); cur = []; n = 0; } }
  if (cur.length) chunks.push(cur);
  for (const ch of chunks) {
    const out = await ask('media-quotes', `A transcript of a talk (lines: [paragraph @time voice] text). Find two things.
(a) QUOTATIONS — where the speaker recites or reads the words of Bahá'u'lláh, the Báb, ‘Abdu'l-Bahá, Shoghi Effendi or the Universal House of Justice: introduced ("Bahá'u'lláh says: …", "as the Guardian wrote, …") or recited without introduction (recognisable scripture, often elevated language: "O Son of Spirit! …"). Give the recited words EXACTLY as they appear in the transcript (at least 6 words; leave out the introduction).
(b) ATTRIBUTED TEACHINGS — where the speaker states in their own words what one of them taught or explained ("the Guardian taught that…", "‘Abdu'l-Bahá explains that the soul…"). Give the teaching as one plain sentence and the speaker's words that state it (exact, at most 30 words).
Only these five writers; not the speaker's own views, not other authors.
${asLines(ch)}
Return JSON {"quotes": [{"p": number, "text": "exact recited words", "writer": "Bahá’u’lláh|The Báb|‘Abdu’l-Bahá|Shoghi Effendi|Universal House of Justice|unknown", "intro": "the introducing words or null"}], "teachings": [{"p": number, "writer": "…", "claim": "one plain sentence", "words": "the speaker's exact words"}]}`, { ...opts, max: 8000 });
    quotes.push(...(out?.quotes || []).filter((q) => q?.text && Number(q.p)));
    teachings.push(...(out?.teachings || []).filter((t) => t?.claim && Number(t.p)));
  }
  return { quotes, teachings };
}

/** Strict yes/no: does each passage state what the speaker attributes? → [{ i, states, confidence, excerpt }] */
export async function verifyTeaching({ writer, claim, words }, passages, opts = {}) {
  if (!passages.length) return [];
  const out = await ask('media-verify', `A speaker attributes a teaching to ${writer}: "${claim}" (their words: "${words || ''}").
For EACH passage below, answer strictly: does this passage itself STATE that teaching (not merely mention the topic)? A passage by someone else about the writer does not count.
${passages.map((p, i) => `#${i} ${p.title}${p.author ? ` — ${p.author}` : ''}: "${String(p.text).slice(0, 1500)}"`).join('\n')}
Return JSON {"answers": [{"i": number, "states": true|false, "confidence": 0.0-1.0, "excerpt": "the passage's own sentence(s) that state it, verbatim, at most 60 words, or null"}]}`, { ...opts, max: 5000 });
  return (out?.answers || []).filter((a) => Number.isInteger(Number(a.i)) && passages[Number(a.i)]);
}

/** The copy-edit pass (api/lib/media/cleanup.js) with the media-clean role. */
/** Topic SUBHEADERS (Chad 10-22): a statement or a question the talk raises at each shift of subject, by the paragraph it
 *  starts at. The guard in headings.js keeps only faithful, well-spaced ones. → [{ p, text }] */
export async function proposeHeadings(paragraphs, hints = {}, opts = {}) {
  const lines = asLines(paragraphs, false);
  const text = lines.length > 300000 ? `${lines.slice(0, 150000)}\n…\n${lines.slice(-150000)}` : lines;
  const minutes = Math.round((paragraphs.at(-1)?.t1 || 0) / 60);
  const out = await ask('media-headings', `A transcript of a recorded talk (${minutes} min; lines: [paragraph @time] text). Talk: ${JSON.stringify(hints)}.
Add SUBHEADERS where the subject shifts, so a reader can scan the talk and jump to a part. Place them by CONTENT, not by the clock — roughly one every 3 to 8 minutes, none in the first paragraph unless the talk opens on its subject.
Each subheader is either a short STATEMENT of what that part says ("The station of the Guardian as interpreter") or a QUESTION that part answers ("Why did the Báb call Himself the Gate?"). Use the speaker's own key words and names. Say only what the following paragraphs actually discuss — never a conclusion they do not reach. At most 12 words; no quotation marks; no numbering.
${text}
Return JSON {"headings": [{"p": paragraph number where the part starts, "text": "…"}]}`, { ...opts, max: 8000 });
  return Array.isArray(out?.headings) ? out.headings : [];
}

/** The whole-talk copy-edit + names + mentions pass (cleanup.js). opts: { role ('media-clean' | 'media-clean-strong'), ctx, spend } */
export async function cleanTranscript(paragraphs, { role = process.env.MEDIA_CLEAN_ROLE || 'media-clean', ctx = {}, ...opts } = {}) {
  const { cleanParagraphs } = await import('./cleanup.js');
  return cleanParagraphs(paragraphs, (prompt) => ask(role, prompt, { ...opts, max: 16000 }), { ...opts, ctx });
}
