// enrich — a decision step's params.enrich ([{variant, params, gate?}]) applied to a Jev call's state/questions on the REPLY path.
// graph.js opens ctx.jevEnrich {list, messages} around a node that carries enrich; systemone (ask, jevFetch) calls enrichCall()
// before the request. No enrich in the context → the call is untouched (one property read). An entry with `gate` only touches
// that task's calls. A failing enricher leaves the call as it was (never breaks a reply). Deps: variants.js, ai-context.
import { resolveVariant } from './variants.js';
import { currentAIContext } from '../ai-context.js';

/** The last `turns` earlier messages as "role: text" lines (thread-history's deps.history on the reply path). Pure. */
export const historyText = (messages = [], turns = 4) => {
  const prior = (Array.isArray(messages) ? messages : []).slice(0, -1).slice(-turns);
  return prior.map((m) => `${m.role}: ${String(m.content ?? '').slice(0, 600)}`).join('\n') || null;
};

/** Apply an enrich list to one call. → { state, questions, applied: [variant ids] }. */
export async function applyEnrich(task, state, questions, list = [], { messages = [] } = {}) {
  let cur = { state, questions };
  const applied = [];
  for (const e of list) {
    if (e?.gate && e.gate !== task) continue;
    try {
      const v = resolveVariant({ id: e.variant, params: e.params || {} });
      const deps = { history: (_row, turns) => historyText(messages, turns) };
      const out = await v.apply({ state: cur.state, questions: cur.questions, row: null, params: v.params, deps });
      if (out?.skipped) continue;
      cur = { state: out.state, questions: out.questions };
      applied.push(v.id);
    } catch { /* an enricher never breaks the call */ }
  }
  return { ...cur, applied };
}

/** The reply-path hook (systemone): the ambient enrich for `task`, else null (the caller sends the call unchanged). */
export async function enrichCall(task, state, questions) {
  const e = currentAIContext().jevEnrich;
  if (!e?.list?.length) return null;
  const r = await applyEnrich(task, state, questions, e.list, { messages: e.messages });
  return r.applied.length ? r : null;
}
