// Decision points of one Anís turn (W3): at each point what was seen, the options, the probabilities, the branch taken and by
// whom (jev | code). turn.js finish() stores the list as path.plan.decisions (closeExchange → chat_messages.path_json). Pure.
const clip = (v, n = 300) => (typeof v === 'string' && v.length > n ? `${v.slice(0, n)}…` : v);

export function decisionLog(initial = []) {
  const list = [...initial];
  /** point: 'strategy' | 'sides' | 'coverage:Buddhist' | 'occasion' | 'reference' … */
  const record = (point, { by = 'code', saw = null, options = null, probabilities = null, chosen = null, reason = null, ms = null } = {}) => {
    const d = { point, by, saw: clip(saw), options, probabilities, chosen, reason, ms };
    list.push(d);
    return d;
  };
  return { record, list: () => list.slice(), size: () => list.length };
}

/** A Jev answer ({choice, confidence, distribution} or {noul}) → the probabilities a decision records. Pure. */
export const jevProbabilities = (a) => {
  if (!a) return null;
  if (a.distribution && typeof a.distribution === 'object') return a.distribution;
  if (a.choice != null) return { [a.choice]: a.confidence ?? null };
  if (typeof a.noul === 'number') return { yes: a.noul, no: +(1 - a.noul).toFixed(3) };
  return null;
};

export const NO_LOG = { record: () => null, list: () => [], size: () => 0 };
