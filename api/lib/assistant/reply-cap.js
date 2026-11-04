// The token ceiling for every Anís reply a reader receives: a SAFETY STOP against a runaway generation, never a length control
// (length is the prompt's job — channels.js DEPTH_FRAME, the format's how). Chad 11-04: "do not artificially cut off the length
// of Anis messages … Truncation does not save us tokens since the answer is already generated." Deps: model-registry, model-roles.
import { getModel } from '../model-registry.js';
import { modelFor } from '../model-roles.js';

// 16,000 tokens ≈ 12,000 words — far past any reply, so only a broken generation ever reaches it
export const REPLY_CEILING = 16000;

/** The ceiling for `model`: its real output limit (registry maxOutput) when lower, else REPLY_CEILING. Pure. */
export function replyCap(model) {
  const max = getModel(model)?.maxOutput;
  return Math.min(max > 0 ? max : REPLY_CEILING, REPLY_CEILING);
}

/** replyCap for a model role (model-roles.js), e.g. 'anis-agent'. */
export const roleReplyCap = (role) => replyCap(modelFor(role)?.model);
