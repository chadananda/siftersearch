// HyPE question QUALITY — the questions are the retrieval surface, so their shape is the product.
//
// Chad, 2026-08-26: "Complete and quality HyPE questions are the main reason we are analyzing concepts and
// people. We need quality HyPE to locate the right passage during RAG search."
import { describe, it, expect } from 'vitest';
import { buildSystem, buildUser } from '../../api/lib/rag/enrich/retrieval.js';

describe('HyPE asks what a reader asks, not what a quiz asks', () => {
  // Measured on the Kitáb-i-Íqán before this change: ¶2 produced "From what should their ears be cleansed?",
  // "…their minds…", "…their hearts…", "…their eyes…" — one sentence's list fragmented four ways — and ¶4
  // produced "What does this passage ask the reader to ponder?", which nobody will ever type.
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'the Kitáb-i-Íqán' });

  it('forbids referring to the text itself', () => {
    expect(sys).toMatch(/NEVER refer to the text itself/);
    expect(sys).toMatch(/this passage/);
    expect(sys).toMatch(/A reader searching does not know a passage exists/);
  });

  it('forbids one question per noun', () => {
    expect(sys).toMatch(/ONE QUESTION PER DISTINCT THING TAUGHT — never one per noun/);
    expect(sys).toMatch(/is one question padded three times/);
  });

  it('no longer tells the model to work through the paragraph sentence by sentence', () => {
    // That instruction is what produced the fragmentation: it is a history register applied to doctrine.
    expect(sys).not.toMatch(/Work through it sentence by sentence/);
  });

  it('asks for questions using the ORIGINAL term, which is why the bilingual layer exists', () => {
    expect(sys).toMatch(/USING THAT TERM/);
    expect(sys).toMatch(/the English gloss will not retrieve them/);
  });

  it('still lets the paragraph set the count', () => {
    expect(sys).toMatch(/sets the count, not a quota/);
  });
});
