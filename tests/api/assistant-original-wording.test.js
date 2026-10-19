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

// 10-19: Lal asked for the original word for "chamber", quoting the passage without quotation marks, naming the Aqdas and
// adding a P.S. Anís looked it up as one text, found nothing and answered "I couldn't find it" — the library holds the
// English (Gleanings CXXXVI) and its Arabic. Any quoted passage now resolves through the English→original lookup.
const LAL_CHAMBER = 'Whoso reciteth, in the privacy of his *chamber*, the verses revealed by\nGod, ......\n\nKitab\'i-Aqdas\n\n\nP.S.\n\nI am NOT asking for translation of the word.  Only for the original word\nused.';
describe('any quoted passage → its original (Chad 10-19: "fix Anis")', () => {
  it('finds the quoted passage in a message with an attribution and a P.S.', async () => {
    const { quotedPassages } = await import('../../api/lib/assistant/respond.js');
    expect(quotedPassages(LAL_CHAMBER)).toEqual(['Whoso reciteth, in the privacy of his chamber, the verses revealed by God,']);
    expect(quotedPassages('What is the Arabic for "the scattering angels of the Almighty shall scatter abroad the fragrance"?')[0]).toBe('the scattering angels of the Almighty shall scatter abroad the fragrance');
  });
  it('answers from the English passage and its Arabic original', async () => {
    const calls = { search: 0, craft: null, looked: [] };
    const AR = 'ومن يقرأ آيات الله من بيته وحدة لينشر نفحاتها ملائكة النّاشرات';
    await anisRespond({
      messages: [{ role: 'user', content: `What is the original word used for "chamber"?\n\n${LAL_CHAMBER}` }],
      llm: { provider: 'test', model: 'test' },
      deps: {
        plan: async () => ({ shape: 'fact' }),
        search: async () => { calls.search++; return { passages: [] }; },
        authorityOf: async (doc) => (/Gleanings/.test(doc.title) ? 10 : 3),
        findOriginals: async (t) => { calls.looked.push(t); return { matches: [{ overlap: 1, passage: { id: 9, documentId: 13808, paragraphIndex: 33, text: 'Whoso reciteth…', document: { title: 'Fires in Many Hearts', author: 'Doris McKay' } } }, { overlap: 1, passage: { id: 1, documentId: 20783, paragraphIndex: 606, text: 'Whoso reciteth, in the privacy of his chamber, the verses revealed by God…', heading: '– CXXXVI –', document: { title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh' } } }],
          originals: [{ id: 2, documentId: 924842, paragraphIndex: 1, language: 'ar', text: AR, document: { title: 'Muntakhabát-i-Áthár:136', author: 'Bahá’u’lláh' }, foundThrough: { id: 1 } }] }; },
        companion: async () => ({ append: '', plan: null, offer: false }),
        chooseFormat: async () => ({ id: 'should-not-be-used' }),
        craft: async (args) => { calls.craft = args; return 'بيت (bayt)'; },
      },
    });
    expect(calls.search).toBe(0);
    expect(calls.looked[0]).toMatch(/^Whoso reciteth, in the privacy of his chamber/);
    const evidence = JSON.stringify(calls.craft);
    expect(evidence).toContain(AR);
    expect(evidence).toContain('Gleanings');
    expect(evidence).toMatch(/actually appears in/);
    expect(evidence).toMatch(/attributed this passage to \\"Kitab'i-Aqdas\\"/);
  });
});

describe('attribution and the authority lecture (10-19)', () => {
  it('finds the work a seeker named', async () => {
    const { attributionIn } = await import('../../api/lib/assistant/respond.js');
    expect(attributionIn(LAL_CHAMBER)).toBe("Kitab'i-Aqdas");
    expect(attributionIn('What is the Arabic of "x y z"?')).toBe(null);
  });
  it('the authority paragraph is dropped', async () => {
    const { dropAuthorityLecture } = await import('../../api/lib/assistant/lint.js');
    expect(dropAuthorityLecture('The word is bayt.\n\nAs for the authorities behind these sources: the Arabic is Scripture.\n\nWarmly,\nAnís')).toBe('The word is bayt.\n\nWarmly,\nAnís');
  });
});
