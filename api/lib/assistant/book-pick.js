// BOOK FAST PATH (Chad 11-10: "the book card should be almost immediate"). Jev chose the book strategy → the BOOK FINDER
// (book-finder.js: one in-memory index over works AND sections, the whole message scored) gives CANDIDATES → Jev makes ONE typed
// choice ("none of these fits" an option) → the card. Only when nothing fits does ONE Haiku call name the work's canonical
// title(s) ("the main book of the Hindus" → Bhagavad Gita), then candidates + Jev again. Code never reads intent; it resolves names.
// Probe mode (`alt`): Jev chose compilation/about but his phrase IS a library title ("Deepening Compilation" → the compilation
// "Deepening") → the same ONE pick with an extra option (e.g. "a new compilation on this topic") — Jev decides, never code.
// Deps (injectable): book-finder bookCandidates, work-request otherCopies/bareTitle, systemone jevFetch, ai chatCompletion.
import { otherCopies, bareTitle } from './work-request.js';
import { bookCandidates } from './book-finder.js';
import { jevFetch } from '../systemone.js';
import { modelFor } from '../model-roles.js';
import { ENDPOINT, MIN_CONFIDENCE } from '../scope-extract.js';
import { stateOf } from './strategy-choice.js';
import { jevCall, JEV_LIMITS, timeoutDecision } from './jev-call.js';
import { NO_LOG, jevProbabilities } from './decision-log.js';

// apostrophes dropped first, as the title and section indexes store them: "Baha'u'llah" = "Bahá’u’lláh" = "bahaullah"
const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[‘’ʼʻ`']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');
const q = (t) => `“${t}”`;

/** A candidate's label for Jev: "Title — author (tradition · collection)", a section adds the work it is part of. Pure. */
export function labelOf(c) {
  if (c.kind === 'section') return `${q(c.sec.title)} — a section of ${q(c.sec.book)}${c.sec.author ? ` by ${c.sec.author}` : ''}${c.sec.paragraphs ? `, ${c.sec.paragraphs} paragraphs` : ''}`;
  const d = c.doc, kind = [d.religion, d.collection].filter(Boolean).join(' · ');
  return `${q(d.title)}${d.author ? ` — ${d.author}` : ''}${kind ? ` (${kind})` : ''}${d.paragraph_count ? `, ${d.paragraph_count} paragraphs` : ''}`;
}

/** A phrase that IS a work's title, or the title plus words at one end ("Deepening Compilation" ~ "Deepening"). Pure. */
export function strongTitle(phrase, title) {
  const a = fold(phrase), b = fold(title);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || a.endsWith(` ${b}`);   // the phrase holds the WHOLE title at one end
}

/** Jev's one typed choice over the candidates. → { choice, confidence, distribution, ms } | null (no key / timeout / failure). */
export async function pickBook(messages, cands, { profile = {}, fetchImpl = jevFetch('anis-book-pick'), apiKey = process.env.TYPESAFE_API_KEY, onJev = null, alt = null, ...limits } = {}) {
  if (!apiKey || !cands.length) return null;
  // probe mode: the reader may want something NEW (a compilation built on the topic) rather than an existing work — Jev weighs both
  const criteria = { ...Object.fromEntries(cands.map((c) => [c.key, c.label])), ...(alt ? { new: alt } : {}), none: alt ? 'none of these' : 'none of these is the book or text the reader asks for' };
  const t0 = Date.now();
  const call = await jevCall('book', async (signal) => {
    const res = await fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('anis-book-pick').model, state: stateOf(messages, { profile }),
        questions: { book: { type: 'choice', instructions: (alt ? 'The reader may be asking for an EXISTING work in the library, or for something new to be made. ' : '') + 'The reader asks for a particular book or text (a work, or one part of a larger work such as a letter, chapter or book of scripture). Which of these library items is it? Each is labelled by its title, author or compiler, and tradition; a section names the work it is part of. A study, talk or commentary ABOUT the text is not the text. Rank them.', criteria } } }),
      signal });
    return res.ok ? (await res.json()).answers?.book ?? null : null;
  }, { ...JEV_LIMITS.book, ...limits, onJev });
  const a = call.value;
  return a ? { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null, ms: Date.now() - t0 } : null;
}

const NAME_PROMPT = (thread) => `A reader of a religious library is asking for a written work, or one part of a larger work. Name it as a library would catalogue it.
Give its usual title (and, when it is part of a larger work, that work's title on the next line); the original-language title too if it is commonly used. One title per line, at most 3 lines, nothing else. If the message names no work at all, answer NONE.
Conversation (latest last):
${thread}`;

/** ONE cheap call (Haiku, thinking off): the canonical title(s) of the work the message describes. → [titles] */
export async function extractTitles(messages, { complete = null } = {}) {
  const thread = (messages || []).slice(-4).map((m) => `${m.role}: ${String(m.content || '').slice(0, 600)}`).join('\n');
  const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('anis-book-name'), temperature: 0, maxTokens: 60, thinking: false, caller: 'anis-book-name' }));
  const out = await call([{ role: 'user', content: NAME_PROMPT(thread) }]).catch(() => null);
  const text = String(out?.content ?? out?.text ?? out ?? '').trim();
  if (!text || /^none\b/i.test(text)) return [];
  return [...new Set(text.split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').replace(/^["“*_]+|["”*_.]+$/g, '').trim()).filter((l) => l && l.length <= 120 && !/^none$/i.test(l)))].slice(0, 3);
}

/**
 * Jev's book strategy → { kind: 'work', work: { doc, others } } | { kind: 'section', sec, doc } | null (the turn researches).
 * names: Jev's named_work (else the bare message, resolved by code); by: a byline Jev read as a person (author / compiler).
 * LLM calls: one Jev pick; a second pick + one Haiku only when nothing fit.
 */
export async function bookFastPath({ messages, names = [], by = null, profile = {}, decisions = NO_LOG, alt = null, deps = {} }) {
  const text = [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
  const pick = deps.pickBook || pickBook, find = deps.find || bookCandidates, onJev = (info) => decisions.record('jev:timeout', timeoutDecision(info));
  const round = async (msg, also, via) => {
    const found = await find(msg, { also });
    const all = (found?.cands || []).map((c, i) => ({ ...c, key: `c${i + 1}`, label: labelOf(c) }));
    // probe mode asks Jev only when a phrase IS (or holds at one end) a library work's title — a near-exact title, not a shared word
    // (Jev's phrases only — the whole message holds a one-word title too easily: "what is justice" ⊃ "Justice")
    const cands = alt ? (all.some((c) => c.kind === 'work' && named.some((n) => strongTitle(n, c.doc.title))) ? all : []) : all;
    decisions.record('book:candidates', { by: 'code', saw: { message: msg, also, by, via, ms: found?.ms ?? null, ...(alt ? { probe: alt } : {}) }, chosen: `${cands.length} candidates`, reason: cands.map((c) => `${c.key} ${c.label}`).join('; ') || null });
    if (!cands.length) return null;
    const p = await pick(messages, cands, { profile, onJev, ...(alt ? { alt } : {}), ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
    const hit = p?.choice && !['none', 'new'].includes(p.choice) && (p.confidence ?? 0) >= MIN_CONFIDENCE ? cands.find((c) => c.key === p.choice) : null;
    decisions.record('book:pick', { by: 'jev', saw: { candidates: cands.map((c) => `${c.key} ${c.label}`) }, options: [...cands.map((c) => c.key), ...(alt ? ['new'] : []), 'none'], probabilities: jevProbabilities(p),
      chosen: hit ? hit.key : p?.choice === 'new' ? 'new' : 'none', reason: !p ? 'no answer (see jev:timeout)' : hit ? null : p.choice === 'new' ? alt : p.choice === 'none' ? 'nothing fits' : 'low confidence', ms: p?.ms ?? null });
    if (!hit) return null;
    if (hit.kind === 'section') return { kind: 'section', sec: hit.sec, doc: null, via };
    // other copies of the SAME work only (a short name also finds unrelated titles: "Gleanings" → Gleanings among the Sheaves)
    const same = cands.filter((c) => c.kind === 'work' && c.doc.id !== hit.doc.id && (fold(c.doc.title).includes(fold(hit.doc.title)) || fold(hit.doc.title).includes(fold(c.doc.title)))).map((c) => c.doc);
    return { kind: 'work', work: { doc: hit.doc, others: otherCopies([hit.doc, ...same], hit.doc.title) }, via };
  };
  // the message itself (the finder scores all of it), plus Jev's named work and the byline he read, when the message lacks them
  // (a follow-up: "no, the other one" — Jev's units carry the name from the history)
  const named = [...new Set([...names, bareTitle(text)].filter(Boolean))], also = [...new Set([...named, by].filter(Boolean))];
  const r1 = await round(text, also, alt ? 'probe' : 'named');
  if (r1 || alt) return r1;   // probe mode never spends the Haiku: Jev's own strategy runs
  // nothing fit: ONE Haiku names the work, then candidates + Jev again
  const titles = await Promise.resolve().then(() => (deps.extract || extractTitles)(messages)).catch(() => []) || [];
  const fresh = titles.filter((t) => !also.some((n) => fold(n) === fold(t)));
  decisions.record('book:extract', { by: 'llm', saw: { names: also }, chosen: fresh.length ? fresh : 'none', reason: null });
  return fresh.length ? round(fresh.join('\n'), [], 'extracted') : null;
}
