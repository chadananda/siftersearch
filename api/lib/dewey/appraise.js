// Dewey's APPRAISAL of a work found in the wild (Chad 10-17: "research the book, find if we have it, determine if it is
// appropriate and where it would go and estimate its value based on information Dewey finds about it online. Dewey can
// use Perplexity and Parallel.ai"). Two web passes run side by side — Perplexity (fast, cited) and a Parallel.ai task
// (deeper, cited) — and each is shown the moment it lands; then Haiku judges, from what they found and the library's
// EXISTING shelves only: in scope or not, where it would go, its value to the collection, a price range, whether a full
// text is already free online, and what to do. ~2¢ an appraisal. Every step emits a status line so the reader never waits
// on silence (Chad 10-17: "respond immediately and regularly"). Deps injectable for tests.
import { perplexityFallback } from '../perplexity.js';
import { parallelResearch } from '../parallel-ai.js';
import { roleCreate } from '../role-client.js';
import { libraryShelves } from './intake.js';

const jsonOf = (s) => { const m = String(s || '').match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
const describe = (id) => [id.title && `“${id.title}”`, id.subtitle, id.author && `by ${id.author}`, id.translator && `translated by ${id.translator}`,
  id.edition, id.publisher, id.year].filter(Boolean).join(', ');

export const WEB_QUESTION = (id) => `${describe(id)}.
In short bullets: (1) what this work is — genre, subject, which religious tradition it belongs to or studies; (2) the author and
their standing; (3) publication history and notable editions; (4) its significance for the study of religion; (5) whether its full
text is freely and legally available online, and where; (6) typical price of a used and a new copy, and how rare it is.`;

export const JUDGE = (id, holdings, web, shelves) => `You are Dewey, librarian of a research library of SACRED and SCHOLARLY texts across 11 traditions
(Bahá’í, Islam, Christian, Judaism, Zoroastrian, Hindu, Buddhist, Jain, Sikh, Taoist, Confucian). Appraise this work for it.
WORK: ${describe(id)}
LIBRARY CHECK: ${holdings}
WEB RESEARCH:
${web || '(nothing found online)'}
SHELVES (tradition: its existing collections — choose only from these):
${Object.entries(shelves).map(([r, cs]) => `${r}: ${cs.join(' | ')}`).join('\n')}
Return ONE JSON object:
{"summary":"one sentence: what it is","in_scope":"yes|no|maybe","scope_why":"one short reason",
 "shelf":{"religion":"…","collection":"…"} or null,
 "value":"high|medium|low","value_why":"why it matters (or not) to THIS collection",
 "price":"typical price range as found online, e.g. '$8–20 used', or null","rarity":"common|uncommon|rare|unknown",
 "free_online":"URL of a free legal full text, or null",
 "recommendation":"add|add if cheap|skip|look for a better edition","next":"one short concrete next step"}
Use only what the research says; null where it says nothing.`;

/** Appraise one identified work. emit({ type: 'status' | 'research' | 'appraisal', … }) as each piece lands. */
export async function appraiseWork(id, holdingsLine, { emit = () => {}, pplx = perplexityFallback, parallel = parallelResearch, create = roleCreate, shelves = libraryShelves } = {}) {
  if (!id?.title) return null;
  emit({ type: 'status', text: 'Searching the web for this book (Perplexity and Parallel.ai)…' });
  const q = WEB_QUESTION(id);
  const found = [];
  const fast = pplx(q, { caller: 'dewey-appraise', maxTokens: 700 }).then((r) => {
    if (r?.text) { found.push({ source: 'perplexity', ...r }); emit({ type: 'research', source: 'Perplexity', text: r.text, citations: r.citations || [] }); emit({ type: 'status', text: 'Quick research in — waiting a moment for the deeper search…' }); }
    return r;
  }).catch(() => null);
  const deep = parallel(q, { processor: 'base', timeoutS: 60, caller: 'dewey-appraise' }).then((r) => {
    if (r?.text) { found.push({ source: 'parallel', ...r }); emit({ type: 'research', source: 'Parallel.ai', text: r.text, citations: r.citations || [] }); }
    return r;
  }).catch(() => null);
  // judge as soon as the fast pass is in and the deep one has had up to 45 s more — never longer
  await fast;
  await Promise.race([deep, new Promise((r) => setTimeout(r, 45000))]);
  emit({ type: 'status', text: 'Weighing whether it belongs here and what it is worth…' });
  const web = found.map((f) => `[${f.source}]\n${f.text.slice(0, 3500)}`).join('\n\n');
  const sh = (() => { try { return shelves(); } catch { return {}; } })();
  const res = await create('dewey-identify', { max_tokens: 4000, temperature: 0, messages: [{ role: 'user', content: JUDGE(id, holdingsLine, web, sh) }] });
  const a = jsonOf(res?.choices?.[0]?.message?.content) || {};
  if (a.shelf && !sh[a.shelf.religion]?.includes(a.shelf.collection)) a.shelf = null;   // only an existing shelf
  const appraisal = { ...a, sources: [...new Map(found.flatMap((f) => f.citations || []).map((c) => [c.url, c])).values()].slice(0, 8) };
  emit({ type: 'appraisal', title: id.title, ...appraisal });
  return appraisal;
}

// An UPLOADED document is judged on ITS OWN TEXT, not on a web search for its filename (Chad 10-17: "It should be assessed
// and Dewey should make a recommendation 'It looks like this document belongs in our Baha'i/Pilgrim Notes collection'").
// Web research on "192? Shoghi Effendi in Torquay" found nothing and called a real pilgrim's note "not catalogable".
export const JUDGE_DOC = (id, holdings, excerpt, shelves) => `You are Dewey, librarian of a research library of SACRED and SCHOLARLY texts across 11 traditions
(Bahá’í, Islam, Christian, Judaism, Zoroastrian, Hindu, Buddhist, Jain, Sikh, Taoist, Confucian). Someone uploaded this document; the
library does not hold its text. Read it and appraise it.
FILE NAME (often WRONG — it may name the archive box or folder it came from, not this document; a weak hint at most): ${id.file_name || '(none)'}
LIBRARY CHECK: ${holdings}
DOCUMENT (excerpts from its start, middle and end):
"""
${excerpt || '(no readable text — a scan the preliminary OCR could not read; say that the contents could not be examined)'}
"""
SHELVES (tradition: its existing collections — choose only from these):
${Object.entries(shelves).map(([r, cs]) => `${r}: ${cs.join(' | ')}`).join('\n')}
Return ONE JSON object:
{"title":"the document's real title as it would be catalogued","author":"its author, or null","year":"its date if stated, or null",
 "kind":"book|article|letter|pilgrim notes|talk|transcript|memoir|compilation|other","language":"ISO code",
 "summary":"one sentence: what it is","in_scope":"yes|no|maybe","scope_why":"one short reason",
 "shelf":{"religion":"…","collection":"…"} or null,"value":"high|medium|low","value_why":"why it matters (or not) to THIS collection",
 "recommendation":"add|skip|ask","recommendation_line":"one sentence to the person, e.g. 'It looks like this belongs in our Bahá’í › Pilgrim Notes collection — it is …'"}
Judge from the CONTENTS: the title is what the document itself says it is (its heading, its first lines, a letter's
salutation and date); never take it from the file name. Null where the contents say nothing.`;

/** Excerpts a model can judge a document by: its start, middle and end (~6,500 chars). */
export function excerptOf(text) {
  const t = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= 6500) return t;
  const mid = Math.floor(t.length / 2);
  return `${t.slice(0, 4000)}\n[…]\n${t.slice(mid - 750, mid + 750)}\n[…]\n${t.slice(-1000)}`;
}

/** Appraise an uploaded document from its own text. emit({ type: 'status' | 'appraisal', … }). */
export async function appraiseDocument(id, text, holdingsLine, { emit = () => {}, create = roleCreate, shelves = libraryShelves } = {}) {
  emit({ type: 'status', text: 'Reading it to see what it is and where it belongs…' });
  const sh = (() => { try { return shelves(); } catch { return {}; } })();
  const res = await create('dewey-identify', { max_tokens: 4000, temperature: 0, messages: [{ role: 'user', content: JUDGE_DOC(id, holdingsLine, excerptOf(text), sh) }] });
  const a = jsonOf(res?.choices?.[0]?.message?.content) || {};
  if (a.shelf && !sh[a.shelf.religion]?.includes(a.shelf.collection)) a.shelf = null;   // only an existing shelf
  const appraisal = { ...a, from: 'document', sources: [] };
  emit({ type: 'appraisal', title: a.title || id.title, ...appraisal });
  return appraisal;
}
