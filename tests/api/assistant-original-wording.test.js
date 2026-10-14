// Original-language wording (10-14): Lal asked four times for the Persian of Persian Hidden Word #19 and was answered
// from secondary works. A numbered reference now resolves to the canonical paragraph WITH its aligned original.
import { describe, it, expect } from 'vitest';
import { anisRespond, looksLikeOriginalQuestion, hiddenWordRef, findHiddenWord } from '../../api/lib/assistant/respond.js';

const LAL = 'The English language version of the Persian Hidden Word #19 says "three most holy words" were uttered. What are those "three words" in Persian language?';
const PHW19 = { paragraph_index: 183, heading: 'Part Two: From the Persian', text: 'O My Friends! … Awestruck ye listened as I gave utterance to these three most holy words: O friends! Prefer not your will to Mine …',
  original_text: '(١٩) ﴿ ای دوستان من ﴾ … و بسه کلمه طيّبه تکلّم فرمودم … ای دوستان رضای خود را بر رضای من اختيار مکنيد', original_lang: 'fa' };
const PARAS = [{ heading: 'Part One: From the Arabic', original_text: '(١٩) …عربي', text: 'Arabic 19' }, { heading: 'Part Two: From the Persian', original_text: '(١٨) …', text: 'P18' }, PHW19];

describe('original-wording recognisers', () => {
  it('knows an original-language ask', () => {
    expect(looksLikeOriginalQuestion(LAL)).toBe(true);
    expect(looksLikeOriginalQuestion('What is the Arabic word for justice here?')).toBe(true);
    expect(looksLikeOriginalQuestion('How does it read in the original?')).toBe(true);
    expect(looksLikeOriginalQuestion('What does the Hidden Word teach about love?')).toBe(false);
  });
  it('reads Hidden Words references', () => {
    expect(hiddenWordRef(LAL)).toEqual({ part: 'Persian', n: 19 });
    expect(hiddenWordRef('Arabic Hidden Words no. 5')).toEqual({ part: 'Arabic', n: 5 });
    expect(hiddenWordRef('PHW 82')).toEqual({ part: 'Persian', n: 82 });
    expect(hiddenWordRef('the Hidden Words')).toBe(null);
  });
  it('finds the numbered paragraph in its part (Eastern or Western digits)', () => {
    expect(findHiddenWord(PARAS, { part: 'Persian', n: 19 })).toBe(PHW19);
    expect(findHiddenWord(PARAS, { part: 'Arabic', n: 19 }).text).toBe('Arabic 19');
    expect(findHiddenWord(PARAS, { part: 'Persian', n: 7 })).toBe(null);
  });
});

describe("Lal's question end to end", () => {
  it('answers from the canonical paragraph and its Persian original — no ordinary search, no secondary works', async () => {
    const calls = { search: 0, craft: null };
    await anisRespond({
      messages: [{ role: 'user', content: LAL }],
      llm: { provider: 'test', model: 'test' },
      deps: {
        plan: async () => ({ shape: 'fact' }),
        search: async () => { calls.search++; return { passages: [] }; },
        getParagraphs: async (id) => (id === 20809 ? PARAS : []),
        companion: async () => ({ append: '', plan: null, offer: false }),
        chooseFormat: async () => ({ id: 'should-not-be-used' }),
        craft: async (args) => { calls.craft = args; return 'بسه کلمه طيّبه'; },
      },
    });
    expect(calls.search).toBe(0);
    const evidence = JSON.stringify(calls.craft);
    expect(evidence).toContain('بسه کلمه طيّبه');
    expect(evidence).toContain('ORIGINAL-language wording');
  });
});

describe('dropAuthorityLecture', () => {
  it('removes the authority-layers paragraph and nothing else', async () => {
    const { dropAuthorityLecture } = await import('../../api/lib/assistant/lint.js');
    const t = 'The three words are A, B and C.\n\nTo be entirely clear about the authority layers here: this passage is Scripture.\n\nWarmly,\nAnís';
    expect(dropAuthorityLecture(t)).toBe('The three words are A, B and C.\n\nWarmly,\nAnís');
    expect(dropAuthorityLecture('Nothing to remove.')).toBe('Nothing to remove.');
  });
});
