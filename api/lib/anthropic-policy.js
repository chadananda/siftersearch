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
import { CORE_ROSTER } from './rag/concepts/core-roster.js';

/** The curated core books — the ONE list, never a second copy that can drift from it. */
const CORE_ROSTER_IDS = new Set(CORE_ROSTER.map((r) => r.docId));

/** The approved Anthropic doc-set = the Persian plan books explicitly pinned lang:'fa' (Mázandarání v1–v9). */
export const APPROVED_PERSIAN_DOCS = new Set(
  Object.entries(PROFILE_OVERRIDES).filter(([, o]) => o && o.lang === 'fa').map(([id]) => Number(id)),
);

export const isAnthropicModel = (model) => /^claude/i.test(String(model || ''));
export const isAnthropicProvider = (provider) => provider === 'anthropic';

// FLAGSHIP EXCEPTION (user-authorized, Chad 2026-08-08: "do the very best that we can, including paid, for
// Dawn-Breakers and GPB"): doc ids in PAID_DOC_ALLOWLIST may use Anthropic in ANY language — the hype-v3
// question regeneration for the two canonical English histories, after v4-flash's unsuppressible reasoning
// balloon made deepseek unfit for that task (measured: ~4k hidden tokens/call, no mitigation works).
// Env-scoped and default-EMPTY: the fail-closed posture is unchanged unless the env explicitly opens it;
// remove the var to close the exception without a deploy. Mirrors the same allowlist in rag-adapter/usage.js.
const PAID_DOC_ALLOWLIST = new Set(String(process.env.PAID_DOC_ALLOWLIST || '').split(',').map((s) => Number(s.trim())).filter(Boolean));

// CONCEPT CORE (Chad, 2026-08-26: "$200 for tonight… Anthropic when we need to consider Arabic or Farsi
// original"). IN CODE, not env, because Chad's point stands — this variable is ours, not his, so managing it
// is our job and it belongs in git where it is reviewable and has history. The env hatch above still works
// and is unchanged; this is an additional, NARROWER allowance.
//
// It is narrow in three ways at once, and all three must hold:
//   1. the doc is on the curated CORE_ROSTER — a hand-checked list of canonical ids, not a pattern
//   2. the STAGE is concept work, so nothing else in the pipeline can reach a paid model through this
//   3. the paragraph carries a stored ORIGINAL in Arabic or Persian — the actual capability case, since
//      deepseek-flash cannot read Persian at all (it returns silently empty), which is the whole reason
//      this policy has an Anthropic exception in the first place
//
// Measured justification: on the Persian Íqán, deepseek failed 2 of 3 paragraphs and the claims that
// survived were degenerate ("the Exalted teaches God is the Exalted", no root). The English-only books do
// NOT qualify here — they route to deepseek exactly as before.
const CONCEPT_STAGES = new Set(['concept-extract', 'concept-disambiguate', 'concepts', 'concept-lexicon']);
const ORIGINAL_LANGS = new Set(['ar', 'fa']);

/** True when this is concept work on a core book whose paragraph carries an Arabic/Persian original. */
export function isConceptCoreAllowed({ docId, stage, originalLang } = {}) {
  if (docId == null || !CONCEPT_STAGES.has(String(stage || ''))) return false;
  if (!ORIGINAL_LANGS.has(String(originalLang || ''))) return false;
  return CORE_ROSTER_IDS.has(Number(docId));
}

/**
 * Throw (fatal) unless an Anthropic call is the one approved use: grounding a Persian paragraph of an approved
 * plan book. Not an Anthropic call → returns immediately (no effect on deepseek/openai/ollama/local).
 * lang + docId are read from the caller's ambient ai-context; missing/other → refused.
 */
export function assertAnthropicAllowed({ provider, model, lang, docId, caller, stage, originalLang } = {}) {
  if (!isAnthropicProvider(provider) && !isAnthropicModel(model)) return;   // not Anthropic → not our concern
  const okLang = lang === 'fa';
  const okDoc = docId != null && APPROVED_PERSIAN_DOCS.has(Number(docId));
  if (okLang && okDoc) return;                                              // the ONE authorised case
  if (docId != null && PAID_DOC_ALLOWLIST.has(Number(docId))) return;       // flagship exception (see note above)
  if (isConceptCoreAllowed({ docId, stage, originalLang })) return;         // concept core (see note above)
  const e = new Error(
    `Anthropic spend policy: ${model || 'claude'} REFUSED — Anthropic is authorised only for grounding the ` +
    `approved Persian plan books (Mázandarání Ẓuhúru'l-Ḥaqq). Got lang=${lang || 'none'}, doc=${docId ?? 'none'}, ` +
    `caller=${caller || 'none'}, stage=${stage || 'none'}. English/Arabic/Hebrew and every non-approved doc are ` +
    `deepseek-only — fix the deepseek call rather than escalating to a paid model.`,
  );
  e.fatal = true;   // reuse the kernel's fatal contract: a policy breach must abort loudly, not become partial work
  throw e;
}
