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
import { assertAnthropicAllowed, isConceptCoreAllowed, isOriginalSegmentAllowed } from '../../api/lib/anthropic-policy.js';
import { ORIGINALS_TARGETS } from '../../api/lib/rag/concepts/originals-targets.js';
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

// ── SEGMENTING AN ORIGINAL ────────────────────────────────────────────────────────────────────────────────
// The same capability case one step earlier. There is no stored original yet — producing it is the point —
// so the gate reads the language of the SOURCE TEXT handed to the model, not a column.
describe('isOriginalSegmentAllowed', () => {
  const SEVEN_VALLEYS = Number(Object.keys(ORIGINALS_TARGETS)[0]);

  it('allows segmentation of a named target’s Persian original', () => {
    expect(isOriginalSegmentAllowed({ docId: SEVEN_VALLEYS, stage: 'concept-segment-original', sourceLang: 'fa' })).toBe(true);
  });

  it('allows it for a core-roster book too', () => {
    expect(isOriginalSegmentAllowed({ docId: CORE, stage: 'concept-segment-original', sourceLang: 'ar' })).toBe(true);
  });

  it('REFUSES a doc named in neither reviewed file', () => {
    // An id has to have been written down by hand before a paid model can see it.
    expect(isOriginalSegmentAllowed({ docId: NOT_CORE, stage: 'concept-segment-original', sourceLang: 'fa' })).toBe(false);
  });

  it('REFUSES English source text — that is not the capability case', () => {
    for (const sourceLang of ['en', null, undefined, '']) {
      expect(isOriginalSegmentAllowed({ docId: SEVEN_VALLEYS, stage: 'concept-segment-original', sourceLang })).toBe(false);
    }
  });

  it('does NOT leak into any other stage', () => {
    for (const stage of ['concept-extract', 'hype', 'grounding', undefined]) {
      expect(isOriginalSegmentAllowed({ docId: SEVEN_VALLEYS, stage, sourceLang: 'fa' })).toBe(false);
    }
  });

  it('is reachable through the gate, and only with all of it', () => {
    const call = (o) => () => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-4-6', ...o });
    expect(call({ docId: SEVEN_VALLEYS, stage: 'concept-segment-original', sourceLang: 'fa' })).not.toThrow();
    expect(call({ docId: SEVEN_VALLEYS, stage: 'concept-segment-original', sourceLang: 'en' })).toThrow(/REFUSED/);
    expect(call({ docId: NOT_CORE, stage: 'concept-segment-original', sourceLang: 'fa' })).toThrow(/REFUSED/);
  });
});
