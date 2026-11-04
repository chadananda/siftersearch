// 11-04 taxation letter (mail-1403): the researcher wrote its brief with ZERO searches, the writer said nothing settled the
// question and offered searches it never ran; the Writings never reached it. The class fix: the first research round must
// search, a brief without passages is not research, the authoritative written tier is searched and shown first with each
// passage's standing, and no reply offers a search. Fake model and tools.
import { describe, it, expect } from 'vitest';
import { sourceTier, byTier, hasAuthoritative, tierLabel } from '../../api/lib/assistant/source-tier.js';
import { research, toolRunner, RESEARCH_HOW, RESEARCH_SYSTEM } from '../../api/lib/assistant/researcher.js';
import { HOUSE_STYLE, passageHeader } from '../../api/lib/assistant/prompt.js';
import { LINT, lintReply } from '../../api/lib/assistant/lint.js';
import { authorMatches } from '../../api/lib/search.js';
import { teachingsCheck } from '../../api/lib/assistant/teachings-check.js';

const B = "Baha'i";
const TABLET = { id: 1, title: 'Tablets of Bahá’u’lláh Revealed after the Kitáb-i-Aqdas', author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', text: 'tablet text' };
const SWAB = { id: 2, title: 'Selections from the Writings of ‘Abdu’l-Bahá', author: '‘Abdu’l-Bahá', book_author: '‘Abdu’l-Bahá', religion: B, collection: 'Core Tablets', text: 'written' };
const PARIS = { id: 3, title: 'Paris Talks', author: '‘Abdu’l-Bahá', religion: B, collection: 'Core Talks', text: 'spoken' };
const SAQ = { id: 4, title: 'Some Answered Questions', author: '‘Abdu’l-Bahá', religion: B, collection: 'Core Talks', text: 'table talk' };
const PILGRIM = { id: 5, title: 'Daily Lessons Received at Akka', author: 'Helen Goodall', religion: B, collection: 'Pilgrim Notes', text: 'recalled' };
const GUARDIAN = { id: 6, title: 'The Advent of Divine Justice', author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', religion: B, collection: 'Core Publications', text: 'g' };
const HOUSE = { id: 7, title: 'Messages 1963-1986', author: 'Universal House of Justice', religion: B, collection: 'Administrative', text: 'h' };
const ESSLEMONT = { id: 8, title: 'Bahá’u’lláh and the New Era', author: 'J. E. Esslemont', religion: B, collection: "Baha'i Books", text: 'e' };
const QUOTED = { id: 9, title: 'Bahá’u’lláh and the New Era', author: '‘Abdu’l-Bahá', book_author: 'J. E. Esslemont', religion: B, collection: "Baha'i Books", text: 'q' };
const SPEAKER = { id: 10, title: 'A fireside on economics', author: 'Some Speaker', religion: B, collection: 'Media', text: 'talk' };
const BIBLE = { id: 11, title: 'Matthew', author: 'Matthew', religion: 'Christianity', collection: 'Bible', text: 'render unto Caesar' };

describe('source tier (library metadata only)', () => {
  it('Writings > Shoghi Effendi > reported speech > the House > commentary', () => {
    expect(sourceTier(TABLET)).toBe('writings');
    expect(sourceTier(SWAB)).toBe('writings');
    expect(sourceTier(PARIS)).toBe('reported');      // Chad 11-04: talks are like pilgrims' notes
    expect(sourceTier(SAQ)).toBe('reported');
    expect(sourceTier(PILGRIM)).toBe('reported');
    expect(sourceTier(GUARDIAN)).toBe('guardian');
    expect(sourceTier(HOUSE)).toBe('house');
    expect(sourceTier(ESSLEMONT)).toBe('secondary');
    expect(sourceTier(QUOTED)).toBe('secondary');    // a Central Figure quoted in another writer's book is a pointer
    expect(sourceTier(SPEAKER)).toBe('secondary');
    expect(sourceTier(BIBLE)).toBe(null);            // other traditions keep their own standing
    expect(sourceTier({ web: true, title: 'Web: x' })).toBe(null);
  });
  it('reads the writer passage shape too (source_title / source_author)', () => {
    expect(sourceTier({ source_title: 'Paris Talks', source_author: '‘Abdu’l-Bahá', religion: B, collection: 'Core Talks' })).toBe('reported');
  });
  it('orders by tier, search rank kept within a tier', () => {
    expect(byTier([ESSLEMONT, PARIS, BIBLE, GUARDIAN, TABLET, SWAB]).map((p) => p.id)).toEqual([1, 2, 6, 3, 8, 11]);
    expect(hasAuthoritative([ESSLEMONT, PARIS])).toBe(false);
    expect(hasAuthoritative([ESSLEMONT, GUARDIAN])).toBe(true);
    expect(tierLabel(PARIS)).toMatch(/REPORTED SPEECH/);
  });
});

describe('search: an author LIST filter', () => {
  it('matches any one of the keys (the authoritative pass), as the Qdrant layers do', () => {
    const keys = ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'];
    expect(authorMatches('Bahá’u’lláh', keys)).toBe(true);
    expect(authorMatches('‘Abdu’l-Bahá', keys)).toBe(true);
    expect(authorMatches('J. E. Esslemont', keys)).toBe(false);
    expect(authorMatches('Shoghi Effendi', 'Shoghi')).toBe(true);
  });
});

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

describe('researcher: the authoritative tier first', () => {
  it('a Bahá\'í search with no Writings in its hits searches the Writings alone and shows them first, each head with its standing', async () => {
    const asked = [];
    const { run } = toolRunner({ search: async () => [ESSLEMONT, PARIS, SPEAKER], writings: async (q) => { asked.push(q); return [TABLET, GUARDIAN]; } });
    const out = await run.combined_search({ query: 'consultation majority', tradition: B });
    expect(asked).toEqual(['consultation majority']);
    const heads = out.split('\n').filter((l) => /^\[P\d+\]/.test(l));
    expect(heads[0]).toMatch(/Tablets of Bahá’u’lláh .* WRITINGS/);
    expect(heads[1]).toMatch(/Advent of Divine Justice .* SHOGHI EFFENDI/);
    expect(heads[2]).toMatch(/Paris Talks .* REPORTED SPEECH/);
    expect(heads.at(-1)).toMatch(/SECONDARY/);
  });
  it('no extra pass when the Writings are already there, or for another tradition', async () => {
    let n = 0;
    const w = async () => { n++; return [TABLET]; };
    await toolRunner({ search: async () => [SWAB, ESSLEMONT], writings: w }).run.combined_search({ query: 'x', tradition: B });
    await toolRunner({ search: async () => [BIBLE], writings: w }).run.combined_search({ query: 'x', tradition: 'Christianity' });
    expect(n).toBe(0);
  });
  it('the first round must call the library; a brief with no passages is not research (mail-1403: steps [])', async () => {
    const seen = [];
    const create = async (params) => { seen.push(params); return { choices: [{ message: { content: 'BRIEF:\nReaching for: taxation\n- nothing settles it [own]\nKEEP:' } }] }; };
    const r = await research({ messages: [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'what is the evidence?' }], create, tools: { search: async () => [] } });
    expect(seen[0].tool_choice).toBe('required');
    expect(r).toBe(null);   // the routed pipeline answers instead
  });
  it('later rounds may stop and write the brief', async () => {
    const seen = [];
    const replies = [{ tool_calls: [call('a', 'combined_search', { query: 'q', tradition: B })] }, { content: 'BRIEF:\nReaching for: x\n- y: P1\nKEEP: P1' }];
    const r = await research({ messages: [{ role: 'user', content: 'q' }], create: async (p) => { seen.push(p); return { choices: [{ message: replies.shift() }] }; },
      tools: { search: async () => [TABLET] } });
    expect(seen.map((p) => p.tool_choice)).toEqual(['required', 'auto']);
    expect(r.passages.map((p) => p.id)).toEqual([1]);
  });
});

describe('writer: what the texts DO say, at their standing; never an offer to search', () => {
  it('the prompts say so', () => {
    expect(HOUSE_STYLE).toMatch(/NEVER OFFER A SEARCH YOU COULD RUN/);
    expect(HOUSE_STYLE).toMatch(/WHAT THE TEXTS DO SAY COMES FIRST/);
    const how = RESEARCH_HOW('Reaching for: x');
    expect(how).not.toMatch(/Never volunteer what could not be found/);
    expect(how).toMatch(/never an offer to search/);
    expect(how).toMatch(/DO say first/);
    expect(RESEARCH_SYSTEM).toMatch(/FOLLOW-UP that disputes/);
    expect(RESEARCH_SYSTEM).toMatch(/Writings of Bahá'u'lláh, the Báb and 'Abdu'l-Bahá first/);
  });
  it('the writer\'s passage head carries the standing (unless a pipeline set one)', () => {
    const w = (p) => ({ ...p, source_title: p.title, source_author: p.author });
    expect(passageHeader(w(PARIS), 0)).toMatch(/REPORTED SPEECH/);
    expect(passageHeader(w(TABLET), 0)).toMatch(/WRITINGS/);
    expect(passageHeader(w(BIBLE), 0)).not.toMatch(/WRITINGS|SECONDARY|REPORTED/);
    expect(passageHeader({ ...w(PARIS), standing: 'doctrine' }, 0)).not.toMatch(/REPORTED SPEECH/);
  });
  it('lint flags a search offer in the reply', () => {
    const re = LINT.find((x) => x.id === 'search-offer').re;
    expect(re.test('If you like, I can search the tablets of Bahá’u’lláh for more.')).toBe(true);
    expect(re.test('Would you like me to look for the Persian original?')).toBe(true);
    expect(re.test('If you like, read the Tablet of Wisdom next.')).toBe(false);
    expect(lintReply('I could also search the Kitáb-i-Aqdas for this.').map((h) => h.id)).toContain('search-offer');
  });
});

describe('battery: the teachings class check', () => {
  it('passes only with the Writings cited, talks named as spoken, and no offer', () => {
    expect(teachingsCheck({ text: 'In a talk recorded in *Paris Talks*…', cited: [{ tier: 'writings' }, { tier: 'reported' }] }).pass).toBe(true);
    expect(teachingsCheck({ text: '…', cited: [{ tier: 'secondary' }] }).writings).toBe(false);
    expect(teachingsCheck({ text: 'He explains…', cited: [{ tier: 'writings' }, { tier: 'reported' }] }).reported_labelled).toBe(false);
    expect(teachingsCheck({ text: 'If you like, I can search the tablets.', cited: [{ tier: 'writings' }] }).no_offer).toBe(false);
  });
});
