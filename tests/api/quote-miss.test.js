// THE decision that told Chad the library lacked a passage sitting at rank 1 in our own retrieval.
//
// Query: `Abdu'l-Baha defines "justice" as every man receiving his due. Where?`
// Retrieval returned Some Answered Questions at RANK 1 — "justice consists in rendering to each his due".
// The remembered wording is a paraphrase, so a verbatim-containment test failed, and that failure was read
// as proof of absence: we announced the library did not have it and went to the web.
//
// Chad: "there was NO verbatim hit. we discarded the semantic hit for no reason."
import { describe, it, expect } from 'vitest';
import { isQuoteMiss, spanIsContained } from '../../api/lib/jafar-pipeline.js';

const SAQ = { text: 'KNOW THAT JUSTICE consists in rendering to each his due. For example, when a workman labours from morning till evening, justice requires that he be paid his wage.' };
const SPAN = 'justice as every man receiving his due';

describe('isQuoteMiss — a semantic hit is never discarded', () => {
  it('THE REGRESSION: a paraphrase with a decisive hit is NOT a miss', () => {
    expect(isQuoteMiss({ span: SPAN, confidence: 'high' }, [SAQ])).toBe(false);
  });

  it('nor is a paraphrase with a merely LIKELY hit — the timid fix would have failed here', () => {
    expect(isQuoteMiss({ span: SPAN, confidence: 'likely' }, [SAQ])).toBe(false);
  });

  it('a verbatim hit is obviously not a miss', () => {
    expect(isQuoteMiss({ span: 'justice consists in rendering to each his due', confidence: 'high' }, [SAQ])).toBe(false);
  });

  it('nothing retrieved IS a miss — that is what the web is for', () => {
    expect(isQuoteMiss({ span: SPAN, confidence: 'none' }, [])).toBe(true);
  });

  it('a low-confidence scrape of nothing usable is a miss', () => {
    expect(isQuoteMiss({ span: SPAN, confidence: 'low' }, [SAQ])).toBe(true);
  });
});

describe('spanIsContained — still available, no longer used to deny the library has something', () => {
  it('true for the real wording', () => {
    expect(spanIsContained('justice consists in rendering to each his due', [SAQ])).toBe(true);
  });
  it('false for the paraphrase — correct as a FACT, wrong as a verdict on the library', () => {
    expect(spanIsContained(SPAN, [SAQ])).toBe(false);
  });
  it('ignores spans too short to be distinctive', () => {
    expect(spanIsContained('justice', [SAQ])).toBe(false);
  });
});
