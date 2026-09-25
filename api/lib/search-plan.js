// Search planning: ONE Jev classification (~150ms, typed, no prose) decides scope + which layers run.
// LLM calls are reserved for summarising results — routing, narrowing and layer choice are classification.
// Pure buildPlan()/layersFor() hold the rules (tested offline); planSearch() is the single network call.
// Rules: fail open; a comparative is never narrowed; caller-given filters win. Deps: scope-extract.js (TRADITIONS).
import { TRADITIONS, MIN_CONFIDENCE, ENDPOINT } from './scope-extract.js';

// A wrong author hides far more than a wrong tradition, so it needs more certainty to act on.
const AUTHOR_MIN_CONFIDENCE = 0.8;

// An inferred author is a PREFERENCE, never a filter (Chad, 2026-09-24): names have many spellings and titles,
// and "a tablet from 'Abdu'l-Bahá" is as often found quoted in someone else's book or a compilation as in his
// own. aliases = folded-substring matches against a paragraph's author field; the FIRST is also the engine
// filter value for the author-matched half of the search (CONTAINS, apostrophe styles expanded downstream).
const AUTHORS = {
  'Bahá’u’lláh': { aliases: ['Bahá’u’lláh', 'Bahaullah', 'Husayn-Ali', 'Blessed Beauty'], about: 'the writings and words of Bahá’u’lláh (Mírzá Ḥusayn-‘Alí, the Blessed Beauty)' },
  'The Báb': { aliases: ['Báb', 'Ali-Muhammad'], about: 'the writings of the Báb (Siyyid ‘Alí-Muḥammad)' },
  '‘Abdu’l-Bahá': { aliases: ['Abdu', 'Abdul', 'Abbas Effendi'], about: 'the talks, tablets and writings of ‘Abdu’l-Bahá (‘Abbás Effendi, the Master), however spelled' },
  'Shoghi Effendi': { aliases: ['Shoghi'], about: 'the writings and letters of Shoghi Effendi (the Guardian)' },
  'Universal House of Justice': { aliases: ['Universal House of Justice', 'House of Justice'], about: 'messages of the Universal House of Justice' },
  none: { aliases: null, about: 'no single author’s words are asked for — including when a person is only the SUBJECT of the question ("When was the Báb martyred?" is ABOUT the Báb, not BY him)' },
};

const SHAPES = {
  quote: 'the user gives the wording of a passage — verbatim or half-remembered — and wants to find it or its source',
  fact: 'a factual question about people, places, dates, events or documents: who, when, where, how many, what happened',
  topic: 'asks what the teachings or scriptures say about a theme, virtue, practice or idea',
  define: 'asks what a term, name or concept means',
  lookup: 'names a specific work or person and wants that item itself',
  enumerate: 'asks for a list: members of a group, attendees of an event, all instances of something',
  converse: 'conversation, not a lookup: a greeting, thanks, small talk, or a question about the assistant itself (its name, what it can do)',
};

// Deterministic BACKSTOP only (used when Jev is unreachable): a tradition or scripture the query NAMES.
// Moved here from routes/public-api.js so the legacy path and the backstop share one list.
export const TRADITION_KEYWORDS = {
  "baha'i": "Baha'i", 'bahai': "Baha'i",
  'buddhist': 'Buddhist', 'buddhism': 'Buddhist', 'buddha': 'Buddhist',
  'christian': 'Christian', 'bible': 'Christian', 'gospel': 'Christian',
  'islam': 'Islam', 'islamic': 'Islam', 'quran': 'Islam', "qur'an": 'Islam', 'koran': 'Islam',
  'hadith': 'Islam', 'sunnah': 'Islam',
  'jewish': 'Judaism', 'judaism': 'Judaism', 'torah': 'Judaism', 'hebrew': 'Judaism',
  'leviticus': 'Judaism', 'exodus': 'Judaism', 'deuteronomy': 'Judaism',
  'psalms': 'Judaism', 'proverbs': 'Judaism',
  'hindu': 'Hindu', 'hinduism': 'Hindu', 'vedic': 'Hindu',
  'bhagavad': 'Hindu', 'gita': 'Hindu', 'upanishad': 'Hindu',
  'sikh': 'Sikh', 'sikhism': 'Sikh', 'granth': 'Sikh',
  'zoroastrian': 'Zoroastrian', 'avesta': 'Zoroastrian',
  'taoist': 'Tao', 'taoism': 'Tao', 'tao': 'Tao',
  'confucian': 'Confucian', 'confucius': 'Confucian', 'analects': 'Confucian',
  'jain': 'Jain', 'jainism': 'Jain',
};

/** The tradition a text explicitly names (whole word), or undefined. */
export function keywordTradition(text) {
  const q = String(text || '').toLowerCase();
  return Object.entries(TRADITION_KEYWORDS).find(([kw]) => {
    const idx = q.indexOf(kw);
    if (idx < 0) return false;
    const before = idx === 0 ? ' ' : q[idx - 1];
    const after = idx + kw.length >= q.length ? ' ' : q[idx + kw.length];
    return !/[a-z]/.test(before) && !/[a-z]/.test(after);
  })?.[1];
}

// Backstop author names, matched as whole words on FOLDED text (no diacritics/apostrophes, hyphens as spaces).
const AUTHOR_NAMES = {
  'Bahá’u’lláh': ['bahaullah', 'baha u llah', 'blessed beauty'],
  'The Báb': ['the bab'],
  '‘Abdu’l-Bahá': ['abdul baha', 'abdulbaha', 'abbas effendi'],
  'Shoghi Effendi': ['shoghi effendi', 'the guardian'],
  'Universal House of Justice': ['universal house of justice'],
};
const foldQuery = (t) => ` ${String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').replace(/[-\u2013\u2014_/]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** The author a text explicitly names (backstop only), or undefined. */
export function keywordAuthor(text) {
  const f = foldQuery(text);
  return Object.entries(AUTHOR_NAMES).find(([, names]) => names.some((n) => f.includes(` ${n} `)))?.[0];
}

const PLAN_TTL_MS = 30 * 60 * 1000;
const planCache = new Map();

const EMPTY = { filters: {}, prefer: null, comparative: false, shape: 'topic', confidence: {}, source: {} };

/** Jev answers (or null) → plan. Pure. */
export function buildPlan(answers, { given = {} } = {}) {
  const plan = { ...EMPTY, filters: {}, prefer: null, confidence: {}, source: {} };
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
      if (au?.aliases && (a.confidence ?? 0) >= AUTHOR_MIN_CONFIDENCE) {
        plan.prefer = { author: a.choice, aliases: au.aliases };
        plan.source.prefer = 'jev';
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
export async function planSearch(input, { given = {}, apiKey = process.env.TYPESAFE_API_KEY, timeoutMs = 2500, fetchImpl = fetch, cache = true } = {}) {
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: String(input || '') }];
  const state = messages.slice(-6).map((m) => `${m.role}: ${String(m.content || '').slice(0, 600)}`).join('\n');
  const t0 = Date.now();
  // Jev unreachable/slow → still honour a tradition the user NAMED, rather than searching everything.
  const backstop = (extra) => {
    const plan = buildPlan(null, { given });
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
    const t = !plan.filters.religion && keywordTradition(lastUser);
    if (t) { plan.filters.religion = t; plan.source.religion = 'keyword-backstop'; }
    const a = keywordAuthor(lastUser);
    if (a) {
      plan.prefer = { author: a, aliases: AUTHORS[a].aliases };
      plan.source.prefer = 'keyword-backstop';
      if (!plan.filters.religion) { plan.filters.religion = "Baha'i"; plan.source.religion = 'keyword-backstop'; }
    }
    return { ...plan, ms: Date.now() - t0, ...extra };
  };
  if (!apiKey || !state.trim()) return backstop({ skipped: true });
  const key = `${state}\u0000${JSON.stringify(given || {})}`;
  const hit = cache && planCache.get(key);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return { ...hit.plan, ms: Date.now() - t0, cached: true };
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
    if (!res.ok) return backstop({ error: `jev HTTP ${res.status}` });
    const j = await res.json();
    const plan = buildPlan(normalizeAnswers(j.answers), { given });
    if (cache) {
      if (planCache.size >= 1000) planCache.delete(planCache.keys().next().value);
      planCache.set(key, { at: Date.now(), plan });   // only SUCCESSFUL plans are cached
    }
    return { ...plan, ms };
  } catch (err) {
    return backstop({ error: err.message });
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
