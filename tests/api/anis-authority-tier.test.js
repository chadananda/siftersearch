// 11-04 taxation letter (mail-1403): the researcher wrote its brief with ZERO searches, the writer said nothing settled the
// question and offered searches it never ran; the Writings never reached it. The class fix: the first research round must
// search, a brief without passages is not research, the authoritative written tier is searched and shown first with each
// passage's standing, and no reply offers a search. Fake model and tools.
import { describe, it, expect } from 'vitest';
import { sourceTier, byTier, hasAuthoritative, tierLabel, NO_AUTHORED_ORIGINAL } from '../../api/lib/assistant/source-tier.js';
import { hasNoAuthoredOriginal } from '../../api/lib/rag/concepts/source-survey.js';
import { research, toolRunner, RESEARCH_HOW, RESEARCH_SYSTEM, ORIGINALS_QUOTA, isOriginalLanguage } from '../../api/lib/assistant/researcher.js';
import { HOUSE_STYLE, passageHeader } from '../../api/lib/assistant/prompt.js';
import { LINT, lintReply } from '../../api/lib/assistant/lint.js';
import { authorMatches } from '../../api/lib/search.js';
import { teachingsCheck, originalsSearched } from '../../api/lib/assistant/teachings-check.js';

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
    expect(sourceTier(SAQ)).toBe('writings');   // reviewed and corrected by 'Abdu'l-Bahá (Chad 11-04)
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

// reported works whose titles don't say "talk", in a collection that doesn't either (Chad 11-04 brief)
const book = (title, author = '‘Abdu’l-Bahá') => ({ title, author, book_author: author, religion: B, collection: "Baha'i Books", text: 'x' });
describe('source tier: the talk books are reported speech (by title); Some Answered Questions is authoritative', () => {
  it('Promulgation, London, Divine Philosophy, Foundations, Paris Talks → reported; written works and SAQ stay Writings', () => {
    expect(sourceTier(book('Some Answered Questions'))).toBe('writings');
    expect(tierLabel(book('The Promulgation of Universal Peace'))).toMatch(/imperfect rendering.*partially understood/);
    for (const t of ['The Promulgation of Universal Peace', '‘Abdu’l-Bahá in London', 'Divine Philosophy', 'Foundations of World Unity', 'Paris Talks'])
      expect(sourceTier(book(t)), t).toBe('reported');
    expect(sourceTier(book('Words to Mr Pinchot and others, spoken at his estate outside Milford on 1912-Jun-04'))).toBe('reported');
    expect(sourceTier(book('Tablets of the Divine Plan'))).toBe('writings');
    expect(sourceTier(book('Selections from the Writings of ‘Abdu’l-Bahá'))).toBe('writings');
    expect(sourceTier(book('Some Answered Questions', 'Laura Clifford Barney'))).toBe('secondary');   // only a Central Figure's words are "reported"
    expect(tierLabel(book('Some Answered Questions'))).toMatch(/^WRITINGS .*reviewed and corrected himself/);
  });
  it('one list: source-survey reads the no-authored-original works from source-tier', () => {
    expect(NO_AUTHORED_ORIGINAL).toHaveLength(3);
    expect(hasNoAuthoredOriginal('Paris Talks')).toBe(true);
    expect(hasNoAuthoredOriginal('Some Answered Questions')).toBe(false);   // SAQ has a Persian original (Mufávaḍát)
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

// the original-language quota (11-04, measured: English queries put no Persian/Arabic Writing in the fused top 8)
const ORIG_FA = { id: 21, title: 'Lawh-i-Ahl-i-Tharvat', author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', language: 'fa', document_id: 70, text: 'ای اهل ثروت و قدرت' };
const ORIG_AR = { id: 22, title: 'Súriy-i-Haykal', author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', language: 'ar', document_id: 71, text: 'انا نراکم فی کل سنة تزدادون مصارفکم' };
const TRANS_AR = { id: 23, title: 'The Summons of the Lord of Hosts', author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', language: 'en', text: 'We see you increasing every year your expenditures', translation: 'authorized — Bahá’í World Centre' };
const english = (n) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, title: `English ${i}`, author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', text: `en ${i}` }));
describe('researcher: the Writings in their original languages beside the English (per-language quota)', () => {
  it('a Bahá\'í search keeps up to the quota of originals, each with its linked translation or marked provisional', async () => {
    const asked = [];
    const { run } = toolRunner({ search: async () => english(8), originals: async (q) => { asked.push(q); return [ORIG_FA, ORIG_AR, english(1)[0]]; },
      translationsOf: async (ids) => new Map(ids.map((id) => [id, id === 22 ? [TRANS_AR] : []])) });
    const out = await run.combined_search({ query: 'taxes burden on subjects', tradition: B });
    expect(asked).toEqual(['taxes burden on subjects']);   // the same words, no rewriting
    const heads = out.split('\n').filter((l) => /^\[P\d+\]/.test(l));
    expect(heads.find((h) => /Tharvat/.test(h))).toMatch(/\(fa\) .*ORIGINAL — no linked translation: .*provisional translation by Anís/);
    const haykal = heads.find((h) => /Haykal/.test(h));
    const tref = haykal.match(/linked translation is (P\d+)/)[1];
    expect(heads.find((h) => h.startsWith(`[${tref}]`))).toMatch(/EXISTING TRANSLATION: authorized/);
    expect(heads.filter((h) => /English \d/.test(h))).toHaveLength(10 - 2);   // the English cut to make room for the originals
    expect(ORIGINALS_QUOTA).toBe(3);
  });
  it('an original with its own inline English (no aligned translation) shows that English as its translation', async () => {
    const { run } = toolRunner({ search: async () => [], originals: async () => [{ ...ORIG_FA, english: 'O people of wealth and power' }], translationsOf: async () => new Map() });
    const out = await run.originals_search({ query: 'wealth' });
    expect(out).toMatch(/ORIGINAL — its linked translation is P2/);
    expect(out).toMatch(/\[P2\][^\n]*EXISTING TRANSLATION: translation\nO people of wealth and power/);
  });
  it('no originals pass for another tradition; originals_search runs it alone', async () => {
    let n = 0;
    const { run } = toolRunner({ search: async () => [BIBLE], originals: async () => { n++; return [ORIG_AR]; } });
    await run.combined_search({ query: 'x', tradition: 'Christianity' });
    expect(n).toBe(0);
    expect(await run.originals_search({ query: 'kings' })).toMatch(/Haykal .*\(ar\).*ORIGINAL/);
    expect(isOriginalLanguage({ language: 'Fa' }) && isOriginalLanguage({ language: 'ara' }) && !isOriginalLanguage({ language: 'en' })).toBe(true);
  });
  it('each research step records how many originals it showed (the battery reads this, never the reply)', async () => {
    const replies = [{ tool_calls: [call('a', 'combined_search', { query: 'consultation', tradition: B })] }, { content: 'BRIEF:\nReaching for: x\n- y: P1\nKEEP: P1' }];
    const r = await research({ messages: [{ role: 'user', content: 'q' }], create: async () => ({ choices: [{ message: replies.shift() }] }),
      tools: { search: async () => [TABLET], originals: async () => [ORIG_FA] } });
    expect(r.steps[0]).toMatchObject({ tool: 'combined_search', found: 2, originals: 1 });
  });
  it('the writer\'s head for an original says what to quote; the prompts say it too', () => {
    expect(passageHeader({ ...ORIG_FA, source_title: ORIG_FA.title, source_author: ORIG_FA.author, source_lang: 'fa' }, 0)).toMatch(/ORIGINAL \(fa\) .*provisional translation by Anís/);
    expect(passageHeader({ ...TRANS_AR, source_title: TRANS_AR.title, source_author: TRANS_AR.author, source_lang: 'en' }, 0)).not.toMatch(/ORIGINAL \(/);
    expect(RESEARCH_HOW('x')).toMatch(/provisional translation by Anís/);
    expect(RESEARCH_SYSTEM).toMatch(/original Persian and Arabic too/);
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
  it('originals_searched: from the research steps or a cited original, never the reply', () => {
    expect(originalsSearched({ research: { steps: [{ tool: 'combined_search', found: 8 }] } })).toBe(false);
    expect(originalsSearched({ research: { steps: [{ tool: 'originals_search', found: 0 }] } })).toBe(true);
    expect(originalsSearched({ research: { steps: [{ tool: 'combined_search', found: 9, originals: 1 }] } })).toBe(true);
    expect(originalsSearched({ cited: [{ tier: 'writings', language: 'ar' }] })).toBe(true);
    expect(originalsSearched({ text: 'in the original Arabic…', cited: [{ tier: 'writings', language: 'en' }] })).toBe(false);
  });
  it('passes only with the Writings cited, talks named as spoken, and no offer', () => {
    const steps = [{ tool: 'combined_search', found: 9, originals: 2 }];
    expect(teachingsCheck({ text: 'In a talk recorded in *Paris Talks*…', cited: [{ tier: 'writings' }, { tier: 'reported' }], research: { steps } }).pass).toBe(true);
    expect(teachingsCheck({ text: 'In a talk recorded in *Paris Talks*…', cited: [{ tier: 'writings' }, { tier: 'reported' }] }).pass).toBe(false);   // no original-language search
    expect(teachingsCheck({ text: '…', cited: [{ tier: 'secondary' }] }).writings).toBe(false);
    expect(teachingsCheck({ text: 'He explains…', cited: [{ tier: 'writings' }, { tier: 'reported' }] }).reported_labelled).toBe(false);
    expect(teachingsCheck({ text: 'If you like, I can search the tablets.', cited: [{ tier: 'writings' }] }).no_offer).toBe(false);
  });
});
