// Shared language constants. Single source of truth so segmenter.js and
// ingester.js (and future consumers) can never drift.
//
// AI_SEGMENTED_LANGUAGES — language codes whose paragraphs are sent to the
//   segmenter LLM (vLLM on boss machine) for sentence-level breaks rather
//   than handled by the regex-based fast path. Arabic, Persian, Hebrew,
//   and Urdu all use scripts where conventional sentence boundaries
//   require linguistic understanding.
//
// RTL_LANGUAGES — codes that need right-to-left rendering.

export const AI_SEGMENTED_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

export const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

export function isAiSegmentedLanguage(code) {
  return AI_SEGMENTED_LANGUAGES.includes(code);
}

export function isRtlLanguage(code) {
  return RTL_LANGUAGES.includes(code);
}
