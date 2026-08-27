// HyPE question QUALITY — the questions are the retrieval surface, so their shape is the product.
//
// Chad, 2026-08-26: "Complete and quality HyPE questions are the main reason we are analyzing concepts and
// people. We need quality HyPE to locate the right passage during RAG search."
import { describe, it, expect } from 'vitest';
import { buildSystem, buildUser, HYPE_VERSION, parseHype, parseHypeSlice, dedupeByAnswer, spanIsPresent } from '../../api/lib/rag/enrich/retrieval.js';

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
    // ONE phrasing, not two: asking both forms manufactured a duplicate on every defined term, which a
    // second-model judge measured as 35% of all questions being restatements.
    expect(sys).toMatch(/never both: they are the same ask/);
  });

  it('says why they get missed — the passage states them too plainly to look like answers', () => {
    expect(sys).toMatch(/look like they need no question/);
  });

  it('gives the ORIGINAL term its own question — a reader searching it would otherwise miss the passage', () => {
    expect(sys).toMatch(/that term gets its own question/);
  });

  it('refuses to define a phrase the passage merely quotes', () => {
    expect(sys).toMatch(/merely used or quoted without being explained/);
    expect(sys).toMatch(/sends readers here for nothing/);
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
    expect(sys).toMatch(/EVERY QUESTION CARRIES THE SPAN THAT ANSWERS IT/);
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

  it('asks for the answering span with every question', () => {
    expect(sys).toMatch(/EVERY QUESTION CARRIES THE SPAN THAT ANSWERS IT/);
    expect(sys).toMatch(/only one will be kept/);
  });

  it('states explicitly that this is not a cap', () => {
    expect(sys).toMatch(/not a limit on how many/i);
    expect(sys).toMatch(/a paragraph answering thirty distinct things gets thirty/);
  });

  it('asks for the {q,a} shape', () => {
    expect(sys).toMatch(/"q":"…\?","a":"verbatim words from the passage/);
  });

  it('still refuses to let a quota set the count', () => {
    expect(sys).toMatch(/sets the count, not a quota/);
  });

  it('is stamped at the current version', () => {
    expect(HYPE_VERSION).toBe('hype-v12-heading-aware');
  });
});

describe('dedupeByAnswer — the distinctness test, applied in code rather than asked of the model', () => {
  // The real ¶8 output: four English definitional questions and four more in Arabic, every one of them
  // answered by the same sentence. Three prompt revisions failed to stop it; a key comparison does.
  const four = [
    { q: 'What does it mean that nature has a sound organization?', a: 'subject to a sound organization, to inviolable laws, to a perfect order, and to a consummate design' },
    { q: 'What are the inviolable laws of nature?', a: 'subject to a sound organization, to inviolable laws, to a perfect order, and to a consummate design' },
    { q: 'What does انتظامات صحیحه mean?', a: 'subject to a sound organization, to inviolable laws, to a perfect order, and to a consummate design' },
    { q: 'What can be observed with the eye of insight?', a: 'the eye of insight and discernment beholds a perfect order' },
  ];

  it('keeps one question per distinct answer, across languages', () => {
    expect(dedupeByAnswer(four)).toEqual([
      'What does it mean that nature has a sound organization?',
      'What can be observed with the eye of insight?',
    ]);
  });

  it('applies NO cap — thirty distinct answers keep thirty questions', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ q: `question ${i}?`, a: `a distinct answering span number ${i}` }));
    expect(dedupeByAnswer(many)).toHaveLength(30);
  });

  it('keeps a question whose span is missing or too short to judge', () => {
    // An unusable span is a reason to skip the check, never to discard a question.
    expect(dedupeByAnswer([{ q: 'a?', a: '' }, { q: 'b?', a: 'tiny' }, { q: 'c?' }])).toEqual(['a?', 'b?', 'c?']);
  });

  it('ignores punctuation and case when comparing spans', () => {
    expect(dedupeByAnswer([
      { q: 'x?', a: 'Rendering to each his due.' },
      { q: 'y?', a: 'rendering to each his due' },
    ])).toEqual(['x?']);
  });
});

describe('parseHype accepts both shapes', () => {
  it('reads {q,a} objects and dedupes them', () => {
    const raw = '{"questions":[{"q":"A?","a":"the same answering words here"},{"q":"B?","a":"the same answering words here"}],"thesis":"t"}';
    expect(parseHype(raw)).toMatchObject({ questions: ['A?'], thesis: 't' });
  });

  it('still reads bare strings, so older recordings keep parsing', () => {
    const raw = '{"questions":["A?","B?"],"thesis":"t"}';
    expect(parseHype(raw)).toMatchObject({ questions: ['A?', 'B?'], thesis: 't' });
  });
});

describe('the invariant: this passage must ANSWER every question it carries', () => {
  // Chad, 2026-08-26: "The paragraph should always be an answer or a major partial answer of every question.
  // Otherwise the question does not belong to the paragraph. This is basic HyPE logic!"
  // A judge measured 23% of questions as unanswered by their own paragraph — the rule was being asked for,
  // not checked. Every question already carries the words it claims answer it, so the claim is verifiable.
  const EN = 'Know that justice consists in rendering to each his due, but bounty is to reward beyond desert.';
  const FA = 'بدان که عدل اعطای کلّ ذی حقّ حقّه است';

  it('accepts a span that is in the English', () => {
    expect(spanIsPresent('justice consists in rendering to each his due', [EN, FA])).toBe(true);
  });

  it('accepts a span that is only in the ORIGINAL — that is what the bilingual layer is for', () => {
    expect(spanIsPresent('عدل اعطای کلّ ذی حقّ حقّه است', [EN, FA])).toBe(true);
  });

  it('tolerates diacritics a model drops when re-quoting the original', () => {
    expect(spanIsPresent('عدل اعطاي كل ذي حق حقه است', [EN, FA])).toBe(true);
  });

  it('REJECTS a span that is in neither — the question does not belong to this passage', () => {
    expect(spanIsPresent('the soul is a sign of God and hath many stations', [EN, FA])).toBe(false);
  });

  it('returns null for a span too short to judge, so it is kept rather than deleted', () => {
    // An unverifiable claim is a reason to look, never a reason to delete a reader's route to the passage.
    expect(spanIsPresent('due', [EN, FA])).toBe(null);
    expect(spanIsPresent('', [EN, FA])).toBe(null);
  });

  it('states the rule first in the prompt, as the thing everything rests on', () => {
    const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'x' });
    expect(sys).toMatch(/THIS PASSAGE MUST ANSWER EVERY QUESTION YOU WRITE/);
    expect(sys).toMatch(/MENTIONING IS NOT ANSWERING/);
    // The three failure modes a span check cannot catch: the span exists and still does not answer.
    expect(sys).toMatch(/ASSERTING THAT IS NOT EXPLAINING HOW OR WHY/);
    expect(sys).toMatch(/NAMING IS NOT IDENTIFYING/);
    expect(sys).toMatch(/they would still be waiting for their answer/);
  });
});

describe('the answer gate covers the SLICED path too', () => {
  // A long paragraph is split into sentence groups and its questions concatenated. Handing that result over
  // as bare strings would skip the gate for exactly the paragraphs most likely to carry an unanswered
  // question — silently, and only for the long ones.
  it('parseHypeSlice surfaces items so the gate can run on them', () => {
    const raw = '{"questions":[{"q":"A?","a":"some verbatim answering words"}],"thesis":""}';
    expect(parseHypeSlice(raw).items).toEqual([{ q: 'A?', a: 'some verbatim answering words' }]);
  });

  it('the sliced branch assembles items, not strings', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../../api/lib/rag/enrich/retrieval.js', import.meta.url), 'utf8');
    const branch = src.slice(src.indexOf('One bounded call per sentence-group'), src.indexOf('stats.sliced'));
    expect(branch).toMatch(/parsed = \{ items, thesis \}/);
    expect(branch).not.toMatch(/parsed = \{ questions:/);
  });
});

describe('v12 — the heading is the question the passage helps answer', () => {
  // Chad, 2026-08-26: "SAQ is the ideal document for HyPE questions because it is, end-to-end, explanations
  // answering philosophical and economic and religious questions… Notice how ‘Abdu'l-Bahá answers one
  // question and tries to address all related philosophical questions related to that question within each
  // answer." The stage had the heading available on every paragraph and never once read it.
  const sys = buildSystem({ lang: 'en', genre: 'doctrinal', script: 'Latin' }, { title: 'Some Answered Questions' });

  it('puts the heading in the user message when there is one', () => {
    const u = buildUser({ pid: 'p1', text: 'Nature is subject to law.', context: 'c',
      heading: 'Proof and Arguments for the Existence of God' });
    expect(u).toMatch(/UNDER THE HEADING: Proof and Arguments for the Existence of God/);
  });

  it('omits the block entirely when a paragraph has no heading', () => {
    expect(buildUser({ pid: 'p1', text: 'x', context: 'c' })).not.toMatch(/UNDER THE HEADING/);
  });

  it('carries it into the SLICED user message too, where long answers live', () => {
    const u = buildUser({ pid: 'p1', text: 'long…', context: 'c', heading: 'The Need for an Educator' },
      null, { focus: 'a sentence', part: 1, parts: 3 });
    expect(u).toMatch(/UNDER THE HEADING: The Need for an Educator/);
  });

  it('tells the model to use it for orientation, not to answer the heading in general', () => {
    expect(sys).toMatch(/names the question or subject this passage is part of answering/);
    expect(sys).toMatch(/not about the heading's subject in general/);
  });

  it('says a single answer legitimately settles several related asks', () => {
    // This is where under-asking loses the most, so the rule has to push both ways: distinct or nothing,
    // but do not collapse genuinely separate asks that one explanation happens to answer together.
    expect(sys).toMatch(/SEVERAL related questions at once/);
    expect(sys).toMatch(/where under-asking loses the most/);
  });
});
