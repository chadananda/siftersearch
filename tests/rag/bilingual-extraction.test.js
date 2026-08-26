// The bilingual concept-extraction contract.
//
// Chad, 2026-08-25: "We need to express to the AI the idea that Shoghi Effendi's translation has unique
// doctrinal authority so both the original and the chosen translation are important for understanding
// the whole."
//
// The naive reading — "translations are lossy, so trust the original" — is WRONG here and would produce
// systematically bad extraction. The two sources carry different authority over different questions:
//   ORIGINAL  → WHICH TERM. Identity and differentiation. English collapses Ṣalát/Duʿá/Dhikr into
//               "prayer" and ʿadl/insáf into "justice"; only the root keeps them apart.
//   SE RENDERING → WHICH SENSE. His word-choice is an authoritative interpretive act that fixes which
//               sense of a polysemous term is operative in THIS passage. Not eloquent approximation.
// Neither alone is sufficient, and the prompt must say so rather than implying a hierarchy.
import { describe, it, expect } from 'vitest';
import { buildBilingualSystem, buildBilingualUser, ROOT_REQUIRED_NOTE } from '../../api/lib/rag/concepts/bilingual.js';

const profile = { genre: 'doctrinal', lang: 'en' };
const meta = { title: 'Gleanings', author: "Bahá'u'lláh" };

describe('the system prompt states the doctrine, not just the task', () => {
  const sys = buildBilingualSystem(profile, meta);

  it('names Shoghi Effendi\'s rendering as AUTHORITATIVE interpretation, not approximation', () => {
    expect(sys).toMatch(/authoritative/i);
    expect(sys).toMatch(/Shoghi Effendi/i);
    // Assert the doctrine POSITIVELY. A negative regex cannot tell "is an approximation" from "is NOT an
    // approximation" — the prompt states the latter, and the first version of this test failed it.
    expect(sys).toMatch(/not an approximation|never something to correct/i);
    expect(sys).toMatch(/fixes which sense|which sense is (meant|operative)/i);
  });

  it('assigns the ORIGINAL authority over term identity', () => {
    expect(sys).toMatch(/original/i);
    expect(sys).toMatch(/root/i);
  });

  it('warns that one English word may hide SEVERAL distinct concepts', () => {
    // The failure this whole contract exists to prevent.
    expect(sys).toMatch(/prayer|justice|distinct concepts|different roots/i);
  });

  it('forbids treating the translation as something to correct', () => {
    expect(sys).toMatch(/never|do not/i);
  });

  it('requires a root on every concept — identity is the root, never the English gloss', () => {
    expect(sys).toMatch(/root/i);
    expect(ROOT_REQUIRED_NOTE).toMatch(/root/i);
  });

  it('still demands a verbatim proof span, like every other extractor', () => {
    expect(sys).toMatch(/verbatim/i);
  });

  it('preserves polysemy — several senses at once, never pick one', () => {
    expect(sys).toMatch(/more than one|several|multiple/i);
  });
});

describe('the user message carries BOTH texts, aligned', () => {
  const p = { pid: 'para_45', text: 'clouds of Heaven-sent trials', context: 'ctx' };
  const aligned = { source: 'غمام امتحانات ربّانی', translation: 'clouds of Heaven-sent trials',
    terms: [{ term: 'غمام', root: 'غ-م-م', transliteration: 'gh-m-m', literal: 'cloud; covering', root_slug: 'ghmm-cloud' }] };

  it('includes the original text', () => {
    expect(buildBilingualUser(p, aligned)).toContain('غمام امتحانات ربّانی');
  });

  it('includes the CTAI root gloss so the model need not guess at morphology', () => {
    const u = buildBilingualUser(p, aligned);
    expect(u).toContain('غ-م-م');
    expect(u).toContain('ghmm-cloud');
  });

  it('labels the English explicitly as Shoghi Effendi\'s rendering, not as "the text"', () => {
    expect(buildBilingualUser(p, aligned)).toMatch(/Shoghi Effendi/i);
  });

  it('degrades honestly when no alignment is available — says so rather than inventing a root', () => {
    const u = buildBilingualUser(p, null);
    expect(u).toMatch(/no aligned original|unavailable/i);
    expect(u).not.toContain('غ-م-م');
  });
});
