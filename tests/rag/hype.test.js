// HyPE question QUALITY — the questions are the retrieval surface, so their shape is the product.
//
// Chad, 2026-08-26: "Complete and quality HyPE questions are the main reason we are analyzing concepts and
// people. We need quality HyPE to locate the right passage during RAG search."
import { describe, it, expect } from 'vitest';
import { buildSystem, buildUser, HYPE_VERSION } from '../../api/lib/rag/enrich/retrieval.js';

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

describe('the version string is part of the prompt', () => {
  // Changing the prompt without bumping HYPE_VERSION left every paragraph matching the current version, so
  // --rehype skipped the entire book: the run reported success and the questions came back byte-identical.
  it('v4 is stamped, so the version-aware upgrade actually regenerates', () => {
    expect(HYPE_VERSION).toBe('hype-v5-distinct');
  });

  it('isHyped treats a row stamped with an older version as wanting an upgrade', async () => {
    const { isHyped } = await import('../../api/lib/pipeline/processed.js');
    expect(isHyped({ hypModel: 'hype-v3-adaptive' }, HYPE_VERSION)).toBe(false);
    expect(isHyped({ hypModel: HYPE_VERSION }, HYPE_VERSION)).toBe(true);
  });
});

describe('definitions are the highest-value thing to retrieve', () => {
  // Chad, 2026-08-26, on "KNOW THAT JUSTICE consists in rendering to each his due" (SAQ ¶933): "This is a
  // definition. When someone asks 'what is meant by justice?' such passages should pop up as define the term."
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'Some Answered Questions' });

  it('makes the plain definitional forms mandatory, not optional', () => {
    expect(sys).toMatch(/IF THE PASSAGE DEFINES A TERM/);
    expect(sys).toMatch(/MANDATORY and come first/);
    expect(sys).toMatch(/What is meant by X\?/);
  });

  it('says why they get missed — the passage states them too plainly to look like answers', () => {
    expect(sys).toMatch(/look like they need no question/);
  });

  it('asks for the definitional form of the ORIGINAL term too', () => {
    expect(sys).toMatch(/the same for the ORIGINAL term/);
  });

  it('stops the model appending the book title to every question', () => {
    // Measured on the Íqán v4 run: 8 of 10 questions in one paragraph ended "in the Kitáb-i-Íqán".
    expect(sys).toMatch(/do not append it to every question/);
    expect(sys).toMatch(/matches nothing but itself/);
  });
});

describe('v5 — the padding came back in a new costume', () => {
  // Measured on Some Answered Questions ¶8: "sound organization", "inviolable laws", "perfect order" and
  // "consummate design" each got a definitional question, and then each got ANOTHER in Arabic — the same
  // one-point sentence asked eight times. The definitional rule had re-created the fragmentation it was
  // added alongside.
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'Some Answered Questions' });

  it('restricts definitional questions to terms the passage actually turns on', () => {
    expect(sys).toMatch(/ONLY for a term the passage genuinely DEFINES or turns on/);
    expect(sys).toMatch(/NOT for ordinary descriptive wording/);
    expect(sys).toMatch(/the same padding in a new costume/);
  });

  it('bans yes/no questions, which retrieve badly and add no distinct ask', () => {
    expect(sys).toMatch(/NO YES\/NO QUESTIONS/);
    expect(sys).toMatch(/Turn each into the open form it is hiding/);
  });

  it('bans near-duplicates and topic-with-a-question-mark catch-alls', () => {
    expect(sys).toMatch(/NO NEAR-DUPLICATES/);
    expect(sys).toMatch(/NO CATCH-ALL QUESTIONS/);
    expect(sys).toMatch(/the paragraph's topic with a question mark/);
  });

  it('is stamped v5, so the change regenerates', () => {
    expect(HYPE_VERSION).toBe('hype-v5-distinct');
  });
});
