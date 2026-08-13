// Stage 1 of the article engine. The gate is the reason this exists: a question map holding only the easy
// "learn" questions produces a confident, unchallenged article — precisely the failure the PRD forbids. So
// the tests are mostly about what the map REFUSES to pass.
import { describe, it, expect } from 'vitest';
import { buildQuestionMap, auditQuestionMap, classifyKind, partitionForArticle, REQUIRED_KINDS } from '../../api/lib/pulitzer/question-map.js';

// Real CuriosityGraph cluster shape: {id, canonical, intent, monthly_volume, confidence, variants, tags}
const cl = (canonical, over = {}) => ({ id: 'cl_' + canonical.slice(0, 6), canonical, monthly_volume: 100, variants: [], tags: [], ...over });

describe('classifyKind — the role a question plays', () => {
  it('spots source-verification questions before anything else', () => {
    expect(classifyKind('Where does Bahá’u’lláh actually say this?')).toBe('source_verification');
    expect(classifyKind('Is that quotation authentic?')).toBe('source_verification');
    expect(classifyKind('Which text is this attributed to?')).toBe('source_verification');
  });

  it('spots skeptical questions, including ones that are also comparisons', () => {
    expect(classifyKind('Is the Báb really a separate Manifestation?')).toBe('skeptical');
    expect(classifyKind('Why not just call it a sect of Islam?')).toBe('skeptical');
    // both skeptical and comparative — the skeptical reading must win, it is the one articles skip
    expect(classifyKind('Is this really different from Sufism?')).toBe('skeptical');
  });

  it('spots practical and comparative questions', () => {
    expect(classifyKind('How do I start reading the Kitáb-i-Íqán?')).toBe('practical');
    expect(classifyKind('Bahá’í vs Bábí belief')).toBe('comparative');
  });

  it('treats the seed as primary and everything else as supporting', () => {
    expect(classifyKind('What is the Covenant?', { isSeed: true })).toBe('primary');
    expect(classifyKind('What is the Covenant?')).toBe('supporting');
  });
});

describe('buildQuestionMap', () => {
  const clusters = [
    cl('What is the Covenant?', { monthly_volume: 800, variants: ['covenant meaning'] }),
    cl('Where does the text actually say that?', { monthly_volume: 50 }),
    cl('Is that really what happened?', { monthly_volume: 30 }),
    cl('How do I start studying it?', { monthly_volume: 200 }),
    cl('Bahá’í vs Bábí', { monthly_volume: 120 }),
  ];

  it('normalises demand within the map, not against consumer-scale volumes', () => {
    const m = buildQuestionMap(clusters, { seedQuestion: 'What is the Covenant?' });
    const seed = m.questions.find((q) => q.kind === 'primary');
    expect(seed.demand_signal).toBe(1);                       // the busiest question in THIS map
    expect(m.questions.every((q) => q.demand_signal <= 1)).toBe(true);
  });

  it('carries variants into source_queries so research can expand', () => {
    const m = buildQuestionMap(clusters, { seedQuestion: 'What is the Covenant?' });
    expect(m.questions[0].source_queries).toContain('covenant meaning');
  });

  it('marks skeptical questions as controversial so they cannot be quietly dropped', () => {
    const m = buildQuestionMap(clusters);
    const s = m.questions.find((q) => q.kind === 'skeptical');
    expect(s.controversy).toBeGreaterThan(0.5);
  });

  it('skips empty clusters instead of emitting blank questions', () => {
    expect(buildQuestionMap([cl(''), cl('  ')]).questions).toHaveLength(0);
  });
});

describe('the Stage 1 gate', () => {
  it('PASSES a map covering every required kind', () => {
    const m = buildQuestionMap([
      cl('What is the Covenant?'), cl('Where does the text say that?'), cl('Is that really true?'),
      cl('How do I start studying?'), cl('What else is related?'),
    ], { seedQuestion: 'What is the Covenant?' });
    const a = auditQuestionMap(m);
    expect(a.ok).toBe(true);
    expect(a.missing).toEqual([]);
  });

  it('FAILS a map of only easy questions, naming exactly what is missing', () => {
    const m = buildQuestionMap([cl('What is the Covenant?'), cl('Who was involved?'), cl('When did it happen?')],
      { seedQuestion: 'What is the Covenant?' });
    const a = auditQuestionMap(m);
    expect(a.ok).toBe(false);
    expect(a.missing).toEqual(expect.arrayContaining(['skeptical', 'practical', 'source_verification']));
  });

  it('warns on a thin map even when the kinds are technically covered', () => {
    const m = buildQuestionMap([cl('What is X?'), cl('Is it really X?'), cl('Where does it say X?'), cl('How do I do X?')],
      { seedQuestion: 'What is X?' });
    expect(auditQuestionMap(m).warnings[0]).toMatch(/thin/);
  });

  it('requires the same kinds the PRD stage gate names', () => {
    expect(REQUIRED_KINDS).toEqual(['primary', 'supporting', 'skeptical', 'practical', 'source_verification']);
  });
});

describe('partitionForArticle', () => {
  it('pulls skeptical and verification questions UP — the ones a weak article drops', () => {
    const clusters = [
      cl('What is the Covenant?', { monthly_volume: 900 }),
      ...Array.from({ length: 12 }, (_, i) => cl(`Supporting detail ${i}?`, { monthly_volume: 500 })),
      cl('Is that really accurate?', { monthly_volume: 5 }),
      cl('Where does the text say it?', { monthly_volume: 5 }),
    ];
    const m = buildQuestionMap(clusters, { seedQuestion: 'What is the Covenant?' });
    const { article } = partitionForArticle(m, { limit: 6 });
    const kinds = article.map((q) => q.kind);
    // despite having the LOWEST demand, both survive the cut
    expect(kinds).toContain('skeptical');
    expect(kinds).toContain('source_verification');
  });

  it('routes the overflow to companion content rather than discarding it', () => {
    const m = buildQuestionMap(Array.from({ length: 20 }, (_, i) => cl(`Question ${i}?`)));
    const { article, companion } = partitionForArticle(m, { limit: 5 });
    expect(article).toHaveLength(5);
    expect(companion).toHaveLength(15);
  });
});
