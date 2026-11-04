// Quote fast path, the WRITER's view (prompt.js passageText): a passage held for the wording is shown to the writer around
// that wording, not cut at its first 1,300 characters. Production 11-04 (main 0b53421a): lookup put Gleanings CXVII first
// (doc 20783 ¶503) but the line stands at character ~2,025 of 2,076, so the writer never saw it, wrote "I did not find the
// exact phrase … as a numbered Gleanings paragraph" and built the answer from The Bahá'í World XIV and The World Order of
// Bahá'u'lláh, which quote it.
import { describe, it, expect } from 'vitest';
import { passageText, phraseSpan, anisUserPayload, PASSAGE_CHARS, headOf } from '../../api/lib/assistant/prompt.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';

const PHRASE = 'The earth is but one country';
// Gleanings CXVII as production holds it (doc 20783, paragraph index 503), verbatim
const GLEANINGS_CXVII = "The Great Being, wishing to reveal the prerequisites of the peace and tranquillity of the world and the advancement of its peoples, hath written: The time must come when the imperative necessity for the holding of a vast, an all-embracing assemblage of men will be universally realized. The rulers and kings of the earth must needs attend it, and, participating in its deliberations, must consider such ways and means as will lay the foundations of the world’s Great Peace amongst men. Such a peace demandeth that the Great Powers should resolve, for the sake of the tranquillity of the peoples of the earth, to be fully reconciled among themselves. Should any king take up arms against another, all should unitedly arise and prevent him. If this be done, the nations of the world will no longer require any armaments, except for the purpose of preserving the security of their realms and of maintaining internal order within their territories. This will ensure the peace and composure of every people, government and nation. We fain would hope that the kings and rulers of the earth, the mirrors of the gracious and almighty name of God, may attain unto this station, and shield mankind from the onslaught of tyranny.… The day is approaching when all the peoples of the world will have adopted one universal language and one common script. When this is achieved, to whatsoever city a man may journey, it shall be as if he were entering his own home. These things are obligatory and absolutely essential. It is incumbent upon every man of insight and understanding to strive to translate that which hath been written into reality and action.… That one indeed is a man who, today, dedicateth himself to the service of the entire human race. The Great Being saith: Blessed and happy is he that ariseth to promote the best interests of the peoples and kindreds of the earth. In another passage He hath proclaimed: It is not for him to pride himself who loveth his own country, but rather for him who loveth the whole world. The earth is but one country, and mankind its citizens.";

describe('passageText: a long passage is shown around the wording it was found for', () => {
  it('the fixture is the production shape: the line sits past the 1,300-character cut', () => {
    expect(GLEANINGS_CXVII.length).toBeGreaterThan(PASSAGE_CHARS);
    expect(GLEANINGS_CXVII.indexOf('The earth is but one country')).toBeGreaterThan(PASSAGE_CHARS);
  });
  it('with the wording as focus, the writer sees the line (and the lead-in to it), within the budget', () => {
    const t = passageText({ text: GLEANINGS_CXVII, focus: PHRASE });
    expect(t).toContain('The earth is but one country, and mankind its citizens.');
    expect(t).toContain('It is not for him to pride himself who loveth his own country');
    expect(t.startsWith('… ')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(PASSAGE_CHARS + 4);
  });
  it('without a focus (an ordinary search passage) the writer sees the head: ≤1,300 characters, ended at a sentence and marked " …"', () => {
    const t = passageText({ text: GLEANINGS_CXVII });
    expect(t).toBe(headOf(GLEANINGS_CXVII, PASSAGE_CHARS));
    expect(t.endsWith(' …')).toBe(true);
    expect(t.length).toBeLessThanOrEqual(PASSAGE_CHARS + 2);
    expect(GLEANINGS_CXVII.startsWith(t.slice(0, -2))).toBe(true);
    expect(t.slice(0, -2)).toMatch(/[.!?…][”"’)\]]*$/);
  });
  it('headOf never ends mid-word (11-04: a footnote cut at "with the first el" read as the whole passage)', () => {
    const fn = 'This interregnum lasted for years and the Hands of the Cause guided the community through it all. This interregnum ended in 1963 with the first election of the Universal House of Justice.';
    expect(headOf(fn, 150)).toBe('This interregnum lasted for years and the Hands of the Cause guided the community through it all. …');
    expect(headOf('one two three four five six seven eight nine ten', 30)).toBe('one two three four five six …');
    expect(headOf('short', 30)).toBe('short');
  });
  it('a focus already inside the first 1,300 characters, or one the text does not hold, changes nothing', () => {
    expect(passageText({ text: GLEANINGS_CXVII, focus: 'The Great Being, wishing to reveal' })).toBe(headOf(GLEANINGS_CXVII, PASSAGE_CHARS));
    expect(passageText({ text: GLEANINGS_CXVII, focus: 'words this paragraph never says' })).toBe(headOf(GLEANINGS_CXVII, PASSAGE_CHARS));
  });
  it('a short passage is whole', () => {
    expect(passageText({ text: 'The earth is but one country and mankind its citizens.', focus: PHRASE })).toBe('The earth is but one country and mankind its citizens.');
  });
  it('phraseSpan matches as the quote gate does: case, accents, apostrophes and punctuation ignored', () => {
    const t = 'He said: “It is not his to boast who loveth his country.” Then Bahá’u’lláh wrote, THE EARTH is but one-country!';
    const [s, e] = phraseSpan(t, 'the earth is but one country');
    expect(t.slice(s, e)).toBe('THE EARTH is but one-country!');
    expect(phraseSpan(t, 'Bahaullah wrote')).not.toBeNull();
    expect(phraseSpan(t, 'one country and mankind')).toBeNull();
  });
  it('the writer payload carries the line for a focused passage', () => {
    const u = anisUserPayload({ question: 'q', passages: [{ source_title: 'Gleanings from the Writings of Bahá’u’lláh', text: GLEANINGS_CXVII, focus: PHRASE }] });
    expect(u).toContain('The earth is but one country, and mankind its citizens.');
  });
});

describe('respond: the quote lookup marks every kept passage with the wording', () => {
  it('the writer receives Gleanings CXVII first, focused on the phrase, and its payload shows the line', async () => {
    const crafted = [];
    const d = {
      plan: async () => ({ shape: 'topic' }), chooseFormat: async () => ({ id: 'x', how: '' }), search: async () => ({ passages: [], _plan: {} }),
      agentCreate: () => { throw new Error('agent'); }, phrases: async () => null,
      craft: async (a) => { crafted.push(a); a.onChunk('ok'); return 'ok'; },
      companion: async () => ({ append: '', plan: {}, offer: false }),
    };
    const B = 'Bahá’u’lláh';
    const lookup = { kind: 'quote', phrase: PHRASE, passages: [
      { id: 28307660, text: GLEANINGS_CXVII, title: 'Gleanings from the Writings of Bahá’u’lláh', author: B, book_author: B, document_id: 20783, paragraph_index: 503, source_url: 'https://x/g#503' },
      { id: 20805407, text: `Small wonder if by the Pen of Bahá’u’lláh these pregnant words … “The earth is but one country, and mankind its citizens.”`,
        title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', document_id: 20894, paragraph_index: 414, source_url: 'https://x/w#414' }] };
    await anisRespond({ messages: [{ role: 'user', content: `Where is the quote "${PHRASE}" from?` }], direction: { stance: 'curious', lookup, engine: undefined }, deps: d });
    const q = crafted[0].retrieved_quotes;
    expect(q[0].source_title).toMatch(/^Gleanings/);
    expect(q.every((x) => x.focus === PHRASE)).toBe(true);
    expect(q[0].text).toBe(GLEANINGS_CXVII);   // the full text stays: the quote gate verifies against it
    expect(anisUserPayload({ question: 'q', passages: q })).toContain('The earth is but one country, and mankind its citizens.');
  });
});
