// The trailing search offer is stripped, not just logged (11-04 digest #163). Fresh offer wordings across the class, plus
// the sentences that must survive: findings, absences, reading offers, and offers quoted from the texts.
import { describe, it, expect } from 'vitest';
import { isSearchOffer, dropSearchOffer, lintReply } from '../../api/lib/assistant/lint.js';
import { workOffer } from '../../api/lib/assistant/work-request.js';

const OFFERS = [
  "I can look up the section number in Gleanings if you'd like.",
  'I can look for the date and recipient of the letter if you want them.',
  'Would you like me to trace where this phrase first appears?',
  'If you wish, I could also check the Persian original for this word.',
  'Shall I find the other talks where He uses this image?',
  'Do you want me to pull up the full Tablet?',
  "I'd be glad to dig further into the commentaries on this verse.",
  'I could search the compilations on consultation next.',
];
const NOT_OFFERS = [
  'This is all I could find in the letters of the Guardian.',
  'I could find no letter that names the recipient.',
  'If you like, read the Tablet of Wisdom next.',
  'He wrote that we should search our own hearts.',
  'The passage appears in Gleanings, section CXXXII.',
];

describe('isSearchOffer', () => {
  it.each(OFFERS)('flags: %s', (s) => expect(isSearchOffer(s)).toBe(true));
  it.each(NOT_OFFERS)('leaves: %s', (s) => expect(isSearchOffer(s)).toBe(false));
  it('the reading offer is not a search offer', () => {
    expect(isSearchOffer(workOffer({ doc: { title: 'The Kitáb-i-Íqán' } }))).toBe(false);
  });
  it('words inside a quotation are the texts, not an offer', () => {
    expect(isSearchOffer('He said: "Shall I look for him among the stars?"')).toBe(false);
  });
  it('lintReply still names it', () => {
    expect(lintReply(OFFERS[1]).map((x) => x.id)).toContain('search-offer');
  });
});

describe('dropSearchOffer — blocking', () => {
  const body = 'The line comes from a letter written on behalf of Shoghi Effendi. It speaks of effort as the condition of progress.';
  it.each(OFFERS)('strips the trailing offer: %s', (offer) => {
    const { text, dropped } = dropSearchOffer(`${body} ${offer}`);
    expect(dropped).toBe(1);
    expect(text).toBe(body);
  });
  it('an offer standing as its own last paragraph goes, with a "Just ask." after it', () => {
    const { text } = dropSearchOffer(`${body}\n\n${OFFERS[2]} Just ask.`);
    expect(text).toBe(body);
  });
  it('an offer mid-reply (not the sign-off) is left; the lint still logs it', () => {
    const t = `${OFFERS[0]} ${body}`;
    expect(dropSearchOffer(t)).toEqual({ text: t, dropped: 0 });
  });
  it('never touches a blockquote or a list, and never empties a reply', () => {
    const quoted = `${body}\n\n> "Shall I find thee in the garden?"`;
    expect(dropSearchOffer(quoted).text).toBe(quoted);
    expect(dropSearchOffer(OFFERS[3])).toEqual({ text: OFFERS[3], dropped: 0 });
  });
  it('a reply without an offer is returned as is', () => {
    expect(dropSearchOffer(body)).toEqual({ text: body, dropped: 0 });
  });
});
