// Search planning: ONE Jev classification (~150ms, typed, no prose) decides scope + which layers run.
// LLM calls are reserved for summarising results — routing, narrowing and layer choice are classification.
// Pure buildPlan()/layersFor() hold the rules (tested offline); planSearch() is the single network call.
// Rules: fail open; a comparative is never narrowed; caller-given filters win. Deps: scope-extract.js (TRADITIONS).
import { modelFor } from './model-roles.js';
import { TRADITIONS, MIN_CONFIDENCE, ENDPOINT } from './scope-extract.js';
import { detectQuotation, stripMarkup } from './quote-detect.js';
import { jevFetch } from './systemone.js';   // logs the call per task (Laya training) + Clef shadow comparison
import { resolveNamed, resolveNamedAll, objectPhrases, nameSpans } from './named-object.js';
import { jevState, turnFacts } from './assistant/request-features.js';   // the turn's STRUCTURE + reader card + history, for Jev (11-03)

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
  quote: 'the user gives the wording of a passage — verbatim, a fragment, half-remembered, or a whole pasted sentence or paragraph of scripture or prayer ("O Thou …", "Thou seest me …", "Ponder thereon, that …", "Know thou of a truth that …"), pasted bare or with "where is this from?" / "what does this mean?" (the passage is found FIRST — a pasted passage is never a theme and never conversation) — and wants to find it or its source; words in quotation marks are nearly always wording to find, unless they are a term to explain or scare quotes — or the assistant\'s OWN words from its previous reply quoted back with a challenge or a question about them ("you said "…" — is that really in the text?"), which is topic about the passage under discussion, unless the person asks for that quoted passage itself, its source or its original: "find the quote including …", "where does it say …", "who said …", "source of …"; also when the user paraphrases ONE particular saying or image of an author and wants that passage ("what did ‘Abdu’l-Bahá say about fighting thoughts of war with thoughts of peace"); NOT a request for an author\'s quotes, passages or works that explain, elaborate on or expand an idea — that is topic, even when the idea is worded as a well-known phrase',
  fact: 'a factual question about people, places, dates, events or documents: who, when, where, how many, what happened, who a person is or where a name comes from; also a question about this library itself (which religions or works it holds)',
  topic: 'asks what the teachings or scriptures say about a theme, virtue, practice or idea — including what one author wrote on a theme ("Shoghi Effendi on the Administrative Order", "what the Báb wrote about Him Whom God shall make manifest") and requests for an author\'s quotes, passages or works that elaborate on an idea ("Shoghi Effendi quotes on all the Prophets being one", "where the Guardian explains progressive revelation"); also a challenge to or question about the assistant\'s previous reply (its own words quoted back: "you said … — is that really in the text?") is topic about the passage under discussion; never who a person is or what a word means',
  define: 'asks what a term, name or concept means ("what does dharma mean", "meaning of nirvana"), or its etymology or root — even when a word is quoted as the term to explain; a comparison of two ideas or views is topic, not define',
  lookup: 'names a specific work or person and wants that item itself — to read, find or identify it ("where can I read the Bhagavad Gita", "Dawnbreakers", "Dhammapada text"); not what an author wrote on a theme',
  enumerate: 'asks for a list: members of a group, attendees of an event, all instances of something (not a list of what the library holds)',
  converse: 'conversation, not a lookup: a greeting, thanks, small talk, or a question about the assistant itself (its name, what it can do). A title, a name, a phrase of the library\'s content ("hidden words work", "<phrase> source") or a pasted line of prayer or scripture addressed to God ("Thou seest me submerged …") is NEVER conversation — that is quote',
};

// REQUEST and answer LANGUAGE are Jev's fields (11-03), never read from the words in code: "show me the Persian original"
// is a request for the text in its own language on top of whatever shape the turn has; "in Hindi" is a parameter of the
// answer, not a kind of request ("dhammapada meaning in hindi" is define, answered in Hindi).
export const REQUESTS = {
  plain: 'an ordinary request: find, explain, discuss, list, read — the shape says which',
  original_text: 'asks for the ORIGINAL-language text (the Arabic / Persian / Hebrew / Pali / Sanskrit original) of a passage, verse or work ("show me the Persian original of …", "the Arabic of this prayer"), or which language it was revealed or written in',
  translation: 'asks for an existing translation of a NAMED passage or work into another language, or whether one exists ("is there a Hindi translation of the Íqán", "translate this prayer"); NOT "<work> meaning in <language>" or "<topic> in <language>", which only name the language the answer should be in — those are plain, with the language field set',
};
export const LANGUAGES = { none: 'no language is named as the language the person wants to read in. A query ending "in <language>" names it — "<work> meaning in Kannada", "christian quotes in telugu", "who wrote the Gita in Marathi", "hidden words in english", "explain in Hindi" — even when it reads like a search-engine query. Only a language named as the SOURCE text — "the Persian text", "the original Persian", "the Arabic original" — is not an answer language, nor is merely writing in a language',
  en: 'English', fa: 'Persian / Farsi', ar: 'Arabic', hi: 'Hindi', ur: 'Urdu', bn: 'Bengali / Bangla', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', ne: 'Nepali', si: 'Sinhala',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', ru: 'Russian', he: 'Hebrew', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', vi: 'Vietnamese', th: 'Thai', id: 'Indonesian / Malay', sw: 'Swahili', tl: 'Tagalog / Filipino' };
const LANGUAGE_NAMES = { en: 'english', fa: 'persian', ar: 'arabic', hi: 'hindi', ur: 'urdu', bn: 'bengali', ta: 'tamil', te: 'telugu', kn: 'kannada', ml: 'malayalam', mr: 'marathi', gu: 'gujarati', pa: 'punjabi', ne: 'nepali', si: 'sinhala',
  es: 'spanish', fr: 'french', de: 'german', pt: 'portuguese', it: 'italian', nl: 'dutch', pl: 'polish', tr: 'turkish', ru: 'russian', he: 'hebrew', zh: 'chinese', ja: 'japanese', ko: 'korean', vi: 'vietnamese', th: 'thai', id: 'indonesian', sw: 'swahili', tl: 'tagalog' };

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

// PUSHBACK RULE (deterministic): a reader challenging the last reply — "is that actually what the Tablet says, or are you reading
// it in?", "are you sure?", "that's not right", "no, I meant …", "or is that your gloss?" — is about the passage under discussion,
// never a wording hunt (r6-after: seed-93 T3 and detachment T5 went to quote and retrieved nothing to hold or concede with).
const PUSHBACK = new RegExp([
  String.raw`\bare you (?:sure|certain)\b`, String.raw`\b(?:that|this|it)(?:'s| is| was)? (?:not (?:right|correct|true|what)|wrong|incorrect|a paraphrase)\b`,
  String.raw`\bno,? i (?:meant|mean|asked|was asking)\b`, String.raw`\bnot what i (?:asked|meant)\b`,
  String.raw`\b(?:is|was) (?:that|this|it)(?: \w+)? (?:actually|really|truly|even)\b`,
  String.raw`\b(?:does|did|do) (?:it|that|this|the (?:text|tablet|passage|sutra|verse|book|letter)|he|she|they) (?:actually|really|even) (?:say|says|use|mention|state|contain)\b`,
  String.raw`\bor (?:is|was|are) (?:that|this|it|those|these) (?:your|just|merely|only|a|an)\b`,
  String.raw`\byour (?:own )?(?:gloss|interpretation|reading|synthesis|paraphrase|words|inference|addition)\b`,
  String.raw`\breading (?:it|that|this|them) in(?:to)?\b`, String.raw`\bwhere does it (?:actually )?say\b`,
  String.raw`\b(?:i (?:don't|do not|can't|cannot) (?:see|find)|nowhere (?:does|do)) (?:that|this|it|the text|the passage)\b`,
].join('|'), 'i');
/** The turn challenges the previous reply's claim or reading. Pure. */
export const isPushback = (text) => PUSHBACK.test(stripMarkup(text));

// FOLLOW-UP ASKS: what a turn wants BEYOND "where is this from". A quotation plus "who recorded it, which volume and page, and
// what happened next" is not a bare source hunt — the hunt's one-paragraph template drops every other ask (r6-after: 7 strategy
// defects, equality-sexes T2, seed-21 T2/T4, seed-39 T3/T5, seed-66 T5, golden-rule T5). Pure; [] = a plain source question.
const ASKS = {
  translator: /\b(?:translat(?:ed|ion|ions|or|ors)|recorded|record(?:er|ing) of|interpret(?:ed|er)\b|whose (?:translation|notes|words))/i,
  location: /\b(?:chapter|volume|vol\.|issue|page|pages|v[aá]h?[ií]d|gate|section|paragraph|verse) /i,
  recipient: /\b(?:recipient|addressed to|to whom|written to|dated?\b|what year|when (?:was|did|is|were))/i,
  next: /\b(?:what happened|happened (?:next|after|then)|right after|afterwards|what (?:came|comes) (?:next|after)|the rest of|continu(?:e|es|ation))\b/i,
  original: /\b(?:original (?:word|term|language|text)|(?:arabic|persian|farsi) (?:word|term|original)|(?:persian|arabic) or (?:persian|arabic) (?:word|term)|what (?:is|was) the (?:arabic|persian|original))\b/i,
  authenticity: /\b(?:paraphrase|commentary|secretary|on (?:his|her|the guardian's|shoghi effendi'?s?) behalf|authentic|actually (?:in|from) the text)\b/i,
  full: /\b(?:(?:full|whole|complete|entire) (?:passage|text|quote|quotation|tablet|letter)|exact words)\b/i,
  usage: /\b(?:where else|elsewhere|other (?:places|passages|texts) where)\b/i,
};
export function followUpAsks(text) {
  const t = stripMarkup(text).normalize('NFD').replace(/[̀-ͯ]/g, '');   // "Váḥid" → "Vahid"
  const out = Object.entries(ASKS).filter(([, re]) => re.test(t)).map(([k]) => k);
  if (isPushback(t) && !out.includes('authenticity')) out.push('authenticity');
  // two or more separate questions ("…? … and whether …?") are several asks however worded
  if ((t.match(/\?/g) || []).length >= 2 && !out.length) out.push('several');
  return out;
}

// COMPARISON RULE: "isn't that close to the Buddhist view?" compares with another tradition — topic, comparative (r6-after
// 004-soul-reincarnation T2 went to define and produced a nafs/ṣifát tangent instead of the Buddhist material)
const COMPARES = /\b(?:close to|similar to|akin to|same as|parallel(?:s| to)?|compar\w*|contrast\w*|differ\w* from|versus|vs\.?)\b/i;
const comparesTradition = (text) => COMPARES.test(text) && !!speakerTradition(text);

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

const FIELD_MIN_CONFIDENCE = 0.5;   // request / language: Jev's choice over 'plain' / 'none' must be the likelier reading
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
    const rq = answers.request || {}, lg = answers.language || {};
    if (rq.choice && rq.choice !== 'plain' && REQUESTS[rq.choice] && (rq.confidence ?? 0) >= FIELD_MIN_CONFIDENCE) { plan.request = rq.choice; plan.source.request = 'jev'; }
    if (lg.choice && lg.choice !== 'none' && LANGUAGES[lg.choice] && (lg.confidence ?? 0) >= FIELD_MIN_CONFIDENCE) { plan.language = { lang: lg.choice, name: LANGUAGE_NAMES[lg.choice] }; plan.source.language = 'jev'; }
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
  const t0 = Date.now();
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
  // CONTEXT for Jev (11-03): the reader card, the turn's structural facts (position, length, quoted spans, script), then
  // the conversation. Nothing here reads the words for intent — Jev does, and answers shape / request / language as
  // fields of his decision (Chad: "don't try to use deterministic parsing of words to gather intent").
  const facts = turnFacts(messages);
  const state = jevState({ messages, card: messages.card ?? null, turns: 6, chars: 600, clean: stripMarkup });
  // once Jev has decided the turn hunts WORDING, the words to hunt are read by structure: a quoted span (never one the
  // assistant itself said earlier in the thread, quoted back — r5), else the message minus its asking frame, else all of it
  const said = messages.slice(0, -1).filter((m) => m.role === 'assistant').map((m) => String(m.content || ''));
  const phraseOf = () => detectQuotation(lastUser, { said })
    || (facts.quoted.length ? { phrase: [...facts.quoted].sort((a, b) => b.length - a.length)[0].slice(0, 400), via: 'quoted' } : null)   // Jev chose quote: a quoted-back span is still the words
    || { phrase: stripMarkup(lastUser).replace(/\s+/g, ' ').trim().slice(0, 400), via: 'turn' };
  const quotedBack = () => facts.quoted.length > 0 && facts.quotedBack === facts.quoted.length;   // backstop only (no Jev to read the fact)
  const pushback = said.length > 0 && isPushback(lastUser);
  const ruled = (plan, provenance, reason, extra = {}) => {
    const out = { ...plan, source: { ...plan.source }, provenance, reason: reason ?? null, ...extra };
    // request (original text / translation) and language are PARAMETERS beside Jev's shape — they never change it.
    // The assistant's own words quoted back are a TURN fact Jev reads (r5 → 11-03): his shape stands.
    if (out.shape === 'quote') { out.quote = out.quote || phraseOf(); out.about = 'texts'; }
    // PUSHBACK RULE: a challenge to the last reply with no wording of its own to find is about the passage under discussion
    if (pushback) {
      out.pushback = true;
      if (!facts.quoted.length && out.shape === 'quote') {
        out.overridden = { shape: out.shape, about: out.about, by: 'pushback-rule' };
        Object.assign(out, { shape: 'topic', about: 'texts' }); delete out.quote; out.source = { ...out.source, shape: 'pushback-rule' };
      }
    }
    // COMPARISON (Jev's field): a comparison Jev also called a definition is a topic across the things compared
    if (out.comparative && out.shape === 'define') {
      out.overridden = { shape: 'define', about: out.about, by: 'comparison-rule' };
      Object.assign(out, { shape: 'topic' }); out.source = { ...out.source, shape: 'comparison-rule' };
      if (out.source.religion !== 'caller') { out.filters = { ...out.filters }; delete out.filters.religion; }
    }
    return out;
  };
  // Jev unreachable/slow → still honour a tradition the user NAMED, rather than searching everything.
  const backstop = (reason, extra) => {
    const plan = buildPlan(null, { given });
    // a span in quotation marks of four or more words is, with no Jev to say otherwise, wording to find (11-01: a timeout
    // left the empty default and a quote hunt answered with unrelated people). Structure, not words.
    if (facts.quoted.some((q) => q.split(' ').length >= 4) && !quotedBack()) { plan.shape = 'quote'; plan.about = 'texts'; plan.source.shape = 'backstop-quoted'; }
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
          shape: { type: 'choice', instructions: 'What kind of request is the latest user turn, read with the conversation and the reader? A short turn ("more", "and the Báb?", a name) continues the previous subject.', criteria: SHAPES },
          about: { type: 'choice', instructions: 'What is the latest user turn ABOUT?', criteria: ABOUT },
          request: { type: 'choice', instructions: 'Does the latest user turn ask for a text in its ORIGINAL language, or for a TRANSLATION — or is it a plain request?', criteria: REQUESTS },
          language: { type: 'choice', instructions: 'Does the latest user turn name the language the ANSWER should be written in ("in Hindi", "answer in Spanish", "بالعربية")? Answer none otherwise.', criteria: LANGUAGES },
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
function namedFor(text, resolve, tag = 'one') {
  const k = `${tag}\u0000${String(text || '').trim()}`;
  const hit = nameCache.get(k);
  if (hit && Date.now() - hit.at < NAME_TTL_MS) return hit.p;
  // the deadline lets the resolver stop starting lookups: they are synchronous queries, which the timer below cannot interrupt
  const p = Promise.race([Promise.resolve().then(() => resolve(String(text || '').trim(), { deadline: Date.now() + NAME_WAIT_MS })).catch(() => null), new Promise((r) => setTimeout(() => r(null), NAME_WAIT_MS).unref?.())]);
  if (nameCache.size >= 1000) nameCache.delete(nameCache.keys().next().value);
  nameCache.set(k, { at: Date.now(), p });
  return p;
}
const inTests = () => !!(process.env.VITEST || process.env.NODE_ENV === 'test');
const defaultResolver = () => (inTests() ? null : resolveNamed);
const defaultMentions = () => (inTests() ? null : resolveNamedAll);

/** Every tradition a text names — by keyword ("Buddhist", "the Qur'an") or by founder/scripture ("Augustine" is not one). Pure. */
export function traditionsNamed(text) {
  const q = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase();
  const found = new Set();
  for (const [kw, t] of Object.entries(TRADITION_KEYWORDS)) {
    const i = q.indexOf(kw);
    if (i >= 0 && !/[a-z]/.test(q[i - 1] || ' ') && !/[a-z]/.test(q[i + kw.length] || ' ')) found.add(t);
  }
  for (const [re, t] of FOUNDER_TRADITION) if (re.test(q)) found.add(t);
  return found;
}

/** An INFERRED tradition (Jev, the keyword backstop — never the caller's) becomes a preference: the filter is lifted and
 *  planned-search orders that tradition first instead (plan.lean). A question about the Íqán that names Elijah and John
 *  the Baptist must not be searched in the Christian texts alone (px-smoke return-iqan). Pure; → a new plan. */
export function leanTradition(plan, why) {
  const r = plan?.filters?.religion;
  if (!r || plan.source?.religion === 'caller' || plan.source?.religion === 'site-default') return plan;
  const filters = { ...plan.filters };
  delete filters.religion;
  return { ...plan, filters, lean: { religion: r, why, was: plan.source?.religion || null }, source: { ...plan.source, religion: `lean:${why}` } };
}

/** The persons and works a LONG turn names (resolveNamedAll), and its name spans for planned-search's title lookup
 *  (search/named-scope.js). Several works or traditions named → the inferred tradition only leans. Pure. */
export function applyMentions(plan, text, mentions) {
  if (!plan || !text) return plan;
  const spans = nameSpans(text);
  // a SHORT turn: its one named object (applyObjectRules) is the mention; its spans still reach the title lookup
  // (wording px-iqan-return-elijah#02: "the passage in the Kitáb-i-Íqán where…" searched the whole library, not the Íqán)
  if (objectPhrases(text).length) {
    const n = plan.named;
    const list = n?.type === 'work' ? [{ type: n.type, id: n.id, name: n.name, matched: n.matched }] : [];
    return list.length || spans.length ? { ...plan, ...(list.length ? { mentions: list } : {}), ...(spans.length ? { spans } : {}) } : plan;
  }
  const list = (mentions || []).map(({ type, id, name, matched }) => ({ type, id, name, matched }));
  if (!list.length && !spans.length) return plan;
  let out = { ...plan, ...(list.length ? { mentions: list } : {}), ...(spans.length ? { spans } : {}) };
  const works = list.filter((m) => m.type === 'work').length;
  if (works >= 2) out = leanTradition(out, 'works');
  else if (traditionsNamed(text).size >= 2) out = leanTradition(out, 'traditions');
  return out;
}

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
  const { resolveName = defaultResolver(), resolveMentions = defaultMentions() } = opts;
  const messages = Array.isArray(input) ? input : [{ role: 'user', content: String(input || '') }];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content;
  const namedP = resolveName && lastUser ? namedFor(lastUser, resolveName) : null;
  // a LONG turn has no single object: every person and work it names is found instead (beside Jev, same wait)
  const long = lastUser && !objectPhrases(lastUser).length;
  const mentionsP = resolveMentions && long ? namedFor(lastUser, resolveMentions, 'all') : null;
  const plan = await planCore(input, opts);
  // lookup_ms = how long the plan waited on the name lookup AFTER Jev answered (plan.ms is Jev's own) — budgeted stages
  const tw = Date.now();
  const named = namedP ? await namedP : null, mentions = mentionsP ? await mentionsP : null;
  const out = applyMentions(applyObjectRules(plan, lastUser, named), lastUser, mentions);
  return namedP || mentionsP ? { ...out, lookup_ms: Date.now() - tw } : out;
}

// Jev reports a choice's confidence either directly or as its share of the distribution.
function normalizeAnswers(a) {
  if (!a) return null;
  const choice = (x) => {
    if (!x) return x;
    const c = x.choice ?? x.value ?? null;
    return { choice: c, confidence: x.confidence ?? x.distribution?.[c] ?? 0 };
  };
  return { tradition: choice(a.tradition), author: choice(a.author), shape: choice(a.shape), about: choice(a.about), request: choice(a.request), language: choice(a.language), comparative: a.comparative };
}
