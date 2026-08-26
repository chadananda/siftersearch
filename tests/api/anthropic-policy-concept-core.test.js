// The concept-core Anthropic allowance — narrow by construction, and tested at its edges.
//
// Chad, 2026-08-26, authorising $200: "you can use Deepseek when English-only to save money and Anthropic
// when we need to consider Arabic or Farsi original." And on the allowlist variable itself: "These are
// variables you created. I did not… So this is fully your responsibility to manage… edit properly and
// manage with git." Hence in code, reviewable, with history — not a hand-edited server env file.
//
// This module exists because a past leak billed Sonnet on ~421K non-Persian paragraphs. Every test here is
// about keeping that from recurring: the allowance must not widen by accident.
import { describe, it, expect } from 'vitest';
import { assertAnthropicAllowed, isConceptCoreAllowed } from '../../api/lib/anthropic-policy.js';
import { CORE_ROSTER } from '../../api/lib/rag/concepts/core-roster.js';

const CORE = CORE_ROSTER[0].docId;          // a genuine core-roster id, not a guess
const NOT_CORE = 999999;

describe('isConceptCoreAllowed — all three conditions must hold', () => {
  it('allows concept extraction on a core book with a Persian original', () => {
    expect(isConceptCoreAllowed({ docId: CORE, stage: 'concept-extract', originalLang: 'fa' })).toBe(true);
  });

  it('allows Arabic too — deepseek reads Arabic, but the original is the point', () => {
    expect(isConceptCoreAllowed({ docId: CORE, stage: 'concept-extract', originalLang: 'ar' })).toBe(true);
  });

  it('REFUSES a doc that is not on the curated roster', () => {
    expect(isConceptCoreAllowed({ docId: NOT_CORE, stage: 'concept-extract', originalLang: 'fa' })).toBe(false);
  });

  it('REFUSES any stage that is not concept work', () => {
    // The whole pipeline shares this policy. If hype or grounding could reach a paid model through this
    // allowance, it would apply to the entire corpus rather than a dozen books.
    for (const stage of ['hype', 'grounding', 'disambig', 'merge', undefined]) {
      expect(isConceptCoreAllowed({ docId: CORE, stage, originalLang: 'fa' })).toBe(false);
    }
  });

  it('REFUSES a paragraph with NO stored original — the English-only case stays on deepseek', () => {
    // This is the condition that keeps the allowance tied to CAPABILITY rather than to a book's identity.
    for (const originalLang of [null, undefined, '', 'en', 'he']) {
      expect(isConceptCoreAllowed({ docId: CORE, stage: 'concept-extract', originalLang })).toBe(false);
    }
  });
});

describe('assertAnthropicAllowed — the gate itself', () => {
  const call = (o) => () => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-4-6', ...o });

  it('lets the concept-core case through', () => {
    expect(call({ docId: CORE, stage: 'concept-extract', originalLang: 'fa', lang: 'en' })).not.toThrow();
  });

  it('still refuses an English paragraph of a core book', () => {
    // The book being important does not authorise spend; needing a model that can read the text does.
    expect(call({ docId: CORE, stage: 'concept-extract', originalLang: null, lang: 'en' })).toThrow(/REFUSED/);
  });

  it('still refuses everything it refused before — no doc, wrong stage, wrong language', () => {
    expect(call({ lang: 'en' })).toThrow(/REFUSED/);
    expect(call({ docId: NOT_CORE, lang: 'ar', stage: 'concept-extract', originalLang: 'ar' })).toThrow(/REFUSED/);
    expect(call({ docId: CORE, stage: 'hype', originalLang: 'fa', lang: 'en' })).toThrow(/REFUSED/);
  });

  it('is inert for every non-Anthropic provider', () => {
    expect(() => assertAnthropicAllowed({ provider: 'deepseek', model: 'deepseek-v4-flash' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'ollama', model: 'qwen' })).not.toThrow();
  });

  it('fails FATALLY, so a breach aborts rather than becoming partial work', () => {
    try { call({ lang: 'en' })(); } catch (e) { expect(e.fatal).toBe(true); }
  });
});
