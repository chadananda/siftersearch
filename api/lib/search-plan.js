// Search planning: ONE Jev classification (~150ms, typed, no prose) decides scope + which layers run.
// LLM calls are reserved for summarising results — routing, narrowing and layer choice are classification.
// Pure buildPlan()/layersFor() hold the rules (tested offline); planSearch() is the single network call.
// Rules: fail open; a comparative is never narrowed; caller-given filters win. Deps: scope-extract.js (TRADITIONS).
import { TRADITIONS, MIN_CONFIDENCE, ENDPOINT } from './scope-extract.js';

// A wrong author hides far more than a wrong tradition, so it needs more certainty to act on.
const AUTHOR_MIN_CONFIDENCE = 0.8;

// Choice label → filter value the index really stores (CONTAINS; apostrophe styles expanded downstream).
const AUTHORS = {
  'Bahá’u’lláh': { filter: 'Bahá’u’lláh', about: 'the writings and words of Bahá’u’lláh' },
  'The Báb': { filter: 'Báb', about: 'the writings of the Báb' },
  '‘Abdu’l-Bahá': { filter: 'Abdu', about: 'the talks, tablets and writings of ‘Abdu’l-Bahá' },
  'Shoghi Effendi': { filter: 'Shoghi Effendi', about: 'the writings and letters of Shoghi Effendi' },
  'Universal House of Justice': { filter: 'Universal House of Justice', about: 'messages of the Universal House of Justice' },
  none: { filter: null, about: 'no single author’s words are asked for — including when a person is only the SUBJECT of the question ("When was the Báb martyred?" is ABOUT the Báb, not BY him)' },
};

const SHAPES = {
  quote: 'the user gives the wording of a passage — verbatim or half-remembered — and wants to find it or its source',
  fact: 'a factual question about people, places, dates, events or documents: who, when, where, how many, what happened',
  topic: 'asks what the teachings or scriptures say about a theme, virtue, practice or idea',
  define: 'asks what a term, name or concept means',
  lookup: 'names a specific work or person and wants that item itself',
  enumerate: 'asks for a list: members of a group, attendees of an event, all instances of something',
};

const EMPTY = { filters: {}, comparative: false, shape: 'topic', confidence: {}, source: {} };

/** Jev answers (or null) → plan. Pure. */
export function buildPlan(answers, { given = {} } = {}) {
  const plan = { ...EMPTY, filters: {}, confidence: {}, source: {} };
  if (answers) {
    const t = answers.tradition || {};
    const a = answers.author || {};
    const s = answers.shape || {};
    plan.comparative = (answers.comparative?.noul ?? 0) > 0.5;
    plan.confidence = { tradition: t.confidence ?? 0, author: a.confidence ?? 0, shape: s.confidence ?? 0 };
    if (s.choice && SHAPES[s.choice]) plan.shape = s.choice;
    if (!plan.comparative) {
      if (t.choice && t.choice !== 'none' && TRADITIONS[t.choice] && (t.confidence ?? 0) >= MIN_CONFIDENCE) {
        plan.filters.religion = t.choice;
        plan.source.religion = 'jev';
      }
      const au = AUTHORS[a.choice];
      if (au?.filter && (a.confidence ?? 0) >= AUTHOR_MIN_CONFIDENCE) {
        plan.filters.author = au.filter;
        plan.source.author = 'jev';
      }
    }
  }
  for (const [k, v] of Object.entries(given || {})) {
    if (v === undefined || v === null || v === '') continue;
    plan.filters[k] = v;
    plan.source[k] = 'caller';
  }
  return plan;
}

/** Which indexes/layers a plan uses. Pure. */
export function layersFor(plan) {
  const scoped = Object.keys(plan.filters || {}).length > 0;
  const shape = plan.shape;
  return {
    main: true,
    // A remembered quote is a WORDING problem: exact-word matching finds it; embeddings find its neighbours.
    keyword: shape === 'quote',
    hype: shape !== 'quote',
    // Cited claims answer who/when/where and rosters directly, with the paragraph that proves them.
    claims: shape === 'fact' || shape === 'enumerate',
    // Spread across traditions only when the question named none and is not hunting one passage.
    diversify: !scoped && shape !== 'quote',
  };
}

/**
 * The one network call. `input` is a query string or a message array (the conversation is the state:
 * "and what about compassion?" carries no tradition of its own).
 */
export async function planSearch(input, { given = {}, apiKey = process.env.TYPESAFE_API_KEY, timeoutMs = 1500, fetchImpl = fetch } = {}) {
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: String(input || '') }];
  const state = messages.slice(-6).map((m) => `${m.role}: ${String(m.content || '').slice(0, 600)}`).join('\n');
  const t0 = Date.now();
  if (!apiKey || !state.trim()) return { ...buildPlan(null, { given }), ms: 0, skipped: true };
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions: {
          tradition: {
            type: 'choice',
            instructions: 'Which single religious tradition should a library search be limited to, given this conversation? Answer "none" if it spans or compares traditions, or names none.',
            criteria: TRADITIONS,
          },
          comparative: {
            type: 'noul',
            instructions: 'Is the user asking to COMPARE or CONTRAST two or more religious traditions, authors or works? Pairs of IDEAS inside one teaching (science and religion, faith and reason, men and women) are NOT a comparison of traditions.',
          },
          author: {
            type: 'choice',
            instructions: 'Whose own WORDS or WRITINGS does the user want to read? Answer "none" when a person is only the subject of the question.',
            criteria: Object.fromEntries(Object.entries(AUTHORS).map(([k, v]) => [k, v.about])),
          },
          shape: { type: 'choice', instructions: 'What kind of request is the latest user turn?', criteria: SHAPES },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ...buildPlan(null, { given }), ms, error: `jev HTTP ${res.status}` };
    const j = await res.json();
    return { ...buildPlan(normalizeAnswers(j.answers), { given }), ms };
  } catch (err) {
    return { ...buildPlan(null, { given }), ms: Date.now() - t0, error: err.message };
  }
}

// Jev reports a choice's confidence either directly or as its share of the distribution.
function normalizeAnswers(a) {
  if (!a) return null;
  const choice = (x) => {
    if (!x) return x;
    const c = x.choice ?? x.value ?? null;
    return { choice: c, confidence: x.confidence ?? x.distribution?.[c] ?? 0 };
  };
  return { tradition: choice(a.tradition), author: choice(a.author), shape: choice(a.shape), comparative: a.comparative };
}
