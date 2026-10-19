// Language questions are answered from knowledge of the language, never declined (Chad 10-19, Lal's 'fí baytihi').
import { describe, it, expect } from 'vitest';
import { looksLikeLanguageQuestion } from '../../api/lib/assistant/language.js';
import { dropAuthorityLecture } from '../../api/lib/assistant/lint.js';

describe('language questions', () => {
  it("Lal's follow-ups are language questions; ordinary questions are not", () => {
    expect(looksLikeLanguageQuestion('Would you agree if "Fi baytuhu" be used for "Chamber" instead of "Bayt" although they are outwardly two words of one and the same?')).toBe(true);
    expect(looksLikeLanguageQuestion('Is this من بيته وحدة (min baytihi) not mean "his (or from his) house"? I was looking for the word for "Chamber".')).toBe(true);
    expect(looksLikeLanguageQuestion('What is the Arabic word for chamber?')).toBe(true);
    expect(looksLikeLanguageQuestion('What does Bahá’u’lláh say about the privacy of prayer?')).toBe(false);
    expect(looksLikeLanguageQuestion('What is the Bahá’í position on socialism?')).toBe(false);
  });
  it('the authority lecture is dropped in its 10-19 wording', () => {
    const t = 'Bayt means house; ghurfa is a room.\n\nThis scripture is distinct from authorized interpretations, such as God Passes By. Pilgrim notes offer valuable historical windows, but they are distinct from the primary texts themselves.\n\nWarmly,\nAnís';
    expect(dropAuthorityLecture(t)).toBe('Bayt means house; ghurfa is a room.\n\nWarmly,\nAnís');
  });
});
