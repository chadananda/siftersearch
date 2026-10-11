// Sentence segmentation by PHRASE INDEX (Chad 10-11: "breaking by phrase first, then breaking array of phrases into
// sentences … all by index output"; "phrases are always within sentences"). Phrases come free from lib/phrases.js (+ a
// numbered-report rule); the model sees UNDIACRITIZED numbered phrases and returns only the indices that begin sentences;
// markers are then written around the ORIGINAL text, so stripping them gives the paragraph back exactly. Pure; no I/O.
// Measured 10-11 (planning/arabic-segmentation-s1-20261011.md): Haiku 5.5 with thinking is the quality setting.
import { segment, cleanText } from '../phrases.js';

export const MODEL = 'claude-haiku-5-5';
const ENDERS = /[.!?؟؛]/g;
export const undiacritize = (s) => s.normalize('NFKD').replace(/[ً-ٰٟۖ-ۭ]/g, '');

/** Does this paragraph need a MODEL to find its sentences? Unpunctuated (<1 ender per 50 words) and longer than ~1 sentence. */
export function needsModel(text) {
  const clean = cleanText(text);
  const words = clean.split(/\s+/).filter(Boolean).length;
  return words > 40 && (clean.match(ENDERS) || []).length * 50 < words;
}

/** Phrase spans [{start,end}] over cleanText(text): lib/phrases rules, plus a numbered report («10-») always opens one. */
export function phraseSpans(text, lang = 'ar') {
  const clean = cleanText(text);
  const out = [];
  for (const u of segment(text, lang)) {
    let s = u.start;
    const piece = clean.slice(u.start, u.end);
    const re = /(?<=\s)[0-9٠-٩]+-(?=\s|$)/g; let m;
    while ((m = re.exec(piece))) { const at = u.start + m.index; if (at > s) { out.push({ start: s, end: at }); s = at; } }
    out.push({ start: s, end: u.end });
  }
  return out.filter((p) => clean.slice(p.start, p.end).trim());
}

export const SYSTEM = `You divide classical Arabic and Persian prose into sentences for a scholarly search index. You are the tool built for this job.
Each paragraph comes as NUMBERED PHRASES (clause units). Sentences are made of whole phrases: decide which phrases BEGIN a sentence.
A sentence is one complete statement: a report WITH its chain of transmission and the words reported, a ruling, a heading,
a verse with its framing, a supplication, a point of commentary, an address and what is said in it.
- A new chain (حدثنا / أخبرنا / وعنه / وبهذا الإسناد) or a numbered report («10-») begins a NEW sentence. A heading (باب …,
  كتاب …, فصل …) is its own sentence. Commentary turning to a new point (فأما ما رواه …, فلا ينافي …, والوجه فيه …) begins one.
- These CONTINUE the sentence (never start one): the words quoted after قال / فقال / يقول / سألته / گفت; an answer inside the
  same report; an exception or condition («إلا أن …», «إن لم …», «اگر …») completing a ruling; a clause completing the verb
  before it («أنه …», «إنه …», «که …» after رواه / قال / فرمود). Why: they complete a statement already under way.
- Phrase 1 of every paragraph begins a sentence. Never decline; a careful best judgment is what is needed.
Reply with JSON only: {"<paragraph key>": [phrase numbers that begin sentences], …} for EVERY paragraph given.`;

/** One request's user text: each paragraph keyed and its phrases numbered (undiacritized). */
export function requestText(paragraphs) {
  return paragraphs.map((p) => `${p.key}:\n${p.phrases.map((s, i) => `[${i + 1}] ${undiacritize(s)}`).join('\n')}`).join('\n\n');
}

/** Model reply → { key: Set(starting phrase numbers) }; null if no JSON. Phrase 1 is always a start. */
export function parseStarts(reply, keys) {
  const m = String(reply || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const out = {};
  for (const k of keys) if (Array.isArray(j[k])) out[k] = new Set([1, ...j[k].map(Number).filter((n) => Number.isInteger(n) && n >= 1)]);
  return out;
}

/** Wrap sentences in ⁅sN⁆…⁅/sN⁆ over the ORIGINAL clean text; whitespace between sentences stays outside the markers.
 *  Returns null unless stripping the markers gives `clean` back exactly. */
export function markSentences(clean, spans, starts) {
  const cuts = spans.map((s, i) => (i === 0 || starts.has(i + 1) ? s.start : null)).filter((x) => x != null);
  let out = clean.slice(0, cuts[0]), n = 0;
  cuts.forEach((c, i) => {
    const seg = clean.slice(c, i + 1 < cuts.length ? cuts[i + 1] : clean.length);
    const body = seg.trimEnd(), tail = seg.slice(body.length);
    if (body.trim()) { n++; out += `⁅s${n}⁆${body}⁅/s${n}⁆${tail}`; } else out += seg;
  });
  return out.replace(/⁅\/?s\d+⁆/g, '') === clean ? { text: out, sentences: n } : null;
}

// ── Paragraph segmentation (Chad 10-11: "I'm actually mainly interested in paragraph segmentation so that we can actually
// ingest. Sentence and phrase segmentation is supposed to help us get there and then be invisible"). One call per oversized
// paragraph returns BOTH levels by index: phrases that begin sentences, and which of those begin paragraphs.
export const SYSTEM_PARAGRAPHS = `${SYSTEM.replace(/\nReply with JSON only:[\s\S]*$/, '')}

PARAGRAPHS. Then group the sentences into paragraphs: a paragraph is a run of sentences on ONE topic or unit — a heading with
what it introduces, one report with the author's comment on it, one ruling with its proofs, one question with its answer.
Begin a new paragraph where the topic or unit changes. NEVER by length: a long unit stays one paragraph, a short one is fine.
Why: each paragraph becomes one searchable, citable unit and is aligned with its translation, so it must hold one idea.

Reply with JSON only: {"sentences":[phrase numbers that begin sentences], "paragraphs":[phrase numbers that begin paragraphs]}
— every paragraph start is also a sentence start; phrase 1 begins both.`;

/** Reply → { sentences:Set, paragraphs:Set } (paragraphs ⊆ sentences, phrase 1 in both); null when not JSON. */
export function parseParagraphReply(reply) {
  const m = String(reply || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  if (!Array.isArray(j.sentences) || !Array.isArray(j.paragraphs)) return null;
  const ok = (a) => a.map(Number).filter((n) => Number.isInteger(n) && n >= 1);
  const paragraphs = new Set([1, ...ok(j.paragraphs)]);
  const sentences = new Set([1, ...ok(j.sentences), ...paragraphs]);
  return { sentences, paragraphs };
}

/** Split one paragraph into new paragraphs (sentence-marked, numbering restarts per paragraph). Returns the blocks, or null
 *  unless their text (markers stripped, whitespace collapsed) equals the original exactly. */
export function buildParagraphs(clean, spans, { sentences, paragraphs }) {
  const pStarts = spans.map((s, i) => (i === 0 || paragraphs.has(i + 1) ? i : null)).filter((x) => x != null);
  const blocks = pStarts.map((pi, n) => {
    const end = n + 1 < pStarts.length ? spans[pStarts[n + 1]].start : clean.length;
    const sub = spans.filter((s, i) => i >= pi && (n + 1 >= pStarts.length || i < pStarts[n + 1]))
      .map((s) => ({ start: s.start - spans[pi].start, end: s.end - spans[pi].start }));
    const text = clean.slice(spans[pi].start, end);
    const local = new Set([...sentences].map((k) => k - pi).filter((k) => k >= 1));
    return markSentences(text, sub, local)?.text.trim() ?? null;
  });
  if (blocks.some((b) => b == null)) return null;
  const norm = (s) => s.replace(/⁅\/?s\d+⁆/g, '').replace(/\s+/g, ' ').trim();
  return norm(blocks.join(' ')) === norm(clean.slice(spans[0].start)) ? blocks : null;
}
