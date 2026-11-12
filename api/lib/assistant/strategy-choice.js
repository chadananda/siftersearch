// Which STRATEGY a turn runs (W3) is JEV'S decision from context — the thread, never a keyword or regex on the message
// (Chad 11-03: "don't try to use deterministic parsing of words to gather intent"). Code only EXECUTES what he chose
// (strategies.js, prayer-shelf.js, guidance.js, scripture-ref.js). One System One call beside triage (turn.js), typed
// answers only (System One has no free-text type — verified 11-03, 400 on 'text'/'string'). Every answer is logged as a
// decision (inputs, options, probabilities, branch). Deps: systemone (jevFetch), model-roles, scope-extract TRADITIONS.
import { jevFetch } from '../systemone.js';
import { jevCall, JEV_LIMITS } from './jev-call.js';
import { modelFor } from '../model-roles.js';
import { ENDPOINT, TRADITIONS, MIN_CONFIDENCE } from '../scope-extract.js';
import { jevProbabilities } from './decision-log.js';
import { drawFromCriteria } from '../search-plan.js';
import { catalog } from '../repos/strategies-repo.js';
import { UNMATCHED, isUnmatched } from './strategy-seed.js';
import { TREE_GRAPHS, LOOKUP_TREE_GRAPHS } from './strategy-trees-seed.js';
const PLACE_READERS = new Set(Object.entries({ ...TREE_GRAPHS, ...LOOKUP_TREE_GRAPHS }).filter(([, g]) => g.needs?.includes('work_place')).map(([id]) => id));
import { emptyState, stateText, patchQuestions, patchFromAnswers } from './units.js';   // conversation_state: Jev's patch rides in this same call

// Jev's STRATEGY options = the active strategy rows (strategies-repo; seed: strategy-seed.js): option key = row name, criterion =
// row description, in seeded order with 'unmatched' (the respond graph) last. Built once per catalog rev.
const optionsMemo = new WeakMap();
export function strategyOptions() {
  const c = catalog();
  if (!optionsMemo.has(c)) {
    const rows = c.strategies.filter((s) => s.description);
    const ordered = [...rows.filter((s) => !isUnmatched(s.name)), ...rows.filter((s) => isUnmatched(s.name))];
    optionsMemo.set(c, Object.freeze(Object.fromEntries(ordered.map((s) => [s.name, s.description]))));
  }
  return optionsMemo.get(c);
}
/** The options as a live read-only object (key order = Jev's option order). */
export const STRATEGIES = new Proxy({}, {
  get: (_, k) => strategyOptions()[k],
  has: (_, k) => k in strategyOptions(),
  ownKeys: () => Reflect.ownKeys(strategyOptions()),
  getOwnPropertyDescriptor: (_, k) => (k in strategyOptions() ? { value: strategyOptions()[k], enumerable: true, configurable: true, writable: false } : undefined),
});
const SIDES = { ...Object.fromEntries(Object.entries(TRADITIONS).filter(([k]) => k !== 'none')), none: 'no such tradition in the question' };
// 11-10: "How did he die?" after "Who was Mullá Ḥusayn?" asks something NEW about the same subject; anchoring it on the last reply's passages put the
// biography's sources ahead of Nabíl's account of his death. Only a message about the reply itself (its quote, its passages) is anchored on them.
const REFERS = { own: 'the message states its own subject, whole',
  subject: 'it asks something new about the person, event, book or topic the previous turn was about ("how did he die?", "when was it written?", "what happened next?")',
  previous: 'it asks about the previous reply itself or the passages it gave ("that quote", "the actual words", "the second one", "is that authentic?", "how does that compare with …")' };
// WHERE in a work the reader wants to read (11-12 Kawthar: "the first couple paragraphs" after a title card searched the question's words inside
// the tafsir and showed paragraphs 169/68/754; "and the next paragraph?" went to research). Jev's typed answer; code reads the place.
const WORK_PLACE = { opening: 'the beginning of a work: its first paragraph or paragraphs, or its first numbered items ("the first three" Hidden Words, verses or prayers of a work)', next: 'the paragraph(s) that come right after the passage the previous reply showed',
  subject: 'a particular subject, verse or passage inside the work', none: 'no place in a work is asked for' };
const SIDE_KEYS = ['side_a', 'side_b', 'side_c'];
const ORD = ['FIRST', 'SECOND', 'THIRD'];
// the BOOKS a comparison names ("the Book of Mormon", "the Gospels", "the Torah"): each name span of the thread
// (drawFromCriteria: structure, not meaning) is put to Jev — is it a book to read for one side, and whose? The executor reads it.
const MAX_BOOK_SPANS = 4;
const bookAsk = (span) => `In the latest message, is "${span}" a particular BOOK or scripture to be read for one side of the comparison? If so, which tradition's book is it? Answer "none" when it names a tradition, a people, a person or anything other than a book.`;

// Early filters (Chad 11-09): what each name span IS (a work, a person, neither) and which tradition the question is about are Jev's answers in this SAME call
// (typed choices only); code resolves them — a span becomes named_work / named_person, the topic is the question minus those spans (a search phrase, not the whole question).
// "subject" and "neither" are separate options: one "neither" for both a person the question is ABOUT and an ordinary capitalised word made
// "Great" (an acknowledgment) the named subject and split Quddús's vote below confidence (11-11 email "Great. What can you tell me about Quddus?")
const KINDS = { work: 'a written WORK: a book, tablet, treatise or scripture (its title)', person: 'a PERSON or author whose own teaching or writing the reader asks about (the words they said or wrote, "X on grace", "what X teaches")', subject: 'a person, place, event, concept or tradition the question is ABOUT (who they were, their life, story, childhood, death; what happened there; what it means)', neither: 'not a name or subject at all: an ordinary word capitalised only because it STARTS the sentence — a command word (Trace, Compare, Find, Show), an acknowledgment, thanks or greeting (Great, Thanks, Okay, Hello, Yes)' };
const kindAsk = (span) => `In the latest message, what is "${span}" — a written work, a person whose own teaching or writing is asked about, a subject the question is about (a person's life or story, a place, event or concept), or neither (no name or subject at all)? A capitalised first word of a sentence is a name only when it really is one; an ordinary command word or an acknowledgment ("Great.", "Thanks!") is neither.`;
// a language names no tradition (round 5: "What does the Arabic word irfán mean?" → Islam scoped out the Bahá'í Writings that use the word)
const LANGUAGE_IS_NOT_A_TRADITION = ' A language is not a tradition: "the Arabic word …", "in Persian", "the Hebrew term …", "the Sanskrit …" name the language of a word, which several traditions share — choose a tradition only when the message names or plainly means the tradition itself.';
// a subject tradition REMOVES every other tradition from the turn, so a wrong guess switches the subject (a Bahá'í prayer answered
// from Buddhist books at 0.6, 11-12) — it filters only when Jev is sure; a hesitant guess leaves the turn unfiltered
export const SUBJECT_FILTER_MIN = 0.8;
const SUBJECT_ASK = `Does the latest message ask about the texts, teachers or teachings of one particular religion or tradition ("Buddhist anatta", "Sufi Rumi on fana", "Augustine on grace")? Choose it. A work belongs to its AUTHOR'S tradition, never to the scripture it comments on or quotes, nor to the genre's or language's usual tradition (a Bahá'í writer's commentary on a sūra of the Qur'án is Bahá'í; a Christian's study of the Gita is Christian). In a thread, the tradition already being discussed holds unless the latest message names another. "none" when it names no tradition.${LANGUAGE_IS_NOT_A_TRADITION}`;
const FRAME = /^(?:according to|as (?:stated|explained|written|said) (?:in|by)|per|by|from|in|on)\s+/i;
const FUNCTION_WORDS = /^(?:who|what|whom|whose|which|when|where|why|how|was|were|is|are|am|be|did|do|does|the|a|an|of|to|in|on|and|or|about|tell|me)\W*$/i;   // question/function words carry no search content
const ASK_WORDS = /^(?:can|could|would|will|you|please|i|know|like|more|some|anything|something|give|explain|describe|say|said)\W*$/i;   // an asking frame's words ("can you tell me about …")
const frameless = (n) => String(n).replace(FRAME, '').trim();
// A span's own title (11-12 battery: "the Arabic Tablet of Aḥmad" resolved to an essay ABOUT the tablet, "Arabic Hidden Words" to
// nothing — the word saying which copy is wanted was read as part of the name). Code offers the span and the span less its first or
// last word (structure, no word list); Jev chooses which is the title. The copy wanted (its language) is the strategy's job.
export function titleOptions(span) {
  const w = frameless(span).split(/\s+/).filter(Boolean);
  if (w.length < 2) return null;
  const trim = (xs) => { const ys = [...xs]; while (ys.length && !/\p{Lu}/u.test(ys.at(-1))) ys.pop(); while (ys.length && !/\p{Lu}/u.test(ys[0])) ys.shift(); return ys.join(' '); };
  const opts = [...new Set([w.join(' '), trim(w.slice(1)), trim(w.slice(0, -1))].filter((x) => x && /\p{L}{3,}/u.test(x)))];
  return opts.length > 1 ? Object.fromEntries(opts.map((o, i) => [o, i ? `${o}: the title — the other word only says which copy is wanted` : `${o}: the whole span is the title`])) : null;
}
const titleAsk = (span) => `In the latest message, if "${span}" names a written work: which is the work's own title, as a library catalogue lists it? A word that only says WHICH copy the reader wants — its language, script, edition or translation ("the Arabic …", "the Persian …", "the authorized …") — is not part of the title; a word the title itself carries stays.`;
/** Jev's span kinds → { named_work, named_person, named_subjects (his "subject" spans), topic } (units for the tree's `request`). Pure. */
export function namedUnits(a = {}, spans = [], question = '', min = MIN_CONFIDENCE) {
  const titled = (n, i) => { const t = choice(a[`title_${i + 1}`]), o = titleOptions(n); return t?.choice && o?.[t.choice] && (t.confidence ?? 0) >= min ? t.choice : frameless(n); };
  const kinds = spans.map((n, i) => { const k = choice(a[`kind_${i + 1}`]); return { name: k?.choice === 'work' ? titled(n, i) : frameless(n), raw: n, ...k }; }).filter((k) => k.name && ['work', 'person'].includes(k.choice) && (k.confidence ?? 0) >= min);
  const best = (c) => kinds.filter((k) => k.choice === c).sort((x, y) => (y.confidence ?? 0) - (x.confidence ?? 0))[0];   // the highest-confidence span of each kind
  const work = best('work'), person = best('person');
  const rest = kinds.reduce((q, k) => q.replace(k.raw, '\u0000'), String(question)).replace(/(?:\b(?:according to|as (?:stated|explained|written|said) (?:in|by)|in|from|by|on|per)\s+)?\u0000(?:['’]s\b)?[\s,;:'"’‘“”()-]*/gi, ' ')
    // remnants of a removed span (structure): lone quote/apostrophe tokens, a dangling "?" or "Who was ?"-style gap
    .replace(/(^|\s)['"’‘“”]+(?=\s|$)/g, ' ').replace(/\s+([?!.,;:])/g, '$1').replace(/^[?!.,;:\s]+/, '').replace(/\s+/g, ' ').trim();
  const words = rest.split(/[\s]+/).filter((w) => /[\p{L}\p{N}]{2,}/u.test(w) && !FUNCTION_WORDS.test(w));
  // the message is only an asking frame around subjects Jev read as "subject" ("Tell me about Vaḥíd", "Who was Ṭáhirih?") → the subjects are the topic;
  // the whole question as the topic sent "tell me about" to the literal layer (11-11: Sutta Nipata, Mahabharata for Vaḥíd)
  const subjects = spans.filter((n, i) => { const k = choice(a[`kind_${i + 1}`]); return k?.choice === 'subject' && (k.confidence ?? 0) >= min; }).map(frameless).filter(Boolean);
  // Jev's "neither" spans (an acknowledgment "Great.", a sentence-initial command word) carry nothing: they never keep the whole question as the topic
  const empty = spans.filter((n, i) => { const k = choice(a[`kind_${i + 1}`]); return k?.choice === 'neither' && (k.confidence ?? 0) >= min; });
  const bare = subjects.length && !kinds.length && ![...subjects, ...empty].reduce((q, n) => q.split(n).join(' '), String(question)).split(/\s+/).some((w) => /[\p{L}\p{N}]{2,}/u.test(w) && !FUNCTION_WORDS.test(w) && !ASK_WORDS.test(w));
  return { ...(work ? { named_work: work.name } : {}), ...(person ? { named_person: person.name } : {}), ...(subjects.length ? { named_subjects: subjects } : {}), ...(kinds.length && words.length >= 2 ? { topic: rest } : bare ? { topic: subjects.join(' ') } : {}) };
}

const choice = (a) => a && { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null };

/** The thread as Jev sees it (last turns, clipped). Pure. */
export const stateOf = (messages = [], { profile = {} } = {}) => {
  const recent = messages.slice(-4), lastReply = recent.map((m) => m.role).lastIndexOf('assistant');   // the previous reply is read WHOLE ("the second one" needs every item); the rest is clipped
  const lines = recent.map((m, i) => `${m.role}: ${i === lastReply ? String(m.content || '') : String(m.content || '').slice(0, 800)}`);
  if (profile.default_tradition) lines.unshift(`reader: usually asks about ${profile.default_tradition}`);
  return lines.join('\n');
};

/**
 * @returns {Promise<null | { strategy: {choice, confidence, distribution}, sides: string[], ms, decisions: object[] }>}
 *   strategy.choice ∈ STRATEGIES; low confidence → 'unmatched' (fail open: the ordinary pipeline). sides: traditions, in order, for a comparison.
 */
export async function chooseStrategy(messages, { profile = {}, apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = jevFetch('anis-strategy'), timeoutMs = JEV_LIMITS.strategy.timeoutMs,
  budgetMs = Math.max(timeoutMs, JEV_LIMITS.strategy.budgetMs), onJev = null, min = MIN_CONFIDENCE, options = null, conversationState = null, turn = null } = {}) {
  const opts = options || strategyOptions();   // options: an OPTION-TEXT VARIANT (promotion's check: the active set + one candidate)
  const st = conversationState || emptyState();
  const state = [stateOf(messages, { profile }), stateText(st, turn)].filter(Boolean).join('\n');
  const spans = Object.keys(drawFromCriteria(messages) || {}).filter((k) => k !== 'none').slice(0, MAX_BOOK_SPANS);
  if (!apiKey || !state.trim()) return null;
  const t0 = Date.now();
  const call = await jevCall('strategy', async (signal) => {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state, questions: {
        strategy: { type: 'choice', instructions: 'What does the LATEST user message, read in the context of the thread, ask the assistant to do? A message whose meaning depends on the previous reply (what it said or linked: "the second one", "what are the actual words?", "who wrote that?", "what do you make of it?") is judged by what it asks of that reply, never by its surface words; when no strategy is for what it asks, choose unmatched. "Compare" is a comparison only when traditions or scriptures are to be set side by side.', criteria: opts },
        ...(messages.some((m) => m.role === 'assistant') ? { refers_back: { type: 'choice', instructions: 'Does the LATEST user message take its subject from the previous turn or reply ("that", "it", "the second one", "the actual words", "how does that compare with …", "who wrote it") rather than state its own subject?', criteria: REFERS } } : {}),
        ...Object.fromEntries(SIDE_KEYS.map((k, i) => [k, { type: 'choice', instructions: `If the latest message compares or asks about several traditions, which is the ${ORD[i]} tradition it names or means? Otherwise "none".${LANGUAGE_IS_NOT_A_TRADITION}`, criteria: SIDES }])),
        ...Object.fromEntries(spans.map((n, i) => [`book_${i + 1}`, { type: 'choice', instructions: bookAsk(n), criteria: SIDES }])),
        ...Object.fromEntries(spans.map((n, i) => [`kind_${i + 1}`, { type: 'choice', instructions: kindAsk(n), criteria: KINDS }])),
        ...Object.fromEntries(spans.flatMap((n, i) => { const o = titleOptions(n); return o ? [[`title_${i + 1}`, { type: 'choice', instructions: titleAsk(n), criteria: o }]] : []; })),
        subject_religion: { type: 'choice', instructions: SUBJECT_ASK, criteria: SIDES },
        work_place: { type: 'choice', instructions: 'Does the LATEST user message ask to read a particular place in a work (a book, tablet, chapter or commentary named now or in the thread)? Which place?', criteria: WORK_PLACE },
        ...patchQuestions(st, TRADITIONS, turn),
      } }),
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()).answers || {};
  }, { timeoutMs, budgetMs, onJev });
  const a = call.value;
  if (!a) return null;
  {
    const ms = Date.now() - t0;
    const raw = choice(a.strategy) || { choice: null, confidence: 0, distribution: null };
    const confident = raw.choice && opts[raw.choice] && (raw.confidence ?? 0) >= min;
    let strategy = confident ? raw : { ...raw, choice: UNMATCHED, was: raw.choice ?? null, reason: raw.choice ? 'low-confidence' : 'no-answer' };
    // the state patch (ONE call, no extra Jev round trip): schema-validated, below-confidence answers = unchanged
    const jevPatch = patchFromAnswers(a, { min, st });
    // "what about in Islam?": Jev says the message continues the previous request with a changed detail → the previous turn's strategy
    const lastStrategy = st.thread?.at(-1)?.strategy;
    if (jevPatch.continues && lastStrategy && opts[lastStrategy] && lastStrategy !== strategy.choice) strategy = { ...strategy, was: strategy.choice ?? null, choice: lastStrategy, reason: 'continues-previous' };
    const sideAnswers = SIDE_KEYS.map((k) => choice(a[k])).filter(Boolean);
    const sides = [...new Set(sideAnswers.filter((s) => s.choice && s.choice !== 'none' && SIDES[s.choice] && (s.confidence ?? 0) >= min).map((s) => s.choice))];
    // each side's book: the span Jev called that side's book, most confident first
    const books = spans.map((n, i) => ({ name: n, ...choice(a[`book_${i + 1}`]) })).filter((b) => b.choice && sides.includes(b.choice) && (b.confidence ?? 0) >= min)
      .sort((x, y) => (y.confidence ?? 0) - (x.confidence ?? 0));
    const sources = {};
    for (const b of books) if (!sources[b.choice]) sources[b.choice] = b.name;
    const decisions = [
      { point: 'strategy', by: 'jev', saw: state, options: Object.keys(opts), probabilities: jevProbabilities(raw), chosen: strategy.choice, reason: strategy.reason ?? null, ms },
      ...(strategy.choice === 'comparison' ? [{ point: 'sides', by: 'jev', saw: state, options: Object.keys(SIDES), probabilities: Object.fromEntries(sideAnswers.map((s, i) => [SIDE_KEYS[i], jevProbabilities(s)])), chosen: sides, reason: sides.length < 2 ? 'fewer than two sides — executor widens' : null, ms },
        ...(spans.length ? [{ point: 'side-books', by: 'jev', saw: spans, options: Object.keys(SIDES), probabilities: Object.fromEntries(spans.map((n, i) => [n, jevProbabilities(choice(a[`book_${i + 1}`]) || {})])), chosen: sources, reason: null, ms }] : [])] : []),
    ];
    // the tradition the question is about = a hard filter for THIS turn (never on a comparison: its sides carry the traditions), unless the reader set a scope (scope_religion) or already has one in the conversation
    const subj = choice(a.subject_religion), subjectOn = strategy.choice !== 'comparison' && subj?.choice && subj.choice !== 'none' && SIDES[subj.choice] && (subj.confidence ?? 0) >= Math.max(min, SUBJECT_FILTER_MIN) && !jevPatch.patch.scope?.religions_specified && !jevPatch.turnOnly;
    const turnOnly = subjectOn ? { scope: { religions_specified: [subj.choice] } } : jevPatch.turnOnly;
    const units = namedUnits(a, spans, messages.filter((m) => m.role === 'user').at(-1)?.content || '', min);
    const wp = choice(a.work_place);
    if (wp?.choice && WORK_PLACE[wp.choice] && wp.choice !== 'none' && (wp.confidence ?? 0) >= min) units.work_place = wp.choice;
    // "and the next paragraph?" continues the last READING in the thread (a strategy whose tree reads places in a work), never a fresh
    // research turn on the bare words (11-12: after "what is the Báb saying?" it went to understanding and claimed absence)
    const lastStrat = [...(st.thread || [])].reverse().find((e) => PLACE_READERS.has(e.strategy))?.strategy ?? st.thread?.at(-1)?.strategy;
    if (units.work_place === 'next' && lastStrat && opts[lastStrat] && lastStrat !== strategy.choice) {
      strategy = { ...strategy, was: strategy.choice ?? null, choice: lastStrat, reason: 'next-in-work' };
      decisions[0] = { ...decisions[0], chosen: strategy.choice, reason: strategy.reason };
    }
    // the message is ONLY a work's name (Jev's own kind answer: a work, nothing else asked) → the book, never Unmatched: Jev's
    // below-confidence book/about pick stands, any other pick becomes book (Chad 11-09: "God Passes By" fell to Unmatched, was read as a
    // quotation and ran slow research — "how could a quoted title of one of the core books not match the book? Even in unmatched fallback")
    const workOnly = units.named_work && !units.named_person && !units.topic;
    if (workOnly && isUnmatched(strategy.choice) && (opts.book || opts.about)) {
      const pick = ['book', 'about'].includes(strategy.was) && opts[strategy.was] ? strategy.was : opts.book ? 'book' : 'about';
      strategy = { ...raw, choice: pick, was: raw.choice ?? null, reason: 'named-work-only' };
      decisions[0] = { ...decisions[0], chosen: strategy.choice, reason: strategy.reason };
    }
    if (subjectOn) decisions.push({ point: 'subject-religion', by: 'jev', saw: state, options: Object.keys(SIDES), probabilities: jevProbabilities(subj), chosen: subj.choice, reason: 'a hard filter for this turn', ms });
    else if (subj?.choice && subj.choice !== 'none' && SIDES[subj.choice] && strategy.choice !== 'comparison') decisions.push({ point: 'subject-religion', by: 'jev', saw: state, options: Object.keys(SIDES), probabilities: jevProbabilities(subj), chosen: null, reason: turnOnly ? 'already scoped this turn by the state patch' : 'not sure enough to filter — every tradition stays in', ms });
    // recorded even when empty: a strategy that runs with no units is diagnosable only from Jev's kind answers (11-11 Vaḥíd)
    if (spans.length) decisions.push({ point: 'named-units', by: 'jev', saw: spans, options: Object.keys(KINDS), probabilities: Object.fromEntries(spans.map((n, i) => [n, jevProbabilities(choice(a[`kind_${i + 1}`]) || {})])), chosen: units, reason: Object.keys(units).length ? null : 'no unit at confidence', ms });
    const patch = { jev: jevPatch.patch, turnOnly, continues: jevPatch.continues, offer: jevPatch.offer };
    if (Object.keys(patch.jev).length || patch.turnOnly || patch.continues || patch.offer) decisions.push({ point: 'state-patch', by: 'jev', saw: state, options: ['unchanged', 'patch'], chosen: 'patch', reason: JSON.stringify({ ...patch.jev, ...(patch.turnOnly ? { turn_only: patch.turnOnly } : {}), ...(patch.continues ? { continues: lastStrategy } : {}), ...(patch.offer ? { offer: patch.offer } : {}) }).slice(0, 400), ms });
    // the message takes its subject from the last turn (Jev's answer): the tree searches the last turn's topic and anchors on its passages (units.js last_topic / last_passages)
    const rb = choice(a.refers_back), refersBack = ['previous', 'subject'].includes(rb?.choice) && (rb.confidence ?? 0) >= min, aboutReply = refersBack && rb.choice === 'previous';
    if (rb?.choice) decisions.push({ point: 'refers-back', by: 'jev', saw: state, options: Object.keys(REFERS), probabilities: jevProbabilities(rb), chosen: refersBack ? rb.choice : 'own', reason: aboutReply ? 'about the last reply and its passages' : refersBack ? 'subject from the last turn' : null, ms });
    return { strategy, sides, sources, units, ms, decisions, patch, ...(refersBack ? { refersBack: true } : {}), ...(aboutReply ? { aboutReply: true } : {}) };
  }
}

/** Is there a strategy for code to execute? Pure. */
export const strategyOf = (s) => (s?.strategy?.choice && !isUnmatched(s.strategy.choice) ? s.strategy.choice : null);
