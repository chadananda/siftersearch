// Companion §10 — decision-engine dials + precedence. Every behavioral knob is an explicit, audited
// dial with a default, range, scope, and WHY — never hidden in a prompt. Resolution obeys a strict
// precedence so safety/consent/source constraints always beat preferences, which beat cohort/global,
// which beat experiments. Pure logic; storage/overrides live in the admin + user records. Testable.

// Seed dials (§10.3). type: 'range'|'enum'; scope hints where an override legitimately comes from.
export const SEED_DIALS = {
  relationship_mode: { type: 'enum', values: ['session', 'remembered', 'companion', 'study'], default: 'session', why: 'Explicit depth of relationship' },
  challenge_mode: { type: 'enum', values: ['answer-only', 'ask-first', 'contextual', 'direct'], default: 'ask-first', why: 'User controls whether assumptions are challenged' },
  challenge_intensity: { type: 'range', min: 0, max: 5, default: 2, why: 'Candor without coercion' },
  assumption_surface_rate: { type: 'range', min: 0, max: 0.75, default: 0.20, why: 'Avoid constant psychoanalysis' },
  socratic_rate: { type: 'range', min: 0, max: 0.75, default: 0.20, why: 'Questions must not evade answers' },
  candor: { type: 'range', min: 1, max: 5, default: 4, why: 'Prevent sycophancy' },
  warmth: { type: 'range', min: 1, max: 5, default: 3, why: 'Respect without manufactured intimacy' },
  directness: { type: 'range', min: 1, max: 5, default: 4, why: 'Answer first' },
  answer_depth: { type: 'range', min: 1, max: 5, default: 3, why: 'Match purpose/load' },
  source_density: { type: 'range', min: 1, max: 5, default: 4, why: 'Verifiability' },
  quote_density: { type: 'range', min: 0, max: 3, default: 1, why: 'Avoid quote dumps' },
  interfaith_breadth: { type: 'range', min: 0, max: 5, default: 2, why: 'Relevant alternatives only' },
  counterargument_strength: { type: 'range', min: 1, max: 5, default: 3, why: 'Fair challenge' },
  devotional_tone: { type: 'enum', values: ['off', 'contextual', 'invited'], default: 'off', why: 'Do not presume devotion' },
  course_invite_threshold: { type: 'range', min: 0, max: 1, default: 0.78, why: 'No premature funnel' },
  human_offer_threshold: { type: 'range', min: 0, max: 1, default: 0.85, why: 'Voluntary connection' },
  memory_depth: { type: 'enum', values: ['minimal', 'standard', 'extended'], default: 'minimal', why: 'Data minimization' },
  memory_offer_after_turns: { type: 'range', min: 1, max: 12, default: 3, why: 'Ask to remember only once the inquiry is real — never on a first question' },
  proactive_contacts_week: { type: 'range', min: 0, max: 3, default: 0, why: 'Return is not outreach consent' },
  followup_cooldown_hours: { type: 'range', min: 24, max: 336, default: 96, why: 'Avoid pursuit' },
  no_outreach_bias: { type: 'range', min: 0, max: 1, default: 0.70, why: 'Silence over weak contact' },
  grounding_threshold: { type: 'range', min: 0.70, max: 0.99, default: 0.90, why: 'High support for religious claims' },
  inference_confidence: { type: 'range', min: 0.60, max: 0.95, default: 0.80, why: 'Strong evidence before premise challenge' },
  conflict_threshold: { type: 'range', min: 0, max: 1, default: 0.25, why: 'Expose disputed sources' },
  support_fade_rate: { type: 'range', min: 0, max: 0.30, default: 0.10, why: 'Reward autonomy' },
  experiment_rate: { type: 'range', min: 0, max: 0.20, default: 0, why: 'Measure first (P0)' },
};

export const POLICY_VERSION = 'seek-1.0.0';

// Precedence (§10.2), highest wins: safety > consent/boundary > source > explicit preference >
// accessibility > adaptive participant > mode/cohort > global; experiments lowest.
export const PRECEDENCE = ['safety', 'consent', 'source', 'preference', 'accessibility', 'participant', 'cohort', 'global', 'experiment'];

const clampDial = (def, v) => {
  if (v == null) return null;
  if (def.type === 'enum') return def.values.includes(v) ? v : null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(def.min, Math.min(def.max, n));
};

/**
 * Resolve effective dial values. `layers` is an object keyed by precedence source, each a partial
 * dial map, e.g. { global:{candor:4}, preference:{challenge_mode:'direct'}, safety:{challenge_mode:'answer-only'} }.
 * Higher-precedence layers override lower ones per dial. Invalid values are ignored (fall through).
 * Returns { values, provenance } — provenance records which layer set each dial (for the audit/why).
 */
export function resolveDials(layers = {}) {
  const values = {};
  const provenance = {};
  for (const [key, def] of Object.entries(SEED_DIALS)) {
    values[key] = def.default;
    provenance[key] = 'default';
    // Walk precedence LOW→HIGH so higher layers overwrite.
    for (let i = PRECEDENCE.length - 1; i >= 0; i--) {
      const layer = layers[PRECEDENCE[i]];
      if (!layer || !(key in layer)) continue;
      const v = clampDial(def, layer[key]);
      if (v != null) { values[key] = v; provenance[key] = PRECEDENCE[i]; }
    }
  }
  return { values, provenance };
}

// Validate a single dial write (admin). Returns { ok, value } or { ok:false, error }.
export function validateDial(key, v) {
  const def = SEED_DIALS[key];
  if (!def) return { ok: false, error: `unknown dial: ${key}` };
  const cv = clampDial(def, v);
  if (cv == null) return { ok: false, error: `invalid value for ${key} (${def.type === 'enum' ? def.values.join('|') : `${def.min}..${def.max}`})` };
  return { ok: true, value: cv };
}
