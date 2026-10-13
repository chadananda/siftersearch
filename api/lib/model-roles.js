// WHICH model does WHICH job — the ONE table (Chad 10-11: "when we use llms in search strategies, we need to periodically
// re-assess what models are targeted to use better, faster, cheaper newer models like haiku 5.5"). Call sites ask
// modelFor('<role>') instead of naming a model; scripts/ops/model-review.mjs reads this table monthly and flags roles whose
// model is deprecated, overdue for review, or beaten by a newer/cheaper registry model of the same kind.
// Env override per role: MODEL_ROLE_<ROLE_IN_CAPS>="provider:model" (e.g. MODEL_ROLE_ANIS_ANSWER=anthropic:claude-haiku-5-5).

/** reviewed = when this choice was last measured against the alternatives (ISO date). needs = what the job requires. */
export const MODEL_ROLES = {
  // ── search strategies (latency-critical) ──
  'search-planner': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-09-24', needs: ['fast', 'json'],
    why: 'type battery 61/76 @0.18 s, zero paid LLM (project_search_type_battery_20260924)' },
  'anis-triage': { provider: 'systemone', model: 'jev-latest', reviewed: '2026-10-07', needs: ['fast', 'classification'],
    why: 'gate before any paid call; ms latency' },
  'anis-answer': { provider: 'gemini', model: 'gemini-3.5-flash-lite', reviewed: '2026-10-05', needs: ['fast', 'multilingual', 'grounded-writing'],
    why: 'one fast call over raw search; ANIS_LLM env switches it (kept for compatibility)' },
  'anis-term': { provider: 'deepseek', model: 'deepseek-v4-flash', reviewed: '2026-10-08', needs: ['fast', 'tiny-output'],
    why: 'extract the word a CTAI question is about (20 tokens)' },
  'deep-research-rerank': { provider: 'deepseek', model: 'deepseek-v4-flash', reviewed: '2026-07-01', needs: ['ranking', 'json'],
    why: 'legacy choice — not measured against the 5.5 family' },
  'deep-research-hero-prompt': { provider: 'deepseek', model: 'deepseek-v4-flash', reviewed: '2026-07-01', needs: ['short-writing'],
    why: 'legacy choice' },
  'reading-targets': { provider: 'deepseek', model: 'deepseek-v4-flash', reviewed: '2026-10-12', needs: ['fast', 'json'],
    why: 'reading guide: list what on a page deserves a note (people, places, works, terms) — a small JSON list' },
  'reading-notes': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-12', needs: ['grounded-writing', 'persian-arabic-names', 'json'],
    why: 'reading guide notes: name meanings + cited timelines; quality over speed (one call per page, ~$0.05)' },
  // ── text processing ──
  'segmentation': { provider: 'anthropic', model: 'claude-haiku-5-5', reviewed: '2026-10-11', needs: ['arabic', 'index-output', 'batch'],
    why: 'best value for Arabic; batch half price; LM Studio retired (Chad 10-11)' },
  // ── evaluation ──
  'bakeoff-judge': { provider: 'anthropic', model: 'claude-sonnet-5-5', reviewed: '2026-10-11', needs: ['multilingual', 'judgement', 'json'],
    why: 'blind judge must be stronger than every flash candidate and read fa/ar/he/zh (anthropic-policy stage model-eval)' },
  // ── legacy chat / publishing / bios (call sites not yet on modelFor — see tests/api/model-literal-ratchet.test.js) ──
  'jafar-research': { provider: 'openai', model: 'gpt-4o', reviewed: '2026-08-09', needs: ['tool-use'], why: 'legacy Jafar pipeline' },
  'jafar-light': { provider: 'openai', model: 'gpt-4o-mini', reviewed: '2026-08-09', needs: ['fast'], why: 'legacy Jafar pipeline' },
  'publish-review': { provider: 'openai', model: 'gpt-4o', reviewed: '2026-08-01', needs: ['judgement'], why: 'legacy publish pipeline' },
  'publish-light': { provider: 'openai', model: 'gpt-4o-mini', reviewed: '2026-08-01', needs: ['fast'], why: 'legacy publish pipeline' },
  'bio-timeline': { provider: 'deepseek', model: 'deepseek-v4-flash', reviewed: '2026-10-09', needs: ['json', 'long-input'], why: 'bio life pages' },
};

const envKey = (role) => `MODEL_ROLE_${role.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/** → { provider, model } for a role (env override wins). Unknown role throws — a typo must not silently pick a model. */
export function modelFor(role) {
  const r = MODEL_ROLES[role];
  if (!r) throw new Error(`model-roles: unknown role "${role}"`);
  const o = process.env[envKey(role)];
  if (o && o.includes(':')) { const [provider, ...m] = o.split(':'); return { provider, model: m.join(':') }; }
  return { provider: r.provider, model: r.model };
}
