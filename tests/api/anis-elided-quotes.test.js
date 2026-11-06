// A quotation with "…" inside it that bridges words its passage holds is a clipped, stitched Writing (11-04 digest #161, #138).
// Code restores the passage's own contiguous words, keeps its typos, and ends at a sentence end. Fresh class examples, not the
// evidence turns alone.
import { describe, it, expect } from 'vitest';
import { restoreElisions, wholeQuote, ELIDED_GAP_WORDS, unverifiedQuotes } from '../../api/lib/assistant/quotes.js';

const hidden = { text: 'O Son of Spirit! My first counsel is this: Possess a pure, kindly and radiant heart, that thine may be a sovereignty ancient, imperishable and everlasting.' };
const letter = { text: 'Whatever the progress of the machinery may be, man will always have to toil in order to earn his living. Effort is an inseparable part of man\'s life. Life is, after all, a struggle Progress is attained through struggle, and without such a struggle, life ceases to have a meaning; it becomes even extinct. The progress of machinery has not made effort unnecessary.' };
const iqan = { text: 'Thus it is that in every age and dispensation the people have turned away from the Manifestations. They that tread the path of faith must first cleanse themselves of all that is earthly—their ears from idle talk, their minds from vain imaginings, their hearts from worldly affections, their eyes from that which perisheth.' };
const filler = Array.from({ length: ELIDED_GAP_WORDS + 10 }, (_, i) => `word${i}`).join(' ');
const long = { text: `The first sentence sets the scene for what follows here. ${filler}. The well-being of mankind, its peace and security, are unattainable unless and until its unity is firmly established.` };

describe('wholeQuote — the passage\'s own contiguous words', () => {
  it('fills an interior ellipsis with the words it bridged (Hidden Words class)', () => {
    expect(wholeQuote('My first counsel is this … that thine may be a sovereignty ancient, imperishable and everlasting', [hidden]))
      .toBe('My first counsel is this: Possess a pure, kindly and radiant heart, that thine may be a sovereignty ancient, imperishable and everlasting.');
  });
  it('keeps the source\'s own typo instead of an ellipsis repair (a missing period)', () => {
    expect(wholeQuote('Life is, after all, a struggle… Progress is attained through struggle, and without such a struggle, life ceases to have a meaning', [letter]))
      .toBe('Life is, after all, a struggle Progress is attained through struggle, and without such a struggle, life ceases to have a meaning; it becomes even extinct.');
  });
  it('a trailing ellipsis runs on to the sentence end, never ends in a clip', () => {
    expect(wholeQuote('They that tread the path of faith must first cleanse themselves …', [iqan]))
      .toBe('They that tread the path of faith must first cleanse themselves of all that is earthly—their ears from idle talk, their minds from vain imaginings, their hearts from worldly affections, their eyes from that which perisheth.');
  });
  it('a bridge too long to fill: starts at the sentence of the part the reader asked about, no ellipsis', () => {
    const r = wholeQuote('The first sentence sets the scene … its peace and security, are unattainable unless and until its unity is firmly established', [long],
      { asked: ['where does "its peace and security, are unattainable" come from'] });
    expect(r).toBe('The well-being of mankind, its peace and security, are unattainable unless and until its unity is firmly established.');
    expect(r).not.toMatch(/…|\.\.\./);
  });
  it('parts held by no single passage, or out of order, are left alone (the unverified gate decides)', () => {
    expect(wholeQuote('My first counsel is this … Effort is an inseparable part of man\'s life', [hidden, letter])).toBeNull();
    expect(wholeQuote('that thine may be a sovereignty … My first counsel is this', [hidden])).toBeNull();
  });
  it('no ellipsis → nothing to do', () => {
    expect(wholeQuote('My first counsel is this', [hidden])).toBeNull();
  });
});

describe('restoreElisions — on a reply', () => {
  it('rewrites only the elided spans, inline and in a blockquote, and the result verifies', () => {
    const reply = [
      'The counsel opens: *"My first counsel is this … that thine may be a sovereignty ancient, imperishable and everlasting."*',
      '',
      '> "Whatever the progress of the machinery may be, man will always have to toil in order to earn his living. … Life is, after all, a struggle… Progress is attained through struggle"',
      '> — [Letters](https://example.org/l)',
      '',
      'He also says *"Effort is an inseparable part of man\'s life."*',
    ].join('\n');
    const { text, restored } = restoreElisions(reply, [hidden, letter]);
    expect(restored).toBe(2);
    expect(text).toContain('"My first counsel is this: Possess a pure, kindly and radiant heart, that thine may be a sovereignty ancient, imperishable and everlasting."');
    expect(text).toContain('> "Whatever the progress of the machinery may be, man will always have to toil in order to earn his living. Effort is an inseparable part of man\'s life. Life is, after all, a struggle Progress is attained through struggle, and without such a struggle, life ceases to have a meaning; it becomes even extinct."');
    expect(text).toContain('*"Effort is an inseparable part of man\'s life."*');
    expect(unverifiedQuotes(text, [hidden, letter])).toEqual([]);
  });
  it('an ellipsis the source itself carries stays verbatim', () => {
    const src = { text: 'Say: O people … be ye as the fingers of one hand, the members of one body.' };
    expect(restoreElisions('*"Say: O people … be ye as the fingers of one hand"*', [src]).text)
      .toBe('*"Say: O people … be ye as the fingers of one hand, the members of one body."*');
  });
  it('leaves a quotation no passage holds untouched', () => {
    const t = '"An invented line here … and another invented line there"';
    expect(restoreElisions(t, [hidden, letter])).toEqual({ text: t, restored: 0 });
  });
});

// clipped-quote residual (11-05): the prayer strategy's "Two more" names each prayer by its opening words, written as a linked
// incipit ending in "…". The quote sits inside the link text; it runs on to its sentence end and the link survives. Fresh prayer.
describe('restoreElisions — a linked incipit ("Two more" prayers)', () => {
  const prayer = { text: 'O Thou kind Lord! Unite all. Let the religions agree and make the nations one, so that they may see each other as one family and the whole earth as one home.' };
  it('the incipit becomes its whole first sentence, the URL untouched', () => {
    const t = '- ["O Thou kind Lord! Unite all. Let the religions agree…"](https://oceanlibrary.com/prayers/?paraId=para_41)';
    const { text, restored } = restoreElisions(t, [prayer]);
    expect(restored).toBe(1);
    expect(text).toBe('- ["O Thou kind Lord! Unite all. Let the religions agree and make the nations one, so that they may see each other as one family and the whole earth as one home."](https://oceanlibrary.com/prayers/?paraId=para_41)');
    expect(text).not.toMatch(/…/);
  });
});
