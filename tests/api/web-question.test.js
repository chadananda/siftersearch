// The question we send to the web decides the answer we get back, and getting it wrong is INVISIBLE: the
// call succeeds, an answer returns, and it is confidently about the wrong subject.
//
// Measured against the same Perplexity model on 2026-08-17, for
// `Abdu'l-Baha defines "justice" as every man receiving his due. Where?`:
//   the old rewrite → "Ulpian's Digest of Justinian … Aquinas's Summa Theologica"   (Roman law — wrong)
//   the user's own Q → "Some Answered Questions, chapter 'The Justice and the Mercy of God'"  (correct)
// Chad saw the Roman-law answer and reasonably concluded our search was worse than Perplexity. It was our
// PROMPT that was worse; Perplexity answered the question we actually asked it.
import { describe, it, expect } from 'vitest';
import { buildWebQuestion } from '../../api/lib/jafar-pipeline.js';

const USER_Q = `Abdu'l-Baha defines "justice" as every man receiving his due. Where?`;
const LOOKUP = { span: 'justice as every man receiving his due', confidence: 'likely' };

describe('buildWebQuestion', () => {
  it("leads with the USER'S question — the subject is what aims the search", () => {
    const q = buildWebQuestion(USER_Q, LOOKUP);
    expect(q.startsWith(USER_Q)).toBe(true);
    expect(q).toContain("Abdu'l-Baha");        // dropping this is what let it drift to Roman law
  });

  it('offers the remembered span as SUPPORTING detail, flagged as a possible paraphrase', () => {
    const q = buildWebQuestion(USER_Q, LOOKUP);
    expect(q).toContain('justice as every man receiving his due');
    expect(q).toMatch(/possibly a paraphrase/i);
  });

  it('does NOT steer toward compilations — it prefers the ORIGINAL work', () => {
    const q = buildWebQuestion(USER_Q, LOOKUP);
    expect(q).toMatch(/ORIGINAL work/);
    expect(q).not.toMatch(/authoritative compilation/i);
  });

  it('does NOT ask for "the earlier book it cites" — that is the Roman-law detour', () => {
    expect(buildWebQuestion(USER_Q, LOOKUP)).not.toMatch(/earlier book it cites/i);
  });

  it('a lookup with no span still asks the user question, not a bare instruction', () => {
    const q = buildWebQuestion(USER_Q, { span: null, confidence: 'none' });
    expect(q.startsWith(USER_Q)).toBe(true);
    expect(q).not.toMatch(/possibly a paraphrase/i);
  });

  it('a non-quote question is passed through untouched', () => {
    expect(buildWebQuestion('What is the station of the Manifestation?', null))
      .toBe('What is the station of the Manifestation?');
  });
});
