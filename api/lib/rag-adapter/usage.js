// rag-adapter/usage — the SPEND POLICY for library model calls (host policy, never the pure library).
// METERING is NOT here: it lives at ai.js chatCompletion, the one client EVERY caller funnels through
// (grounding, deep-research, translation, search…), so logging there covers the whole app instead of just this
// adapter — and logging in both places would double-count. Attribution rides the shared ../ai-context scope.
// Deps: ../ai-context (ambient doc/stage/lang), ../model-registry (the ONE pricing source).
import { withAIContext, currentAIContext } from '../ai-context.js';
// THE ONE POLICY, consulted rather than copied. This gate and anthropic-policy.js both decide whether a paid
// call is allowed, and they disagreed: the concept-core allowance was added to that module and never to this
// one, so a correctly-scoped bilingual extraction on the Kitáb-i-Íqán — core book, Persian original, exactly
// the case the allowance exists for — was refused here with "lang=unknown". Two policies that must agree is
// the open-producer/closed-consumer shape that has cost this project a night at a time; importing removes the
// second copy instead of updating it.
import { isConceptCoreAllowed, isOriginalSegmentAllowed } from '../anthropic-policy.js';
import { getModel } from '../model-registry.js';

/** Open a metering/policy scope for a stage. Everything awaited inside (incl. pool concurrency) inherits it. */
export const withUsageScope = (ctx, fn) => withAIContext(ctx, fn);
export const currentScope = () => currentAIContext();

// ── SPEND POLICY ─────────────────────────────────────────────────────────────
// Anthropic is authorised for PERSIAN ONLY, because flash cannot read Persian — it is a capability necessity,
// not a quality upgrade. Every other language is deepseek-only INCLUDING FALLBACKS: a failing deepseek call is
// a call bug to fix (maxTokens headroom, prompt), never a licence to escalate onto a paid model. Enforced at
// this chokepoint so no routing table, config default, or future stage can spend on English by accident —
// a doc-agnostic `mergeFallback: haiku` silently did exactly that before this gate existed.
// FAIL-CLOSED: an unscoped call has no language to check, so a paid provider is refused rather than assumed OK.
const PAID_PROVIDERS = new Set(['anthropic', 'openai']);
const PAID_LANGS = new Set(['fa']);
// FLAGSHIP EXCEPTION (user-authorized, Chad 2026-08-08: "do the very best that we can, including paid, for
// Dawn-Breakers and GPB"): docs listed in PAID_DOC_ALLOWLIST may use paid providers in ANY language. Motivation:
// v4-flash's hidden reasoning balloons ~4k tokens/call on the fact-fed adaptive HyPE prompt and cannot be
// suppressed, so the two canonical books get a paid model for question generation. Env-scoped (not hardcoded)
// so the exception is visible in config and removable without a deploy. Empty (default) = no exception.
const PAID_DOC_ALLOWLIST = new Set(String(process.env.PAID_DOC_ALLOWLIST || '').split(',').map((s) => Number(s.trim())).filter(Boolean));

export function assertSpendAllowed({ provider, model, lang, stage, docId, originalLang, sourceLang }) {
  if (!PAID_PROVIDERS.has(provider)) return;
  if (PAID_LANGS.has(lang)) return;
  if (docId && PAID_DOC_ALLOWLIST.has(Number(docId))) return;   // flagship exception — see note above
  // The capability cases, owned by anthropic-policy.js. Both are narrow by construction (curated doc list +
  // a concept stage + an Arabic/Persian ORIGINAL) and neither widens what this gate refuses otherwise.
  if (isConceptCoreAllowed({ docId, stage, originalLang })) return;
  if (isOriginalSegmentAllowed({ docId, stage, sourceLang })) return;
  // Reuse the kernel's fatal contract: a policy breach is not per-item bad luck, so it must abort the run
  // loudly instead of being swallowed into partial work.
  const e = new Error(
    `Spend policy: ${provider}/${model} is Persian-only — refused for lang=${lang || 'unknown'} ` +
    `(stage=${stage || '?'}, doc=${docId ?? 'none'}, originalLang=${originalLang || 'none'}). ` +
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

