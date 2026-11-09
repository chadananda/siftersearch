// Param CONTRACT of the strategy elements: the TYPE/ENUM of each param VALUE, checked when a strategy is saved (strategy-design, planner, fix) so a planner
// that writes `thin_below: 3` or `shared: [..]` is told why and re-plans. Also the mechanical repair (repairParams / repairTemplate) of the same classes.
// Pure; deps: units.js (slot names). Rank keys = elements.js COMPARE (a test pins them).
import { UNITS } from '../units.js';

export const AUTH_KINDS = Object.freeze(['scripture', 'guardian', 'interpretation', 'guidance', 'law', 'prayer', 'history', 'scholarship']);
export const RANK_BY = Object.freeze(['authority', 'standing', 'date', 'history', 'score', 'length', 'marked', 'occasion', 'audience', 'named', 'attributed', 'copy']);
// slots a param or template may name: registry units, what elements write onto the units, and what the writer adds
export const PARAM_SLOTS = Object.freeze([...Object.keys(UNITS), 'found_passages', 'found_records', 'web_found', 'missing', 'path', 'defects', 'offers', 'value', 'base']);
export const TEMPLATE_SLOTS = Object.freeze([...PARAM_SLOTS, 'scope_clause', 'widened_clause', 'missing_sides', 'missing_line', 'authority_order']);   // authority_order: the writer fills it (tradition-authority)
const SINGLE = /(?<!\{)\{(\w+)\}(?!\})/g, DOUBLE = /\{\{(\w+)\}\}/g;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const strs = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.trim());
const kinds = (v) => [v].flat().every((x) => AUTH_KINDS.includes(x));
const BOOL = ['doctrinal', 'wide', 'quoted', 'by_person', 'in_named', 'spell', 'inside', 'dedupe'];

/** param name → check(value, activity) → true | the reason it is wrong. */
const RULES = {
  thin_below: (v) => (isNum(v) && v > 0 && v <= 1) || 'must be a number in (0, 1]: scores run 0-1 (omit it for the default 0.25)',
  min: (v) => (isNum(v) && v >= 0) || 'must be a number >= 0',
  n: (v) => (Number.isInteger(v) && v > 0) || 'must be a whole number > 0 (how many sub-themes / criteria / entries the light generator plans)',
  k: (v) => (isNum(v) && v > 0) || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => isNum(x) && x > 0)) || 'must be a positive number (or {default, many, research} of them)',
  authority: (v) => (v != null && (Array.isArray(v) ? v.length > 0 : true) && kinds(v)) || `must be one of ${AUTH_KINDS.join('|')} (or a list of them)`,
  shared: (v) => (typeof v === 'string' && !!v.trim()) || 'must be ONE template id (a string), not a list',
  template: (v) => (typeof v === 'string' && !!v.trim()) || 'must be a template id (a string)',
  how: (v) => (typeof v === 'string' && !!v.trim()) || 'must be a template id (a string)',
  tradition: (v) => (typeof v === 'string' && !!v.trim() && !v.includes('{{')) || 'must be a tradition name, never a {{slot}} (the turn\'s scope already filters by tradition)',
  layers: (v) => strs(v) || 'must be a list of layer names, e.g. ["literal","phrase"]',
  tiers: (v) => strs(v) || 'must be a list of tier names',
  per: (v, a) => a !== 'rank' || [v].flat().length > 0 && [v].flat().every((x) => typeof x === 'string' && !!x.trim()) || 'rank per must be a FIELD NAME or a list of them (k for each value); a number is not a per-group count - use k for a total',
  by: (v, a) => a !== 'rank' || ([v].flat().length > 0 && [v].flat().every((x) => RANK_BY.includes(x))) || `rank by must be ${RANK_BY.join('|')} (or a list)`,
  ...Object.fromEntries(BOOL.map((n) => [n, (v) => typeof v === 'boolean' || 'must be true or false'])),
};
// the light generators (elements.js plan.*): one per planned unit, the same cheap tier and contract (params n, stage; default = the subject itself)
export const GENERATORS = Object.freeze({ 'plan.subthemes': 'sub_themes', 'plan.criteria': 'criteria', 'plan.entries': 'entries' });
const ITEM_KEYS = ['element', 'params'];

/** Contract problems of one step's params. → [string]. acts = the registry (nested list/inner elements), slots = extra known slot names. */
export function paramProblems(activity, params, { acts = null, slots = [] } = {}) {
  const out = [], known = new Set([...PARAM_SLOTS, ...slots]);
  for (const [k, v] of Object.entries(params || {})) {
    const r = RULES[k]?.(v, activity);
    if (r !== undefined && r !== true) out.push(`param "${k}" ${r}`);
  }
  const item = (it, where) => {
    if (!it || typeof it !== 'object' || typeof it.element !== 'string') { out.push(`${where}: needs {element, params}`); return; }
    const stray = Object.keys(it).filter((x) => !ITEM_KEYS.includes(x));
    if (stray.length) out.push(`${where} (${it.element}): ${stray.join(', ')} must go inside "params", not beside "element"`);
    if (acts && !acts[it.element]) out.push(`${where}: unknown element ${it.element}`);
    else out.push(...paramProblems(it.element, it.params, { acts, slots }).map((m) => `${where} (${it.element}): ${m}`));
  };
  if (activity === 'search.together') { if (!Array.isArray(params?.list)) out.push('param "list" must be a list of {element, params}'); else params.list.forEach((it, i) => item(it, `list[${i}]`)); }
  if (activity === 'search.fanout' && params?.inner) item(params.inner, 'inner');
  const walk = (v, key) => {
    if (typeof v === 'string') {
      for (const [, w] of v.matchAll(SINGLE)) out.push(`param "${key}" has {${w}}: a unit slot is written {{${w}}}`);
      for (const [, w] of v.matchAll(DOUBLE)) if (!known.has(w)) out.push(`param "${key}" slot {{${w}}} is not a unit`);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(params, '');
  return [...new Set(out)];
}

/** Contract problems of one template's text. shared = a shared tpl.<shape> that wraps the strategy's own text as {{base}}. */
export function templateProblems(text, { shared = false, slots = [] } = {}) {
  const out = [], known = new Set([...TEMPLATE_SLOTS, ...slots]), t = String(text ?? '');
  for (const [, w] of t.matchAll(SINGLE)) out.push(known.has(w) ? `has {${w}}: a unit slot is written {{${w}}}` : `has {${w}}: single braces are read literally - write a placeholder for the writer as [${w}]`);
  for (const [, w] of t.matchAll(DOUBLE)) if (!known.has(w)) out.push(`slot {{${w}}} is not a unit the writer fills (it would be blank)`);
  if (shared && !t.includes('{{base}}')) out.push('is a shared template but has no {{base}}: the strategy\'s own instruction would be dropped');
  return [...new Set(out)];
}

// ── mechanical repair: behaviour-preserving where the old value was ignored or always-wrong, never a guess at intent ──
const SLOT = /(?<!\{)\{(\w+)\}(?!\})/g;
/** params → the same with contract violations repaired (invalid values dropped = the element's default; strays moved under params; shared list → first). Pure. */
export function repairParams(activity, params) {
  const p = { ...(params || {}) };
  for (const [k, v] of Object.entries(p)) {
    if (k === 'shared' && Array.isArray(v) && typeof v[0] === 'string') p.shared = v[0];
    else if (k === 'per' && activity === 'rank' && isNum(v)) delete p.per;
    else if (k === 'by' && activity === 'rank') { const by = [v].flat().map((x) => (x === 'relevance' ? 'score' : x)).filter((x) => RANK_BY.includes(x)); if (by.length) p.by = Array.isArray(v) ? by : by[0]; else delete p.by; }
    else if (k === 'tradition' && typeof v === 'string' && v.includes('{{')) delete p.tradition;
    else if (RULES[k] && RULES[k](v, activity) !== true && !['shared', 'template', 'how', 'min', 'k'].includes(k) && !BOOL.includes(k)) delete p[k];
    else if (k === 'min' && RULES.min(v) !== true) delete p.min;
  }
  const fixItem = (it) => {
    if (!it || typeof it !== 'object' || typeof it.element !== 'string') return it;
    const { element, params: inner = {}, ...stray } = it;
    return { element, params: repairParams(element, { ...stray, ...inner }) };
  };
  if (activity === 'search.together' && Array.isArray(p.list)) p.list = p.list.map(fixItem);
  if (activity === 'search.fanout' && p.inner) p.inner = fixItem(p.inner);
  return p;
}
/** template text → `{unit}` becomes {{unit}}; any other `{word}` is a placeholder for the writer to fill in (doubling it would blank it), so it becomes [word];
 *  a shared template without {{base}} gets it first. Pure. */
export const repairTemplate = (text, { shared = false } = {}) => {
  let t = String(text ?? '').replace(SLOT, (_, w) => (TEMPLATE_SLOTS.includes(w) ? `{{${w}}}` : `[${w}]`));
  if (shared && !t.includes('{{base}}')) t = `{{base}}\n\n${t}`;
  return t;
};
