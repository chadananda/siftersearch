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

export const STRATEGIES = {
  comparison: 'asks how TWO OR MORE religions, scriptures or traditions each treat, teach or differ on something — side by side ("Buddhism and Christianity on forgiveness", "does the Qur’án agree with the Gospels about…", "what do the world religions say about the soul")',
  understanding: 'wants to understand a teaching, concept, practice or passage in depth within ONE tradition — its meaning, the scripture behind it and how it has been explained ("help me understand progressive revelation", "what the Bahá’í writings teach about the soul after death")',
  prayer: 'wants a PRAYER to say — for an occasion, need or person (healing, the departed, protection, children, marriage, unity, morning, evening, the Fast, tests) or a particular prayer by name or opening words',
  guidance: 'asks what the Universal House of Justice (the Bahá’í world body) has said, says now or has decided on a matter — present-day guidance, letters, messages, policy, elections, institutions',
  reference: 'gives a chapter-and-verse or numbered scripture reference and wants THAT passage: "John 3:16", "Qur’án 2:255", "Sura 24", "Bhagavad Gita chapter 2", "Psalm 23", "Matthew 5", "Isaiah 11:6"',
  other: 'none of these: a quote to find, a book or person to look up, a fact or date, a word’s meaning, a greeting, conversation, or a general question',
};
const SIDES = { ...Object.fromEntries(Object.entries(TRADITIONS).filter(([k]) => k !== 'none')), none: 'no such tradition in the question' };
const SIDE_KEYS = ['side_a', 'side_b', 'side_c'];
const ORD = ['FIRST', 'SECOND', 'THIRD'];

const choice = (a) => a && { choice: a.choice ?? a.value ?? null, confidence: a.confidence ?? a.distribution?.[a.choice ?? a.value] ?? null, distribution: a.distribution ?? null };

/** The thread as Jev sees it (last turns, clipped). Pure. */
export const stateOf = (messages = [], { profile = {} } = {}) => {
  const lines = messages.slice(-4).map((m) => `${m.role}: ${String(m.content || '').slice(0, 800)}`);
  if (profile.default_tradition) lines.unshift(`reader: usually asks about ${profile.default_tradition}`);
  return lines.join('\n');
};

/**
 * @returns {Promise<null | { strategy: {choice, confidence, distribution}, sides: string[], ms, decisions: object[] }>}
 *   strategy.choice ∈ STRATEGIES; low confidence → 'other' (fail open: the ordinary pipeline). sides: traditions, in order, for a comparison.
 */
export async function chooseStrategy(messages, { profile = {}, apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = jevFetch('anis-strategy'), timeoutMs = JEV_LIMITS.strategy.timeoutMs,
  budgetMs = Math.max(timeoutMs, JEV_LIMITS.strategy.budgetMs), onJev = null, min = MIN_CONFIDENCE } = {}) {
  const state = stateOf(messages, { profile });
  if (!apiKey || !state.trim()) return null;
  const t0 = Date.now();
  const call = await jevCall('strategy', async (signal) => {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelFor('assistant-triage').model, state, questions: {
        strategy: { type: 'choice', instructions: 'What does the LATEST user message, read in the context of the thread, ask the assistant to do?', criteria: STRATEGIES },
        ...Object.fromEntries(SIDE_KEYS.map((k, i) => [k, { type: 'choice', instructions: `If the latest message compares or asks about several traditions, which is the ${ORD[i]} tradition it names or means? Otherwise "none".`, criteria: SIDES }])),
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
    const confident = raw.choice && STRATEGIES[raw.choice] && (raw.confidence ?? 0) >= min;
    const strategy = confident ? raw : { ...raw, choice: 'other', was: raw.choice ?? null, reason: raw.choice ? 'low-confidence' : 'no-answer' };
    const sideAnswers = SIDE_KEYS.map((k) => choice(a[k])).filter(Boolean);
    const sides = [...new Set(sideAnswers.filter((s) => s.choice && s.choice !== 'none' && SIDES[s.choice] && (s.confidence ?? 0) >= min).map((s) => s.choice))];
    const decisions = [
      { point: 'strategy', by: 'jev', saw: state, options: Object.keys(STRATEGIES), probabilities: jevProbabilities(raw), chosen: strategy.choice, reason: strategy.reason ?? null, ms },
      ...(strategy.choice === 'comparison' ? [{ point: 'sides', by: 'jev', saw: state, options: Object.keys(SIDES), probabilities: Object.fromEntries(sideAnswers.map((s, i) => [SIDE_KEYS[i], jevProbabilities(s)])), chosen: sides, reason: sides.length < 2 ? 'fewer than two sides — executor widens' : null, ms }] : []),
    ];
    return { strategy, sides, ms, decisions };
  }
}

/** Is there a strategy for code to execute? Pure. */
export const strategyOf = (s) => (s?.strategy?.choice && s.strategy.choice !== 'other' ? s.strategy.choice : null);
