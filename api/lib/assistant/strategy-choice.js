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
const SIDE_KEYS = ['side_a', 'side_b', 'side_c'];
const ORD = ['FIRST', 'SECOND', 'THIRD'];
// the BOOKS a comparison names ("the Book of Mormon", "the Gospels", "the Torah"): each name span of the thread
// (drawFromCriteria: structure, not meaning) is put to Jev — is it a book to read for one side, and whose? The executor reads it.
const MAX_BOOK_SPANS = 4;
const bookAsk = (span) => `In the latest message, is "${span}" a particular BOOK or scripture to be read for one side of the comparison? If so, which tradition's book is it? Answer "none" when it names a tradition, a people, a person or anything other than a book.`;

// Early filters (Chad 11-09): what each name span IS (a work, a person, neither) and which tradition the question is about are Jev's answers in this SAME call
// (typed choices only); code resolves them — a span becomes named_work / named_person, the topic is the question minus those spans (a search phrase, not the whole question).
const KINDS = { work: 'a written WORK: a book, tablet, treatise or scripture (its title)', person: 'a PERSON or author whose own teaching or writing the reader asks about', neither: 'a concept, place, event, tradition or anything else' };
const kindAsk = (span) => `In the latest message, what does "${span}" name — a written work, a person whose own teaching or writing is asked about, or neither?`;
const SUBJECT_ASK = 'Does the latest message ask about the texts, teachers or teachings of one particular religion or tradition ("Buddhist anatta", "Sufi Rumi on fana", "Augustine on grace")? Choose it. "none" when it names no tradition.';
const FRAME = /^(?:according to|as (?:stated|explained|written|said) (?:in|by)|per|by|from|in|on)\s+/i;
const frameless = (n) => String(n).replace(FRAME, '').trim();
/** Jev's span kinds → { named_work, named_person, topic } (units for the tree's `request`). Pure. */
export function namedUnits(a = {}, spans = [], question = '', min = MIN_CONFIDENCE) {
  const kinds = spans.map((n, i) => ({ name: frameless(n), raw: n, ...choice(a[`kind_${i + 1}`]) })).filter((k) => k.name && ['work', 'person'].includes(k.choice) && (k.confidence ?? 0) >= min);
  const work = kinds.find((k) => k.choice === 'work'), person = kinds.find((k) => k.choice === 'person');
  const rest = kinds.reduce((q, k) => q.replace(k.raw, '\u0000'), String(question)).replace(/(?:\b(?:according to|as (?:stated|explained|written|said) (?:in|by)|in|from|by|on|per)\s+)?\u0000[\s,;:'"’‘“”()-]*/gi, ' ').replace(/\s+/g, ' ').trim();
  return { ...(work ? { named_work: work.name } : {}), ...(person ? { named_person: person.name } : {}), ...(kinds.length && rest.split(' ').length >= 2 ? { topic: rest } : {}) };
}

const choice = (a) => a && { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null };

/** The thread as Jev sees it (last turns, clipped). Pure. */
export const stateOf = (messages = [], { profile = {} } = {}) => {
  const lines = messages.slice(-4).map((m) => `${m.role}: ${String(m.content || '').slice(0, 800)}`);
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
        strategy: { type: 'choice', instructions: 'What does the LATEST user message, read in the context of the thread, ask the assistant to do?', criteria: opts },
        ...Object.fromEntries(SIDE_KEYS.map((k, i) => [k, { type: 'choice', instructions: `If the latest message compares or asks about several traditions, which is the ${ORD[i]} tradition it names or means? Otherwise "none".`, criteria: SIDES }])),
        ...Object.fromEntries(spans.map((n, i) => [`book_${i + 1}`, { type: 'choice', instructions: bookAsk(n), criteria: SIDES }])),
        ...Object.fromEntries(spans.map((n, i) => [`kind_${i + 1}`, { type: 'choice', instructions: kindAsk(n), criteria: KINDS }])),
        subject_religion: { type: 'choice', instructions: SUBJECT_ASK, criteria: SIDES },
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
    const subj = choice(a.subject_religion), subjectOn = strategy.choice !== 'comparison' && subj?.choice && subj.choice !== 'none' && SIDES[subj.choice] && (subj.confidence ?? 0) >= min && !jevPatch.patch.scope?.religions_specified && !jevPatch.turnOnly;
    const turnOnly = subjectOn ? { scope: { religions_specified: [subj.choice] } } : jevPatch.turnOnly;
    const units = namedUnits(a, spans, messages.filter((m) => m.role === 'user').at(-1)?.content || '', min);
    if (subjectOn) decisions.push({ point: 'subject-religion', by: 'jev', saw: state, options: Object.keys(SIDES), probabilities: jevProbabilities(subj), chosen: subj.choice, reason: 'a hard filter for this turn', ms });
    if (Object.keys(units).length) decisions.push({ point: 'named-units', by: 'jev', saw: spans, options: Object.keys(KINDS), chosen: units, reason: null, ms });
    const patch = { jev: jevPatch.patch, turnOnly, continues: jevPatch.continues, offer: jevPatch.offer };
    if (Object.keys(patch.jev).length || patch.turnOnly || patch.continues || patch.offer) decisions.push({ point: 'state-patch', by: 'jev', saw: state, options: ['unchanged', 'patch'], chosen: 'patch', reason: JSON.stringify({ ...patch.jev, ...(patch.turnOnly ? { turn_only: patch.turnOnly } : {}), ...(patch.continues ? { continues: lastStrategy } : {}), ...(patch.offer ? { offer: patch.offer } : {}) }).slice(0, 400), ms });
    return { strategy, sides, sources, units, ms, decisions, patch };
  }
}

/** Is there a strategy for code to execute? Pure. */
export const strategyOf = (s) => (s?.strategy?.choice && !isUnmatched(s.strategy.choice) ? s.strategy.choice : null);
