// Follow-up pills (Chad 11-12): after a live reply, a fast model offers 2–3 short questions the reader may ask next, on the SAME
// subject — tapped, a pill is sent as the next message. Best effort: any failure or timeout → no pills. Core is pure (followups-core.js, also the edge Worker's). Deps: model-roles, ai.js.
import { modelFor } from '../model-roles.js';
import { followupsWith } from './followups-core.js';
export { cleanFollowups } from './followups-core.js';

export const followups = (question, reply, { complete = null, timeoutMs = 4000 } = {}) => followupsWith(
  complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('anis-followups'), temperature: 0.3, maxTokens: 160, thinking: false, caller: 'anis-followups' })),
  question, reply, { timeoutMs });
