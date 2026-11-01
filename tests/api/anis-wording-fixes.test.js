// Fixes from the 11-01 wording battery (857/1207): reading-guide false start, bare names, source-hunt gating, scripture-first origins, link guarantee.
import { describe, it, expect } from 'vitest';
import { planSearch } from '../../api/lib/search-plan.js';
import { extractPhrase } from '../../api/lib/assistant/phrases.js';
import { ensureLinks } from '../../api/lib/assistant/respond.js';
import { readingIntent } from '../../api/lib/assistant/reading.js';

describe('reading guide never starts on a story that merely says "read … with me"', () => {
  it('"Someone read it aloud and it stayed with me" is not "read <book> with me"', () => {
    expect(readingIntent('Last night someone read a line aloud that stuck with me. Which writing is it from?').kind).toBe('none');
    expect(readingIntent('Someone read it aloud and it stayed with me: "The best beloved of all things" - where is it?').kind).toBe('none');
    expect(readingIntent("I'm preparing a talk and my friend read an idea to me that stuck with me").kind).toBe('none');
  });
  it('real start requests still start', () => {
    expect(readingIntent('help me study The Dawn-Breakers').kind).toBe('start');
    expect(readingIntent('read the Kitab-i-Iqan with me').book).toBe('Kitab-i-Iqan');
    expect(readingIntent("let's read Gleanings").kind).toBe('start');
  });
});

import { hasSubstance } from '../../api/lib/assistant/turn.js';
describe('a bare name or title is a lookup, not "unclear"', () => {
  it.each(['Ghoddus', 'Vahid', 'NABIL', 'dawnbreakers', "Babu'l-Bab"])('%s has substance', (t) => expect(hasSubstance(t)).toBe(true));
  it.each(['hi?', 'ok', '??', 'hm'])('%s still does not', (t) => expect(hasSubstance(t)).toBe(false));
});

describe('converse guard', () => {
  const jev = (shape) => async () => ({ ok: true, json: async () => ({ answers: { shape: { choice: shape, confidence: 0.9 } } }) });
  it('"hidden words work" is never small talk', async () => {
    const p = await planSearch('hidden words work', { apiKey: 'k', fetchImpl: jev('converse'), cache: false });
    expect(p.shape).toBe('lookup');
  });
  it('a greeting stays conversation', async () => {
    expect((await planSearch('hello there, how are you', { apiKey: 'k', fetchImpl: jev('converse'), cache: false })).shape).toBe('converse');
  });
});

describe('extractPhrase', () => {
  it('uses the quote-mark phrase without any model call', async () => {
    const r = await extractPhrase('x', { shape: 'quote', quote: { phrase: 'the earth is but one country', via: 'quote-marks' } }, { complete: async () => { throw new Error('no call'); } });
    expect(r).toEqual({ phrase: 'the earth is but one country', via: 'quote-marks' });
  });
  it('asks Haiku for a lookup and strips quotes and a trailing period', async () => {
    const r = await extractPhrase("Could you tell me who Mulla Hosein was in the Bab's story?", { shape: 'lookup' }, { complete: async () => ({ content: '"Mulla Husayn".' }) });
    expect(r).toEqual({ phrase: 'Mulla Husayn', via: 'haiku' });
  });
  it('skips topics, follow-ups, short questions and NONE; never throws', async () => {
    const c = async () => ({ content: 'NONE' });
    expect(await extractPhrase('what about patience in suffering and loss', { shape: 'topic' }, { complete: c })).toBeNull();
    expect(await extractPhrase('where did he say that about the ocean', { shape: 'fact' }, { complete: c })).toBeNull();
    expect(await extractPhrase('when was the Bab martyred in which year', { shape: 'fact' }, { complete: c })).toBeNull();
    expect(await extractPhrase('Who was Quddus', { shape: 'fact' }, { complete: c })).toBeNull();
    expect(await extractPhrase('Who was this person Ghoddus really', { shape: 'fact' }, { complete: c })).toBeNull();
    expect(await extractPhrase('Who was the person Ghoddus really', { shape: 'fact' }, { complete: async () => { throw new Error('x'); } })).toBeNull();
  });
});

describe('ensureLinks', () => {
  const q = [{ source_title: 'Gleanings', citation_url: 'https://oceanlibrary.com/x', text: 'The earth is but one country and mankind its citizens' }];
  it('links a named title in place', () => expect(ensureLinks('It is in Gleanings, by Bahá’u’lláh.', q)).toBe('It is in [Gleanings](https://oceanlibrary.com/x), by Bahá’u’lláh.'));
  it('appends the source when only the wording is quoted', () => expect(ensureLinks('He wrote: the earth is but one country and mankind its citizens.', q)).toContain('Source: [Gleanings](https://oceanlibrary.com/x)'));
  it('leaves a linked reply and unrelated text alone', () => {
    expect(ensureLinks('See [Gleanings](https://oceanlibrary.com/x).', q)).toBe('See [Gleanings](https://oceanlibrary.com/x).');
    expect(ensureLinks('Hello, friend.', q)).toBe('Hello, friend.');
  });
});
