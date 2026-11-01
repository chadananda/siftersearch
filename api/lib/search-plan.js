// Search planning: ONE Jev classification (~150ms, typed, no prose) decides scope + which layers run.
// LLM calls are reserved for summarising results — routing, narrowing and layer choice are classification.
// Pure buildPlan()/layersFor() hold the rules (tested offline); planSearch() is the single network call.
// Rules: fail open; a comparative is never narrowed; caller-given filters win. Deps: scope-extract.js (TRADITIONS).
import { modelFor } from './model-roles.js';
import { TRADITIONS, MIN_CONFIDENCE, ENDPOINT } from './scope-extract.js';
import { detectQuotation, isMeaningQuestion, stripMarkup } from './quote-detect.js';
import { jevFetch } from './systemone.js';   // logs the call per task (Laya training) + Clef shadow comparison
import { resolveNamed } from './named-object.js';

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

export const SMALL_TALK = /\b(hi|hello|hey|greetings|salaam|thanks?|thank you|bye|goodbye|good (morning|afternoon|evening)|how are you|who are you|what are you|your name|what can you|can you help|are you (a|an|ai|real|human|there)|you)\b/i;
const SHAPES = {
  quote: 'the user gives the wording of a passage — verbatim, a fragment, or half-remembered — and wants to find it or its source: "find the quote including …", "where does it say …", "who said …", "source of …"; also when the user paraphrases ONE particular saying or image of an author and wants that passage ("what did ‘Abdu’l-Bahá say about fighting thoughts of war with thoughts of peace"); NOT a request for an author\'s quotes, passages or works that explain, elaborate on or expand an idea — that is topic, even when the idea is worded as a well-known phrase',
  fact: 'a factual question about people, places, dates, events or documents: who, when, where, how many, what happened, who a person is or where a name comes from; also a question about this library itself (which religions or works it holds)',
  topic: 'asks what the teachings or scriptures say about a theme, virtue, practice or idea — including what one author wrote on a theme ("Shoghi Effendi on the Administrative Order", "what the Báb wrote about Him Whom God shall make manifest") and requests for an author\'s quotes, passages or works that elaborate on an idea ("Shoghi Effendi quotes on all the Prophets being one", "where the Guardian explains progressive revelation"); never who a person is or what a word means',
  define: 'asks what a term, name or concept means ("what does dharma mean", "meaning of nirvana")',
  lookup: 'names a specific work or person and wants that item itself — to read, find or identify it ("where can I read the Bhagavad Gita", "Dawnbreakers", "Dhammapada text"); not what an author wrote on a theme',
  enumerate: 'asks for a list: members of a group, attendees of an event, all instances of something (not a list of what the library holds)',
  converse: 'conversation, not a lookup: a greeting, thanks, small talk, or a question about the assistant itself (its name, what it can do). A title, a name or a phrase of the library\'s content ("hidden words work", "<phrase> source") is NEVER conversation',
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
  'psalms': 'Judaism', 'psalm': 'Judaism', 'proverbs': 'Judaism', 'sura': 'Islam', 'surah': 'Islam', 'dhammapada': 'Buddhist',
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

// A tradition's founder or scripture named as the SPEAKER of a quotation ("Jesus said …", "check the gospels"): used only to
// judge where a quotation should come from (respond huntSource) — not a search filter, since Bahá'í texts speak OF them too.
const FOUNDER_TRADITION = [
  [/\b(jesus|christ|gospels?|new testament|apostle paul|saint paul|st\.? paul)\b/i, 'Christian'],
  [/\b(prophet muhammad|muhammad said|the prophet said|quran|qur'an|koran|hadith)\b/i, 'Islam'],
  [/\b(moses said|torah|old testament|hebrew bible)\b/i, 'Judaism'],
  [/\b(krishna|bhagavad|gita|upanishads?|vedas?)\b/i, 'Hindu'],
  [/\b(buddha|dhammapada|sutta|sutra)\b/i, 'Buddhist'],
  [/\b(zoroaster|zarathustra|avesta|gathas)\b/i, 'Zoroastrian'],
  [/\b(lao[- ]?tzu|lao[- ]?tse|laozi|tao te ching)\b/i, 'Tao'],
  [/\b(confucius|analects)\b/i, 'Confucian'],
  [/\b(guru nanak|granth)\b/i, 'Sikh'],
];
/** The tradition whose founder or scripture a question names, else the tradition it names outright; undefined for neither
 *  (and for the Bahá'í Faith: its own texts are the ordinary source hunt). Pure. */
export function speakerTradition(text) {
  const t = String(text || '');
  const named = FOUNDER_TRADITION.find(([re]) => re.test(t))?.[1] || keywordTradition(t);
  return named && named !== "Baha'i" ? named : undefined;
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

// What the question is ABOUT — picks the search pattern (Chad: "JEV should be selecting a search pattern that
// provides the Anis LLM with the information it needs"). people → the cited-claim graph (who, did what, when).
const ABOUT = {
  people: 'people: who someone was, what people did, who met, attended or belonged to something, relationships between people',
  texts: 'what a scripture, writing, talk or teaching says',
  terms: 'what a word, name or concept means',
  events: 'an event, place or date as such (what happened at X, where Y is)',
};

const EMPTY = { filters: {}, prefer: null, comparative: false, shape: 'topic', about: 'texts', confidence: {}, source: {} };

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
    if (answers.about?.choice && ABOUT[answers.about.choice]) plan.about = answers.about.choice;
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
  // Meaning-match (query embedding → vector layers) only where the strategy needs it: a lookup names its target.
  // NOT quotes — "Buddha said hatred is never ended by more hatred" is classed a quote but is a paraphrase — and NOT
  // people facts ("When was the Báb martyred?" is answered by HyPE). Who-met-whom drops it at search time, once the
  // encounter index has recognised the question (planned-search.js). Battery 2026-09-26: 3 regressions otherwise.
  const semantic = shape !== 'lookup';
  return {
    main: true,
    semantic,
    // A remembered quote is a WORDING problem: exact-word matching finds it; embeddings find its neighbours.
    keyword: shape === 'quote',
    hype: semantic && shape !== 'quote',
    // Cited claims answer rosters and people questions directly, with the paragraph that proves them. NOT plain
    // facts: passages + HyPE answer "When was the Báb martyred?", and the claim LIKE-scan (peopleSearch) cost 5-12s
    // there while blocking the API (battery 2026-09-26). Who-met-whom facts go to the encounter index regardless.
    claims: shape === 'enumerate' || (plan.about === 'people' && shape !== 'fact'),
    // The cited concept lexicon answers what a symbol means, in the interpreter's words; it fires only when the
    // question names a symbol, so it is safe on every shape but a remembered quote (a wording hunt).
    concept: shape !== 'quote',
    // Spread across traditions only when the question named none and is not hunting one passage.
    diversify: !scoped && shape !== 'quote',
  };
}

// Jev's classification + the quote rule and converse guard (planSearch below adds the object rules).
async function planCore(input, { given = {}, apiKey = process.env.TYPESAFE_API_KEY, timeoutMs = Number(process.env.SEARCH_PLAN_TIMEOUT_MS) || 2500, fetchImpl = jevFetch('search-plan'), cache = true } = {}) {
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: String(input || '') }];
  const state = messages.slice(-6).map((m) => `${m.role}: ${stripMarkup(m.content).slice(0, 600)}`).join('\n');
  const t0 = Date.now();
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
  // QUOTATION RULE (deterministic, never waits on Jev): wording to find is shape 'quote' whatever the backstop default or
  // Jev said — a 700 ms timeout once left the empty default (topic) and a quote hunt answered with unrelated people (11-01).
  // …but never words the assistant itself said earlier in the thread, quoted back to it (r5, 11-01)
  const said = messages.slice(0, -1).filter((m) => m.role === 'assistant').map((m) => String(m.content || ''));
  const quote = detectQuotation(lastUser, { said });
  // MEANING RULE: an etymology / meaning / comparison question is define (or topic, for a comparison), never a quote hunt
  const meaning = !quote && isMeaningQuestion(stripMarkup(lastUser));
  const ruled = (plan, provenance, reason, extra = {}) => {
    const out = { ...plan, source: { ...plan.source }, provenance, reason: reason ?? null, ...extra };
    // CONVERSE GUARD (deterministic): two or more content words that are no greeting, thanks or question about the assistant are
    // a request for library content, never small talk (11-01 wording battery: "hidden words work" answered as a greeting)
    if (!quote && plan.shape === 'converse' && !SMALL_TALK.test(String(lastUser || '')) && (String(lastUser || '').match(/\p{L}{3,}/gu) || []).length >= 2) {
      out.overridden = { shape: 'converse', about: plan.about, by: 'converse-guard' };
      Object.assign(out, { shape: 'lookup' }); out.source = { ...out.source, shape: 'converse-guard' };
    }
    if (meaning && plan.shape === 'quote') {
      out.overridden = { shape: 'quote', about: plan.about, by: 'meaning-rule' };
      out.shape = /differ|compar|contrast|similar/i.test(String(lastUser)) ? 'topic' : 'define';
      out.source = { ...out.source, shape: 'meaning-rule' };
    }
    if (quote) {
      if (plan.shape !== 'quote') out.overridden = { shape: plan.shape, about: plan.about, by: 'quote-rule' };
      Object.assign(out, { shape: 'quote', about: 'texts', quote });
      out.source.shape = 'quote-rule';
    }
    return out;
  };
  // Jev unreachable/slow → still honour a tradition the user NAMED, rather than searching everything.
  const backstop = (reason, extra) => {
    const plan = buildPlan(null, { given });
    const t = !plan.filters.religion && keywordTradition(lastUser);
    if (t) { plan.filters.religion = t; plan.source.religion = 'keyword-backstop'; }
    const a = keywordAuthor(lastUser);
    if (a) {
      plan.prefer = { author: a, aliases: AUTHORS[a].aliases };
      plan.source.prefer = 'keyword-backstop';
      if (!plan.filters.religion) { plan.filters.religion = "Baha'i"; plan.source.religion = 'keyword-backstop'; }
    }
    return ruled({ ...plan, ms: Date.now() - t0 }, 'backstop', reason, extra);
  };
  if (!apiKey) return backstop('no-key', { skipped: true });
  if (!state.trim()) return backstop('empty-state', { skipped: true });
  const key = `${state}\u0000${JSON.stringify(given || {})}`;
  const hit = cache && planCache.get(key);
  if (hit && Date.now() - hit.at < PLAN_TTL_MS) return ruled({ ...hit.plan, ms: Date.now() - t0, cached: true }, 'jev:cached');
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelFor('search-planner').model,
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
          about: { type: 'choice', instructions: 'What is the latest user turn ABOUT?', criteria: ABOUT },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return backstop(`jev HTTP ${res.status}`, { error: `jev HTTP ${res.status}` });
    const j = await res.json();
    const plan = buildPlan(normalizeAnswers(j.answers), { given });
    if (cache) {
      if (planCache.size >= 1000) planCache.delete(planCache.keys().next().value);
      planCache.set(key, { at: Date.now(), plan });   // only SUCCESSFUL plans are cached (the raw Jev plan: the rule is re-applied per read)
    }
    return ruled({ ...plan, ms }, 'jev');
  } catch (err) {
    return backstop(/timeout|abort/i.test(`${err.name} ${err.message}`) ? 'timeout' : err.message, { error: err.message });
  }
}

// LIBRARY-META RULE (deterministic): "which religions are in the library?" asks about the library itself — answered from
// the catalogue's own counts (respond.js), never an enumerate search over passages (11-01 battery: lm-religions 0/13).
const RELIGIONS_WORD = /\brel\w{0,3}g\w{0,2}ns\b|\btraditions\b|\bfaiths\b/i;
const LIBRARY_WORD = /\bli\w{0,2}r\w{0,2}y\b|\bcollection\b/i;
const ASKS_WHICH = /\b(which|wich|what|whats|what's|list of|how many)\s+(?:\w+\s+)?(rel\w{0,3}g\w{0,2}ns|traditions|faiths)\b/i;
export function libraryQuestion(text) {
  const t = String(text || '');
  if (!RELIGIONS_WORD.test(t) || !LIBRARY_WORD.test(t) || /\b(say|says|teach|teaches|believe|believes)\b/i.test(t)) return null;
  return ASKS_WHICH.test(t) || t.trim().split(/\s+/).length <= 5 ? 'religions' : null;
}

// NAME RULE: a turn whose object is a person or a work ("find where Ghoddus is discussed", "Most Holy Book source") is a
// lookup whatever its frame says — resolved by the entity lookup with a strict whole-name match (named-object.js).
// Memoised by text: plannedSearch re-plans the same turn. Off under tests unless a resolver is injected.
const NAME_TTL_MS = 30 * 60 * 1000, NAME_WAIT_MS = 1200;
const nameCache = new Map();
function namedFor(text, resolve) {
  const k = String(text || '').trim();
  const hit = nameCache.get(k);
  if (hit && Date.now() - hit.at < NAME_TTL_MS) return hit.p;
  const p = Promise.race([Promise.resolve(resolve(k)).catch(() => null), new Promise((r) => setTimeout(() => r(null), NAME_WAIT_MS).unref?.())]);
  if (nameCache.size >= 1000) nameCache.delete(nameCache.keys().next().value);
  nameCache.set(k, { at: Date.now(), p });
  return p;
}
const defaultResolver = () => (process.env.VITEST || process.env.NODE_ENV === 'test' ? null : resolveNamed);

/** The rules over the planned turn's OBJECT (after Jev and the quote rule): quote-rule > library > name > Jev. Pure. */
export function applyObjectRules(plan, text, named) {
  if (!plan || plan.source?.shape === 'quote-rule') return plan;
  const out = { ...plan, source: { ...plan.source } };
  const lib = libraryQuestion(text);
  if (lib) {
    if (plan.shape !== 'fact') out.overridden = { shape: plan.shape, about: plan.about, by: 'library-rule' };
    Object.assign(out, { shape: 'fact', about: 'texts', library: lib });
    out.source.shape = 'library-rule';
    return out;
  }
  if (!named) return out;
  // a person keeps a fact / definition question about him ("who was Vahid?"); anything else about a named person or work
  // (quotes, where-is, a list, a theme word) is the item itself
  const keep = named.type === 'person' ? ['fact', 'define', 'lookup'] : ['lookup'];
  out.named = named;
  if (!keep.includes(plan.shape)) {
    out.overridden = { shape: plan.shape, about: plan.about, by: 'name-rule' };
    out.shape = 'lookup';
    out.source.shape = 'name-rule';
  }
  return out;
}

/**
 * The one network call. `input` is a query string or a message array (the conversation is the state:
 * "and what about compassion?" carries no tradition of its own). The name lookup runs beside Jev (≤1.2 s, memoised).
 */
export async function planSearch(input, opts = {}) {
  const { resolveName = defaultResolver() } = opts;
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: String(input || '') }];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
  const namedP = resolveName && lastUser ? namedFor(lastUser, resolveName) : null;
  const plan = await planCore(input, opts);
  return applyObjectRules(plan, lastUser, namedP ? await namedP : null);
}

// Jev reports a choice's confidence either directly or as its share of the distribution.
function normalizeAnswers(a) {
  if (!a) return null;
  const choice = (x) => {
    if (!x) return x;
    const c = x.choice ?? x.value ?? null;
    return { choice: c, confidence: x.confidence ?? x.distribution?.[c] ?? 0 };
  };
  return { tradition: choice(a.tradition), author: choice(a.author), shape: choice(a.shape), about: choice(a.about), comparative: a.comparative };
}
