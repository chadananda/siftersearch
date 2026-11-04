// Variant registry for the Jev tuning harness (ops.mjs jev-try). A variant is DATA: an id + params, applied to a logged
// call's state/questions before Jev is re-asked. apply({state, questions, row, params, deps}) → { state, questions } (async,
// pure of side effects; deps.history(row, turns) → text supplies conversation context). A winner ships as a change to that
// gate's state builder — the registry never reaches the reply path. Add an enricher = add an entry here.
const clone = (x) => JSON.parse(JSON.stringify(x ?? {}));
const eachQuestion = (questions, only, fn) => { const q = clone(questions); for (const [name, d] of Object.entries(q)) if (!only || only === name) fn(d, name); return q; };

export const VARIANTS = {
  baseline: { describe: 'unchanged (the control)', apply: ({ state, questions }) => ({ state, questions }) },
  'state-append': { describe: 'add text after the state. params: {text}', apply: ({ state, questions, params }) => ({ state: `${state}\n\n${params.text}`, questions }) },
  'state-prepend': { describe: 'add text before the state. params: {text}', apply: ({ state, questions, params }) => ({ state: `${params.text}\n\n${state}`, questions }) },
  'question-note': { describe: 'append to a question\'s instructions (all questions, or params.question). params: {text, question?}',
    apply: ({ state, questions, params }) => ({ state, questions: eachQuestion(questions, params.question, (d) => { d.instructions = `${d.instructions || ''} ${params.text}`.trim(); }) }) },
  'option-text': { describe: 'replace one option\'s description. params: {option, text, question?}',
    apply: ({ state, questions, params }) => ({ state, questions: eachQuestion(questions, params.question, (d) => { if (d.criteria && params.option in d.criteria) d.criteria[params.option] = params.text; }) }) },
  'thread-history': { describe: 'add the last N earlier turns of the conversation. params: {turns: 4}',
    async apply({ state, questions, row, params, deps }) {
      const h = await deps.history?.(row, Number(params.turns) || 4);
      return { state: h ? `${state}\n\nEARLIER IN THIS CONVERSATION:\n${h}` : state, questions, skipped: !h };
    } },
};

/** variant spec ('id' | {id, params}) → { id, params, apply }. Throws with the list when unknown. */
export function resolveVariant(spec) {
  const id = typeof spec === 'string' ? spec : spec?.id, v = VARIANTS[id];
  if (!v) throw new Error(`unknown variant "${id}" (have: ${Object.keys(VARIANTS).join(', ')})`);
  return { id, params: (typeof spec === 'object' && spec.params) || {}, apply: v.apply };
}
