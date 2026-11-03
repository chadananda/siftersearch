// request-features.js: the four 11-03 deterministic pre-checks — first message, pasted passage, original-text request,
// answer language as a parameter — on the wordings the 11-02 labels misrouted, plus their near misses.
import { describe, it, expect } from 'vitest';
import { answerLanguage, originalRequest, pastedPassage, isFirstMessage, requestFeatures } from '../../api/lib/assistant/request-features.js';

describe('isFirstMessage', () => {
  it('no assistant reply before the latest message = first', () => {
    expect(isFirstMessage([{ role: 'user', content: 'hi' }])).toBe(true);
    expect(isFirstMessage([{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }])).toBe(true);
    expect(isFirstMessage([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'why?' }])).toBe(false);
  });
});

describe('answerLanguage — a parameter, not a type', () => {
  it('a trailing vernacular is the answer language and is stripped from the request', () => {
    expect(answerLanguage('dhammapada meaning in hindi')).toMatchObject({ lang: 'hi', role: 'answer', stripped: 'dhammapada meaning' });
    expect(answerLanguage('bahai religion history in urdu')).toMatchObject({ lang: 'ur', role: 'answer', stripped: 'bahai religion history' });
    expect(answerLanguage('jainism holy book in hindi')).toMatchObject({ lang: 'hi', role: 'answer' });
    expect(answerLanguage('bhagavad gita meaning in english pdf')).toMatchObject({ lang: 'en', role: 'answer', stripped: 'bhagavad gita meaning' });
    expect(answerLanguage('guru nanak quotes in punjabi hindi')).toMatchObject({ lang: 'pa', role: 'answer', stripped: 'guru nanak quotes' });
    expect(answerLanguage('Where I can read it in English? Thank you.')).toMatchObject({ lang: 'en', role: 'answer' });
    expect(answerLanguage('explain the Kitab-i-Iqan in Spanish')).toMatchObject({ lang: 'es', role: 'answer', stripped: 'explain the Kitab-i-Iqan' });
  });
  it('a source script is the SUBJECT of the question, never stripped', () => {
    expect(answerLanguage('quran meaning in arabic')).toMatchObject({ lang: 'ar', role: 'source' });
    expect(answerLanguage('what does agape mean in Greek')).toMatchObject({ role: 'source' });
    expect(answerLanguage('hadith quotes in arabic')).toMatchObject({ role: 'source' });
    expect(answerLanguage('Lotus Sutra (also called Hokke-kyo in Japanese)')).toMatchObject({ role: 'source' });
  });
  it('an explicit verb makes even a source script the answer language', () => {
    expect(answerLanguage('explain this prayer to me in Arabic')).toMatchObject({ lang: 'ar', role: 'answer' });
  });
  it('no answer language: ability, provenance, "in the original", a field', () => {
    expect(answerLanguage('I am not so good in English')).toBeNull();
    expect(answerLanguage('was the Iqan written in Persian')).toBeNull();
    expect(answerLanguage('Can I read this in its original Persian?')).toBeNull();
    expect(answerLanguage('yin yang - how r they related in chinese filosophy')).toBeNull();
    expect(answerLanguage('what did Abdul-Baha say about race unity')).toBeNull();
  });
});

describe('originalRequest — A7', () => {
  it('asks for the original (or a translation) of a passage, with the quoted words', () => {
    expect(originalRequest('Show me the Arabic original of "O Son of Spirit! My first counsel is this"')).toMatchObject({ target: 'original', language: 'ar', passage: true, phrase: 'O Son of Spirit! My first counsel is this' });
    expect(originalRequest("Show me the Persian original of the passage from Mim (Mázindarán) beginning with 'We were one day'")).toMatchObject({ language: 'fa', phrase: 'We were one day' });
    expect(originalRequest('Can I read this in its original Persian?')).toMatchObject({ target: 'original', language: 'fa', passage: true });
    expect(originalRequest('what is the original persian of this prayer')).toMatchObject({ target: 'original' });
    expect(originalRequest('is there an english translation of this tablet')).toMatchObject({ target: 'translation', passage: true });
    expect(originalRequest('and the Arabic?', { inThread: true })).toBeNull();   // no original-text frame: Jev's follow-up, not a rule
  });
  it('near misses stay out: a word, a translation choice, a tradition, a canon', () => {
    for (const t of ['what is the Hebrew word for peace', 'best English translation of the Tao Te Ching', 'Persian eschatology', 'what is the pali canon',
      'Greek words for love', 'How do I write an English word in Pali script?', 'What is the original word in Arabic for load', 'who wrote the bhagavad gita in sanskrit']) {
      expect(originalRequest(t), t).toBeNull();
    }
  });
});

describe('pastedPassage', () => {
  const HW = '(18) O SON OF SPIRIT! The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me, and neglect it not that I may confide in thee.';
  it('a bare numbered Hidden Word is a passage to find', () => {
    const p = pastedPassage(HW);
    expect(p).toMatchObject({ kind: 'bare', ask: null });
    expect(p.phrase.startsWith('O SON OF SPIRIT! The best beloved')).toBe(true);
    expect(p.phrase.split(/\s+/).length).toBeLessThanOrEqual(40);
  });
  it('a passage with a short ask carries the ask', () => {
    expect(pastedPassage('Blessed is the spot, and the house, and the place, and the city, and the heart, and the mountain, and the refuge, and the cave, and the valley, and the land, and the sea, and the island, and the meadow where mention of God hath been made. Where is this from?')).toMatchObject({ kind: 'source', ask: 'Where is this from?' });
    expect(pastedPassage('O Shaykh! We have time and again stated that for a number of years We have extended Our aid unto His Majesty the Shah. What does this mean?')).toMatchObject({ kind: 'meaning' });
  });
  it('archaic wording lowers the bar: short fragments and capitalised pronouns count', () => {
    expect(pastedPassage('He, O my God, Who hath raised me up')).toMatchObject({ kind: 'bare' });
    expect(pastedPassage('Thou wert created to bare and endure, O Patiance of the worlds.')).toMatchObject({ kind: 'bare' });
    expect(pastedPassage('Say: The Revelation sent down by God hath most surely been repeated, and the outstretched Hand of Our power hath overshadowed all that are in the heavens.')).toMatchObject({ kind: 'bare' });
  });
  it("a seeker's own words are not a passage", () => {
    expect(pastedPassage('I am writing an essay about the Kitab-i-Iqan and my professor says it was written in 1862. Is that right? What are the main themes?')).toBeNull();
    expect(pastedPassage("I'm interested in learning more about the religious narratives found in Islamic texts. Specifically, I'd like to understand how the stories of the prophets are told across the Quran and the hadith literature and what they teach.")).toBeNull();
    expect(pastedPassage('Locate the text where someone discovers a spiritual truth, acknowledges it, and then expresses gratitude to the Lord for the guidance received.')).toBeNull();
    expect(pastedPassage('Wait, you said the Golden Rule quote is from Turning Point for All Nations by the Universal House of Justice, but that document is from 1995 and hath no such passage.')).toBeNull();
    expect(pastedPassage('what did Abdul-Baha say about race unity')).toBeNull();
    expect(pastedPassage('Abdu\'l-Bahá on the equality of women and men')).toBeNull();
  });
  it("the assistant's own earlier words quoted back are not a paste", () => {
    const said = ['Bahá’u’lláh writes: "The earth is but one country, and mankind its citizens. Verily He hath ordained it so." That is from Gleanings.'];
    expect(pastedPassage('The earth is but one country, and mankind its citizens. Verily He hath ordained it so.', { said })).toBeNull();
  });
});

describe('requestFeatures', () => {
  it('bundles first/language/original/pasted for a thread', () => {
    const f = requestFeatures([{ role: 'user', content: 'hidden words meaning in hindi' }]);
    expect(f.first).toBe(true); expect(f.language?.lang).toBe('hi'); expect(f.pasted).toBeNull(); expect(f.original).toBeNull();
    const g = requestFeatures([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }, { role: 'user', content: 'show me the original Persian of that passage' }]);
    expect(g.first).toBe(false); expect(g.original?.passage).toBe(true);
  });
});
