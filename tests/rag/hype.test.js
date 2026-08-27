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
    expect(HYPE_VERSION).toMatch(/^hype-v\d/);
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

  it('bans the book title outright (superseded the earlier "not every question" rule)', () => {
    // Measured on the Íqán v4 run: 8 of 10 questions in one paragraph ended "in the Kitáb-i-Íqán". Limiting
    // the frequency was the wrong fix — the title should never appear, because it narrows what the question
    // can match and the corpus-wide tie is the entire point.
    expect(sys).toMatch(/NEVER NAME THE BOOK OR WORK IN A QUESTION/);
  });
});

describe('v5 — the padding came back in a new costume', () => {
  // Measured on Some Answered Questions ¶8: "sound organization", "inviolable laws", "perfect order" and
  // "consummate design" each got a definitional question, and then each got ANOTHER in Arabic — the same
  // one-point sentence asked eight times. The definitional rule had re-created the fragmentation it was
  // added alongside.
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'Some Answered Questions' });

  it('restricts definitional questions to terms the passage gives their own content', () => {
    // v5 said "not ordinary descriptive wording", which the model still read loosely. v7 states the test:
    // a term earns a definition where the passage says what it IS or draws a line around it.
    expect(sys).toMatch(/gives that term its own content/);
    expect(sys).toMatch(/does not get its own definition/);
  });

  it('bans yes/no questions, which retrieve badly and add no distinct ask', () => {
    expect(sys).toMatch(/NO YES\/NO QUESTIONS/);
    expect(sys).toMatch(/Turn each into the open form it is hiding/);
  });

  it('bans topic-with-a-question-mark catch-alls, and tests duplication by the answer', () => {
    expect(sys).toMatch(/NO CATCH-ALL QUESTIONS/);
    expect(sys).toMatch(/the paragraph's topic with a question mark/);
    expect(sys).toMatch(/THE TEST FOR TWO QUESTIONS IS TWO ANSWERS/);
  });

  it('the padding rules are still in force at the current version', () => {
    // Version assertion lives with the newest change; these rules must survive every later bump.
    expect(sys).toMatch(/NO YES\/NO QUESTIONS/);
  });
});

describe('every AI stage must receive the concurrency it is given', () => {
  // HyPE was the one stage run-grounding never passed `concurrency: cc` to, so --cc=32 and --cc=6 produced
  // identical throughput and the dial appeared broken rather than absent. A control that is silently
  // ignored is worse than one that is missing: it invites you to keep turning it.
  it('run-grounding passes concurrency to the hype stage', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../../api/lib/pipeline/run-grounding.js', import.meta.url), 'utf8');
    const line = src.split('\n').find((l) => l.includes("want('hype')"));
    expect(line).toMatch(/concurrency: cc/);
  });

  it('and to every other stage that takes it, so none is silently serial', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../../api/lib/pipeline/run-grounding.js', import.meta.url), 'utf8');
    for (const stage of ['disambiguate', 'claims', 'hype']) {
      const line = src.split('\n').find((l) => l.includes(`want('${stage}')`));
      expect(line, `${stage} has no concurrency`).toMatch(/concurrency:/);
    }
  });
});

describe('v6 — questions must tie a concept ACROSS works, never fence it inside one', () => {
  // Chad, 2026-08-26: "the 'in Some Answered Questions' type HyPE is counter-productive. We are trying to
  // tie concepts across books, not isolate them. We already have a book filter or a religion filter if
  // needed. This should not be a type of hype question."
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'Some Answered Questions' });

  it('forbids naming the book outright — not "sparingly", never', () => {
    expect(sys).toMatch(/NEVER NAME THE BOOK OR WORK IN A QUESTION/);
    expect(sys).not.toMatch(/Roughly one in three/);
  });

  it('gives the reason: the same concept is developed in many works', () => {
    expect(sys).toMatch(/TIE A CONCEPT ACROSS THE WHOLE CORPUS/);
    expect(sys).toMatch(/not only the one whose title they happened to name/);
  });

  it('says scoping belongs to the search filter, not the question text', () => {
    expect(sys).toMatch(/done by a FILTER at search time/);
  });

  it('still allows the AUTHOR, which identifies a voice across works rather than fencing one in', () => {
    expect(sys).toMatch(/Naming the AUTHOR is different/);
  });

  it('keeps the cross-work ban at the current version', () => {
    expect(sys).toMatch(/NEVER NAME THE BOOK OR WORK IN A QUESTION/);
  });
});

describe('v7 — distinctness is tested by the ANSWER, never by a count', () => {
  // Chad, 2026-08-26: "please tighten, but never with arbitrary caps. We want unique questions but cannot
  // guess in advance how many questions a paragraph will answer. You fixed the too many questions problem
  // with a cap before and that is broken thinking."
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'Some Answered Questions' });

  it('defines distinctness by whether the answering SPAN differs', () => {
    expect(sys).toMatch(/THE TEST FOR TWO QUESTIONS IS TWO ANSWERS/);
    expect(sys).toMatch(/it is the first one again/);
  });

  it('carries the worked example that four namings of one idea earn one question', () => {
    expect(sys).toMatch(/four namings of a single idea/);
    expect(sys).toMatch(/not four definitions, and certainly not four again in the original language/);
  });

  it('shows the other side too — one sentence CAN answer several distinct questions', () => {
    // Without this the rule reads as "merge things", which would suppress real questions.
    expect(sys).toMatch(/The same sentence read differently DOES earn another question/);
  });

  it('states explicitly that this is not a cap', () => {
    expect(sys).toMatch(/THIS IS NOT A LIMIT ON HOW MANY/);
    expect(sys).toMatch(/there is no number/);
  });

  it('still refuses to let a quota set the count', () => {
    expect(sys).toMatch(/sets the count, not a quota/);
    expect(sys).toMatch(/Never drop a real question to hit a number/);
  });

  it('is stamped v7', () => {
    expect(HYPE_VERSION).toBe('hype-v7-distinct-answers');
  });
});
