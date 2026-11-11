// 11-11 "Somewhere Abdu'l-Baha mentioned that France and Germany…": Jev's person held the word "Somewhere"; the author filter matched
// nothing and the reply said no passage comes close. The name resolves to the library's author; an empty result researches instead.
import { describe, it, expect } from 'vitest';
import { resolveAuthors, findPassageAnswer } from '../../api/lib/assistant/find-in-work.js';

const LIB = ['‘Abdu’l-Bahá', "Bahá'u'lláh", 'Shoghi Effendi', 'Bahá’í World Centre'];
const msg = [{ role: 'user', content: "Somewhere Abdu'l-Baha mentioned that France and Germany were too big. Can you search for that idea?" }];

describe('the named person → the library author', () => {
  it('finds the author inside a loose wording, or none', () => {
    expect(resolveAuthors(["Somewhere Abdu'l-Baha"], LIB)).toEqual(['‘Abdu’l-Bahá']);
    expect(resolveAuthors(['Shoghi Effendi'], LIB)).toEqual(['Shoghi Effendi']);
    expect(resolveAuthors(['Nobody Known'], LIB)).toEqual([]);
  });
  it('the search runs with the resolved author', async () => {
    let args = null;
    await findPassageAnswer({ messages: msg, authors: ["Somewhere Abdu'l-Baha"], topic: 'France and Germany too big, small local government',
      deps: { quotedSpans: () => [], libraryAuthors: async () => LIB }, search: async (a) => { args = a; return { mode_used: 'meaning', total: 1, passages: [{ excerpt: 'x', url: 'u' }] }; } });
    expect(args.authors).toEqual(['‘Abdu’l-Bahá']);
  });
  it('nothing under the filters → null (research), never "no passage comes close"', async () => {
    const got = await findPassageAnswer({ messages: msg, authors: ['‘Abdu’l-Bahá'], topic: 'France and Germany split',
      deps: { quotedSpans: () => [], libraryAuthors: async () => LIB }, search: async () => ({ mode_used: 'none', total: 0, passages: [] }) });
    expect(got).toBeNull();
  });
});
