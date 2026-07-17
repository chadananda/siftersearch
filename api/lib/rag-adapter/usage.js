// rag-adapter/usage — metering + SPEND POLICY for every LLM call the library makes. The adapter's llm port is
// the ONE chokepoint every stage's model call passes through, so both concerns live here (host policy, never
// the pure library). Doc/stage attribution rides an AsyncLocalStorage scope the executor opens per stage — the
// library passes no docId to the port, so this is how a cost lands against a book without touching library code.
// Deps: node:async_hooks, ../db (telemetryQuery = fire-and-forget, own connection, 200ms busy timeout),
// ../model-registry (the ONE pricing source — never a second local price table).
import { AsyncLocalStorage } from 'node:async_hooks';
import { telemetryQuery } from '../db.js';
import { getModel } from '../model-registry.js';
import { logger } from '../logger.js';

const scope = new AsyncLocalStorage();

/** Open a metering/policy scope for a stage. Everything awaited inside (incl. pool concurrency) inherits it. */
export const withUsageScope = (ctx, fn) => scope.run({ ...scope.getStore(), ...ctx }, fn);
export const currentScope = () => scope.getStore() || {};

// ── SPEND POLICY ─────────────────────────────────────────────────────────────
// Anthropic is authorised for PERSIAN ONLY, because flash cannot read Persian — it is a capability necessity,
// not a quality upgrade. Every other language is deepseek-only INCLUDING FALLBACKS: a failing deepseek call is
// a call bug to fix (maxTokens headroom, prompt), never a licence to escalate onto a paid model. Enforced at
// this chokepoint so no routing table, config default, or future stage can spend on English by accident —
// a doc-agnostic `mergeFallback: haiku` silently did exactly that before this gate existed.
// FAIL-CLOSED: an unscoped call has no language to check, so a paid provider is refused rather than assumed OK.
const PAID_PROVIDERS = new Set(['anthropic', 'openai']);
const PAID_LANGS = new Set(['fa']);

export function assertSpendAllowed({ provider, model, lang, stage }) {
  if (!PAID_PROVIDERS.has(provider)) return;
  if (PAID_LANGS.has(lang)) return;
  // Reuse the kernel's fatal contract: a policy breach is not per-item bad luck, so it must abort the run
  // loudly instead of being swallowed into partial work.
  const e = new Error(
    `Spend policy: ${provider}/${model} is Persian-only — refused for lang=${lang || 'unknown'} (stage=${stage || '?'}). ` +
    `English/Arabic/Hebrew are deepseek-only; fix the deepseek call rather than escalating to a paid model.`,
  );
  e.fatal = true;
  throw e;
}

// ── COST ─────────────────────────────────────────────────────────────────────
// Registry pricing is per 1K tokens. Cached prompt tokens bill ~0.1x on both Anthropic (cache_read_input_tokens)
// and DeepSeek (prompt_cache_hit_tokens) — approximated with one multiplier; exact enough to steer decisions,
// and far better than the nothing we had.
const CACHE_READ_MULT = 0.1;

export function costOf({ model, promptTokens = 0, completionTokens = 0, cachedTokens = 0 }) {
  const p = getModel(model)?.pricing;
  if (!p) return 0;
  const fresh = Math.max(0, promptTokens - cachedTokens);
  return (fresh * p.input + cachedTokens * p.input * CACHE_READ_MULT + completionTokens * p.output) / 1000;
}

/**
 * Record ONE model call into the central spend log (`ai_usage`) — the same table the rest of the app bills to,
 * so grounding shows up in overall spend instead of being invisible. Attributed to the scoped doc + stage.
 * Fire-and-forget: telemetry must never fail or slow a stage.
 */
export function recordUsage({ model, provider, usage = {}, ok = true, errorMessage = null }) {
  const { docId = null, stage = null } = currentScope();
  const promptTokens = usage.promptTokens || 0;
  const completionTokens = usage.completionTokens || 0;
  const cachedTokens = usage.cachedTokens || 0;
  const cost = costOf({ model, promptTokens, completionTokens, cachedTokens });
  setImmediate(() => {
    try {
      telemetryQuery(
        `INSERT INTO ai_usage (provider, model, service_type, prompt_tokens, completion_tokens, total_tokens,
           estimated_cost_usd, caller, success, error_message, user_id, job_id, document_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [provider, model, `grounding:${stage || 'unscoped'}`, promptTokens, completionTokens,
          promptTokens + completionTokens, cost, 'corpus-rag', ok ? 1 : 0, errorMessage, null, null, docId],
      );
    } catch (err) { logger.warn({ err: err.message, model, stage }, 'ai_usage log failed'); }
  });
  return cost;
}
