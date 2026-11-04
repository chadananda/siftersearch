// Writer-instruction templates from the strategy catalog (strategies-repo): template(id) = the latest version's text,
// fill(text, slots) = one regex pass over {{slot}}: a slot given is String()ed as a template literal would, one not given → ''.
// Code keeps the slot logic; the words are data.
import { catalog } from '../../repos/strategies-repo.js';
import { currentAIContext } from '../../ai-context.js';

export const template = (id, version) => {
  const pin = currentAIContext().strategyPin;   // a dry run of a candidate (strategy-try.js) reads the store's fresh rows first
  const t = (pin && (version != null ? pin.templates?.get(`${id}@${version}`) : pin.templatesLatest?.get(id)))
    || (version != null ? catalog().templates.byKey.get(`${id}@${version}`) : catalog().templates.latest.get(id));
  if (!t) throw new Error(`strategy template missing: ${id}${version != null ? `@${version}` : ''}`);
  return t.text;
};
export const fill = (text, slots = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in slots ? String(slots[k]) : ''));
export const render = (id, slots) => fill(template(id), slots);
