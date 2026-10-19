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

describe('the quibble (10-19)', () => {
  it("a correction of the reader's case ending is dropped unless they asked about grammar; the language answer keeps its substance", async () => {
    const { dropQuibbles } = await import('../../api/lib/assistant/lint.js');
    const reply = 'The noun bayt means house. So literally, fí baytuhu puts a nominative ending where a genitive is expected—it would normally be fí baytihi.\n\nA room is a ghurfa; a private chamber is a ḥujra.\n\nI should note that the texts I can search here do not settle the grammar of this phrase.';
    const q = 'Would you agree if "Fi baytuhu" be used for "Chamber" instead of "Bayt"?';
    expect(dropQuibbles(reply, { question: q, format: 'language' })).toBe('The noun bayt means house.\n\nA room is a ghurfa; a private chamber is a ḥujra.');
    expect(dropQuibbles(reply, { question: 'Is baytuhu genitive here?', format: 'language' })).toContain('nominative');
  });
});
