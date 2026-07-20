// The ONE spend policy for Anthropic (Claude) access — a hard, fail-closed allowlist.
//
// WHY: Anthropic is a PERSIAN-language CAPABILITY necessity (deepseek-flash cannot read Persian), authorised
// ONLY for the grounding pipeline on the APPROVED Persian plan books — the Mázandarání Ẓuhúru'l-Ḥaqq volumes.
// Every other language, caller, document, script, config default, and future stage is deepseek-only. A past
// leak billed Sonnet on ~421K non-Persian paragraphs (Pali Canon, Vedas, scraped web prayers) because routing
// decisions were trusted with no central refusal. This module is that refusal.
//
// HOW IT'S ENFORCED (two layers, so no single mistake reopens the hole):
//   1. RUNTIME — assertAnthropicAllowed() is called at ai.js chatCompletion (the one client every caller funnels
//      through) and at ai-services chatAnthropic. lang/docId come from the ambient ai-context opened by the
//      grounding driver; a call with no such context has no language → FAIL-CLOSED (refused).
//   2. STATIC — scripts/check-anthropic-imports.js fails the build/commit if the Anthropic SDK is imported or a
//      client is constructed anywhere outside the sanctioned, gated files. No future code can bypass layer 1.
//
// The approved doc-set is DERIVED from profile.js so it can never drift from the routing table: to authorise a
// new Persian book, pin it lang:'fa' in PROFILE_OVERRIDES and it becomes eligible automatically.
import { PROFILE_OVERRIDES } from './pipeline/profile.js';

/** The approved Anthropic doc-set = the Persian plan books explicitly pinned lang:'fa' (Mázandarání v1–v9). */
export const APPROVED_PERSIAN_DOCS = new Set(
  Object.entries(PROFILE_OVERRIDES).filter(([, o]) => o && o.lang === 'fa').map(([id]) => Number(id)),
);

export const isAnthropicModel = (model) => /^claude/i.test(String(model || ''));
export const isAnthropicProvider = (provider) => provider === 'anthropic';

/**
 * Throw (fatal) unless an Anthropic call is the one approved use: grounding a Persian paragraph of an approved
 * plan book. Not an Anthropic call → returns immediately (no effect on deepseek/openai/ollama/local).
 * lang + docId are read from the caller's ambient ai-context; missing/other → refused.
 */
export function assertAnthropicAllowed({ provider, model, lang, docId, caller, stage } = {}) {
  if (!isAnthropicProvider(provider) && !isAnthropicModel(model)) return;   // not Anthropic → not our concern
  const okLang = lang === 'fa';
  const okDoc = docId != null && APPROVED_PERSIAN_DOCS.has(Number(docId));
  if (okLang && okDoc) return;                                              // the ONE authorised case
  const e = new Error(
    `Anthropic spend policy: ${model || 'claude'} REFUSED — Anthropic is authorised only for grounding the ` +
    `approved Persian plan books (Mázandarání Ẓuhúru'l-Ḥaqq). Got lang=${lang || 'none'}, doc=${docId ?? 'none'}, ` +
    `caller=${caller || 'none'}, stage=${stage || 'none'}. English/Arabic/Hebrew and every non-approved doc are ` +
    `deepseek-only — fix the deepseek call rather than escalating to a paid model.`,
  );
  e.fatal = true;   // reuse the kernel's fatal contract: a policy breach must abort loudly, not become partial work
  throw e;
}
