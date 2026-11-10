// Chad 11-10: '"I cannot search from here" is never correct.' No reply ever says Anís can't search / look up / run a search of
// the library or a book: a HOUSE_STYLE rule, a blocking lint pass at every reply's exit, and a counted forensics defect class.
import { describe, it, expect } from 'vitest';
import { dropSearchDenial, isSearchDenial, lintReply, finalForm, formPass } from '../../api/lib/assistant/lint.js';
import { HOUSE_STYLE } from '../../api/lib/assistant/prompt.js';
import { forensicPass } from '../../api/lib/audit/forensics.js';
import { turnFromPath } from '../../api/lib/audit/improve.js';

const DENIALS = [
  "I can't run a literal text search of the book from here.",
  'I cannot search the library from here.',
  "I'm unable to search the text directly.",
  'I am not able to look up every occurrence.',
  "I don't have a way to search the full text of God Passes By.",
  'I do not have the ability to search inside a single book.',
  'I have no way to search the Persian originals.',
  "Searching the whole book isn't something I can do.",
  "I couldn't run a full-text search on that work.",
  'Unfortunately, I don’t have access to search the complete text.',
];
const NOT_DENIALS = [
  "I couldn't find any passage on that.",
  'I searched all of God Passes By: the words are not in it.',
  'The Guardian says the friends cannot search the hearts of others.',
  'He said “I can’t search for it” to the crowd.',
];

describe('search denial — detected in every wording, and nothing else', () => {
  for (const s of DENIALS) it(`denial: ${s}`, () => { expect(isSearchDenial(s)).toBe(true); expect(lintReply(s).map((x) => x.id)).toContain('search-denial'); });
  for (const s of NOT_DENIALS) it(`not a denial: ${s}`, () => expect(isSearchDenial(s)).toBe(false));
});

describe('the lint pass removes the sentence, keeps the rest of the paragraph', () => {
  it('the live opening: what follows the "but" stays', () => {
    const r = dropSearchDenial("I can't run a literal text search of the book from here, but *God Passes By* does speak of property. More here.\n\nSecond paragraph.");
    expect(r).toEqual({ text: '*God Passes By* does speak of property. More here.\n\nSecond paragraph.', dropped: 1 });
  });
  it('a denial mid-paragraph goes; the sentences around it stay', () => {
    expect(dropSearchDenial("Shoghi Effendi addresses this. I'm unable to search the text directly. He writes of balance.").text).toBe('Shoghi Effendi addresses this. He writes of balance.');
  });
  it('a list item keeps its marker; blockquotes are never touched', () => {
    expect(dropSearchDenial('- First point. I cannot search the library from here.\n- Second.').text).toBe('- First point.\n- Second.');
    const q = '> I cannot search the library from here.\n\nThat line is quoted.';
    expect(dropSearchDenial(q)).toEqual({ text: q, dropped: 0 });
  });
  it('never empties a reply', () => {
    const only = 'I cannot search the library from here.';
    expect(dropSearchDenial(only)).toEqual({ text: only, dropped: 0 });
  });
  it('finalForm applies it at every exit; formPass counts it for the path', () => {
    expect(finalForm('The answer. I cannot search the library from here.')).toBe('The answer.');
    expect(formPass('The answer. I cannot search the library from here.').repairs.search_denial).toBe(1);
  });
});

describe('the prompt rule and the forensics class', () => {
  it('HOUSE_STYLE says Anís can always search and never says otherwise', () => {
    expect(HOUSE_STYLE).toMatch(/NEVER SAY YOU CANNOT SEARCH/);
    expect(HOUSE_STYLE).toMatch(/you can always search the library and any book in it/);
  });
  it('a removed denial (path.form) is counted as the WRITER defect search-denial', () => {
    const turn = turnFromPath({ question: 'q', reply: 'The answer.', path: { recipe: 'topic', form: { search_denial: 1, search_offer: 0 } } });
    const f = forensicPass(turn);
    expect(f.defects).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'WRITER', class: 'search-denial' })]));
    expect(f.defects.find((x) => x.class === 'search-denial').fix_where).toMatch(/lint\.js/);
  });
  it('a clean reply has no such defect', () => {
    const f = forensicPass(turnFromPath({ question: 'q', reply: 'The answer.', path: { recipe: 'topic' } }));
    expect(f.defects.some((x) => x.class === 'search-denial')).toBe(false);
  });
});
