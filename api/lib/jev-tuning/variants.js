// Variant registry for the Jev tuning harness (ops.mjs jev-try). A variant is DATA: an id + params, applied to a logged
// call's state/questions before Jev is re-asked. apply({state, questions, row, params, deps}) → { state, questions } (async,
// pure of side effects; deps.history(row, turns) → text supplies conversation context). A winner ships as a change to that
// gate's state builder, or as a decision step's params.enrich (enrich.js, applied by graph.js → systemone). Add an enricher = add an entry here.
const clone = (x) => JSON.parse(JSON.stringify(x ?? {}));
const eachQuestion = (questions, only, fn) => { const q = clone(questions); for (const [name, d] of Object.entries(q)) if (!only || only === name) fn(d, name); return q; };

export const VARIANTS = {
  baseline: { describe: 'unchanged (the control)', apply: ({ state, questions }) => ({ state, questions }) },
  // same call, another System-1 model (Cloudflare Workers AI Clef): agreement with Jev + latency, before a gate is routed to it
  backend: { describe: 'the same call on another backend. params: {model: "clef-flash"|"clef"}',
    apply: ({ state, questions, params }) => ({ state, questions, backend: params.model || 'clef-flash' }) },
  'state-append': { describe: 'add text after the state. params: {text}', apply: ({ state, questions, params }) => ({ state: `${state}\n\n${params.text}`, questions }) },
  'state-prepend': { describe: 'add text before the state. params: {text}', apply: ({ state, questions, params }) => ({ state: `${params.text}\n\n${state}`, questions }) },
  'question-note': { describe: 'append to a question\'s instructions (all questions, or params.question). params: {text, question?}',
    apply: ({ state, questions, params }) => ({ state, questions: eachQuestion(questions, params.question, (d) => { d.instructions = `${d.instructions || ''} ${params.text}`.trim(); }) }) },
  'option-text': { describe: 'replace one option\'s description. params: {option, text, question?}',
    apply: ({ state, questions, params }) => ({ state, questions: eachQuestion(questions, params.question, (d) => { if (d.criteria && params.option in d.criteria) d.criteria[params.option] = params.text; }) }) },
  // a CANDIDATE strategy's option added (or an existing option's text replaced) on the strategy question, the last option ('unmatched') kept last
  'add-option': { describe: 'add/replace one option on a question, before the last option. params: {question, option, text}',
    apply: ({ state, questions, params }) => ({ state, questions: eachQuestion(questions, params.question, (d) => {
      if (!d.criteria) return;
      if (params.option in d.criteria) { d.criteria[params.option] = params.text; return; }
      const keys = Object.keys(d.criteria), last = keys.pop();
      d.criteria = Object.fromEntries([...keys.map((k) => [k, d.criteria[k]]), [params.option, params.text], ...(last ? [[last, d.criteria[last]]] : [])]);
    }) }) },
  'thread-history': { describe: 'add the last N earlier turns of the conversation. params: {turns: 4}',
    async apply({ state, questions, row, params, deps }) {
      const h = await deps.history?.(row, Number(params.turns) || 4);
      return { state: h ? `${state}\n\nEARLIER IN THIS CONVERSATION:\n${h}` : state, questions, skipped: !h };
    } },
  // a WORDING theory: a question's instructions and/or option descriptions replaced (the diagnosis's 'reword'); ships as params.enrich
  reword: { describe: 'replace a question\'s instructions and/or option descriptions. params: {question?, instructions?, options?: {option: text}}',
    apply: ({ state, questions, params }) => ({ state, questions: eachQuestion(questions, params.question, (d) => {
      if (params.instructions) d.instructions = params.instructions;
      for (const [o, t] of Object.entries(params.options || {})) if (d.criteria && o in d.criteria) d.criteria[o] = t;
    }) }) },
};

/** variant spec ('id' | {id, params}) → { id, params, apply }. Throws with the list when unknown. */
export function resolveVariant(spec) {
  const id = typeof spec === 'string' ? spec : spec?.id, v = VARIANTS[id];
  if (!v) throw new Error(`unknown variant "${id}" (have: ${Object.keys(VARIANTS).join(', ')})`);
  return { id, params: (typeof spec === 'object' && spec.params) || {}, apply: v.apply };
}
