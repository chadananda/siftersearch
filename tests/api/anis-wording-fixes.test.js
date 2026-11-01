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

// r3 (11-01): a named person/work is a lookup whatever the frame; "which religions are in the library" is a catalogue fact.
import { objectPhrases, nameMatches, resolveNamed } from '../../api/lib/named-object.js';
import { applyObjectRules, libraryQuestion } from '../../api/lib/search-plan.js';
import { religionsReply } from '../../api/lib/assistant/library-facts.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';

describe('named object', () => {
  it('strips the request frame and keeps the name', () => {
    expect(objectPhrases('where can I find the passages that mention Ghoddus?')[0].phrase).toBe('Ghoddus');
    expect(objectPhrases('hiden words by shoghi efendi').map((o) => o)).toContainEqual({ phrase: 'hiden words', workOnly: true });
    expect(objectPhrases("can u find the text 'Most Holy Book'").map((o) => o.phrase)).toContain('Most Holy Book');
    expect(objectPhrases('some answerd questions where')[0].phrase).toBe('some answerd questions');
  });
  it('a central figure tacked onto a work is an attribution, not part of the title', () => {
    expect(objectPhrases('Hidden Words Shoghi Effendi')).toContainEqual({ phrase: 'Hidden Words', workOnly: true });
    expect(objectPhrases('paris talks bahaullah')).toContainEqual({ phrase: 'paris talks', workOnly: true });
    // small words do not count toward the six-word name limit
    expect(objectPhrases('where is the text of the Hidden Words by Shoghi Effendi')).toContainEqual({ phrase: 'Hidden Words', workOnly: true });
  });
  it('a person\'s name words keep their order; a title\'s need not', () => {
    expect(nameMatches('Siyyid Ali-Muhammad of Shiraz', 'Mírzá Muḥammad-‘Alí Khán-i-Shírází', { ordered: true })).toBe(false);
    expect(nameMatches('Siyyid Ali-Muhammad', 'Siyyid ‘Alí-Muḥammad', { ordered: true })).toBe(true);
    expect(nameMatches('paris talks', 'Talks In Paris')).toBe(true);
  });
  it('prefers the person when a person and a work both fit', async () => {
    const lookup = async () => [{ type: 'work', id: 1, name: 'Qurratu’l-‘Ayn: Shā‘ir-i Millī' }, { type: 'person', id: 2, name: 'Qurratu’l-‘Ayn' }];
    expect(await resolveNamed("qurratu'l-'ayn who was she", { lookup })).toMatchObject({ type: 'person', id: 2 });
  });
  it('a name the graph knows only as an ALIAS resolves to its bearer (r4: Bábu\'l-Báb is Mullá Ḥusayn)', async () => {
    const lookup = async () => [
      { type: 'person', id: 64, name: 'Mullá Ḥusayn', surfaces: ["Bábu'l-Báb"] },
      { type: 'person', id: 51, name: 'The Báb', surfaces: [] },
    ];
    expect(await resolveNamed("who was the Babul-Bab", { lookup })).toMatchObject({ type: 'person', id: 64, name: 'Mullá Ḥusayn' });
    const given = async () => [{ type: 'person', id: 62, name: 'Bahá’u’lláh', surfaces: ['Mírzá Ḥusayn-‘Alí of Núr'] }];
    expect(await resolveNamed('Mirza Husayn-Ali of Nur', { lookup: given })).toMatchObject({ id: 62 });
    // an alias does not loosen the match: one word per name word, in order for a person
    expect(await resolveNamed('Ali-Husayn', { lookup: given })).toBeNull();
  });
  it('a long sentence is no name', () => expect(objectPhrases('the earth is but one country and mankind its citizens forever and ever')).toEqual([]));
  it('matches spelling variants word for word', () => {
    expect(nameMatches('mulla hosein', 'Mullá Ḥusayn')).toBe(true);
    expect(nameMatches('bok of certitude', 'Book of Certitude')).toBe(true);
    expect(nameMatches('Paris Talks', 'Talks In Paris')).toBe(true);
  });
  it('rejects loose skeleton matches', () => {
    expect(nameMatches('nirvana', 'Nurayn-i-Nayyirayn')).toBe(false);
    expect(nameMatches('nirvana', 'Núrániyya')).toBe(false);
    expect(nameMatches('peace', 'Pope Pius IX')).toBe(false);
  });
  it('resolveNamed: first matching person/work; a concept of exactly that name wins; never throws', async () => {
    const db = {
      ghoddus: [{ id: 1, name: 'Quddús', type: 'person' }],
      nirvana: [{ id: 2, name: 'Nirvana', type: 'concept' }, { id: 3, name: 'Núrániyya', type: 'work' }],
      vahid: [{ id: 4, name: 'Vaḥíd', type: 'person' }, { id: 5, name: 'Vahid', type: 'concept' }],
    };
    const lookup = async (q) => db[q.toLowerCase()] || [];
    expect(await resolveNamed('where is Ghoddus discussed', { lookup })).toEqual({ type: 'person', id: 1, name: 'Quddús', matched: 'Ghoddus' });
    expect(await resolveNamed('what is nirvana', { lookup })).toBeNull();
    expect((await resolveNamed('Vahid', { lookup }))?.id).toBe(4);
    expect(await resolveNamed('Vahid', { lookup: async () => { throw new Error('down'); } })).toBeNull();
  });
});

describe('object rules', () => {
  const p = (shape) => ({ shape, about: 'texts', source: { shape: 'jev' } });
  const person = { type: 'person', id: 1, name: 'Quddús', matched: 'Ghoddus' };
  const work = { type: 'work', id: 9, name: 'Most Holy Book', matched: 'Most Holy Book' };
  it('a named person asked for quotes or a list is a lookup; a fact or definition about him stays', () => {
    expect(applyObjectRules(p('quote'), 'quotes by Ghoddus', person)).toMatchObject({ shape: 'lookup', named: person, overridden: { shape: 'quote', by: 'name-rule' } });
    expect(applyObjectRules(p('enumerate'), 'Ghoddus mentions', person).shape).toBe('lookup');
    expect(applyObjectRules(p('fact'), 'who was Ghoddus', person).shape).toBe('fact');
  });
  it('a named work is always the item itself', () => {
    expect(applyObjectRules(p('fact'), 'what is the Most Holy Book', work).shape).toBe('lookup');
    expect(applyObjectRules(p('source'), 'Most Holy Book source', work).shape).toBe('lookup');
  });
  it('the quote rule outranks the name rule', () => {
    const q = { ...p('quote'), source: { shape: 'quote-rule' } };
    expect(applyObjectRules(q, '"Ghoddus"', person)).toBe(q);
  });
  it.each(['which religions are in the library', 'wich relgions r in teh libary', 'hey whats the list of religons in the libray',
    'library religions list', 'I wonder if you could let me know which religions the library covers. Thank you!'])('%s → library fact', (t) => {
    expect(libraryQuestion(t)).toBe('religions');
    expect(applyObjectRules(p('enumerate'), t, null)).toMatchObject({ shape: 'fact', library: 'religions' });
  });
  it.each(['what do the religions in the library say about suffering', 'I was at the library reading about the religions of India and the Buddha and his teaching on suffering'])('%s is not', (t) => expect(libraryQuestion(t)).toBeNull());
  it('planSearch applies the name rule with an injected resolver (Jev said quote)', async () => {
    const jev = async () => ({ ok: true, json: async () => ({ answers: { shape: { choice: 'quote', confidence: 0.9 } } }) });
    const r = await planSearch('find quotes by Ghoddus', { apiKey: 'k', fetchImpl: jev, cache: false, resolveName: async () => person });
    expect(r).toMatchObject({ shape: 'lookup', named: person });
  });
});

describe('respond: library facts and named objects', () => {
  const base = (over = {}) => {
    const calls = { search: [], hunt: 0, phrases: 0 };
    return { calls, search: async (a) => { calls.search.push(a); return { passages: [], _plan: { shape: 'lookup' } }; },
      craft: async () => 'ok', companion: async () => ({}), sourceHunt: async () => { calls.hunt++; return null; },
      phrases: async () => { calls.phrases++; return null; }, ...over };
  };
  it('religionsReply lists traditions by size, drops filing slugs, invents nothing', () => {
    const r = religionsReply({ religionCounts: { "Baha'i": 67581, Buddhist: 859, 'collection-08': 12, Tao: 96 } });
    expect(r).toContain('3 religious traditions');
    expect(r.indexOf('Bahá’í')).toBeLessThan(r.indexOf('Buddhism'));
    expect(r).not.toContain('collection-08');
    expect(religionsReply({ religionCounts: {} })).toBeNull();
  });
  it('a library question is answered from the stats with no search', async () => {
    const d = base({ plan: async () => ({ shape: 'fact', library: 'religions' }), libraryStats: async () => ({ religionCounts: { Islam: 489, Hindu: 126 } }) });
    const r = await anisRespond({ messages: [{ role: 'user', content: 'which religions are in the library' }], deps: d });
    expect(d.calls.search).toHaveLength(0);
    expect(r.reply).toContain('Islam');
    expect(r.plan).toMatchObject({ shape: 'fact', library: 'religions' });
  });
  it('a named work is searched by its library name, never source-hunted, no phrase model call', async () => {
    const named = { type: 'work', id: 9, name: 'Most Holy Book', matched: 'most holy book' };
    const d = base({ plan: async () => ({ shape: 'lookup', named }) });
    const r = await anisRespond({ messages: [{ role: 'user', content: 'most holy book source' }], deps: d, direction: { kind: 'source_lookup' } });
    expect(d.calls.hunt).toBe(0);
    expect(d.calls.phrases).toBe(0);
    expect(d.calls.search[0].query).toBe('Most Holy Book');
    expect(r.plan.phrases).toMatchObject({ phrase: 'most holy book', via: 'name-rule' });
  });
  it('a named person is searched in the seeker\'s spelling (the graph\'s label can be a poor one: "Quarratul-Ayn")', async () => {
    const named = { type: 'person', id: 7, name: 'Quarratul-Ayn', matched: "Qurratu'l-'Ayn" };
    const d = base({ plan: async () => ({ shape: 'lookup', named }) });
    await anisRespond({ messages: [{ role: 'user', content: "Qurratu'l-'Ayn" }], deps: d });
    expect(d.calls.search[0].query).toBe("Qurratu'l-'Ayn");
  });
});

import { rankOrigins } from '../../api/lib/source-hunt.js';
describe('source hunt: a tradition the seeker names', () => {
  const bahai = { id: 1, religion: "Baha'i", holds: true, overlap: 0.9, writer: '‘Abdu’l-Bahá', ownWork: true, authority: 3 };
  const dhamma = { id: 2, religion: 'Buddhist', holds: true, overlap: 0.4 };
  const psalm = { id: 3, religion: 'Christian', holds: true, overlap: 0.5 };
  it('ranks a holding passage of that tradition first, even when paraphrased', () => {
    expect(rankOrigins([bahai, dhamma], null, 'Buddhist')[0].id).toBe(2);
    expect(rankOrigins([bahai, psalm], null, 'Judaism')[0].id).toBe(3);   // the Psalms sit under either shelf
    expect(rankOrigins([bahai, dhamma])[0].id).toBe(1);                   // no hint → unchanged
  });
  it('respond: "the Buddha said …" with only a Bahá\'í origin falls through to the search', async () => {
    const calls = { search: 0, opts: null };
    const d = { search: async () => { calls.search++; return { passages: [], _plan: { shape: 'quote' } }; }, craft: async () => 'ok', companion: async () => ({}),
      plan: async () => ({ shape: 'quote' }), phrases: async () => null,
      sourceHunt: async (q, _d, opts) => { calls.opts = opts; return { origin: { religion: "Baha'i", title: 'Abdu’l-Bahá in London', text: 'x' }, citedBy: [] }; } };
    const r = await anisRespond({ messages: [{ role: 'user', content: 'where does the Buddha say that hatred is never ended by more hatred' }], deps: d, direction: { kind: 'source_lookup' } });
    expect(calls.opts).toEqual({ religion: 'Buddhist' });
    expect(calls.search).toBe(1);
    expect(r.plan?.shape).not.toBe('source');
  });
  it('respond: a founder named as the speaker ("Jesus said …") is that tradition — a Bahá\'í biography is not where He said it', async () => {
    const calls = { search: 0, opts: null };
    const d = { search: async () => { calls.search++; return { passages: [], _plan: { shape: 'quote' } }; }, craft: async () => 'ok', companion: async () => ({}),
      plan: async () => ({ shape: 'quote' }), phrases: async () => null,
      sourceHunt: async (q, _d, opts) => { calls.opts = opts; return { origin: { religion: "Baha'i", title: "Love's Odyssey", text: 'x' }, citedBy: [] }; } };
    const r = await anisRespond({ messages: [{ role: 'user', content: 'Could you please help me find where Jesus said God helps those who help themselves?' }], deps: d, direction: { kind: 'source_lookup' } });
    expect(calls.opts).toEqual({ religion: 'Christian' });
    expect(calls.search).toBe(1);
    expect(r.plan?.shape).not.toBe('source');
  });
});
import { speakerTradition } from '../../api/lib/search-plan.js';
describe('speakerTradition: the tradition a named founder or scripture belongs to', () => {
  it('maps founders and scriptures, leaves Bahá\'í and unnamed questions alone', () => {
    expect(speakerTradition('jesus said god helps those who help themselves')).toBe('Christian');
    expect(speakerTradition('check the gospels for the verse')).toBe('Christian');
    expect(speakerTradition('where did the Prophet Muhammad say seek knowledge')).toBe('Islam');
    expect(speakerTradition('Krishna tells Arjuna to act')).toBe('Hindu');
    expect(speakerTradition('Lao Tzu said the journey of a thousand miles')).toBe('Tao');
    expect(speakerTradition('where is the Buddha quoted')).toBe('Buddhist');
    expect(speakerTradition('Bahá’u’lláh says the earth is but one country')).toBeUndefined();
    expect(speakerTradition('where is this from: the earth is but one country')).toBeUndefined();
  });
});
