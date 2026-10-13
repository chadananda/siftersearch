// Findings contract + data-aware format choice (PRD F3/F4): typed findings with authority; code removes impossible
// formats (no timeline without dates, no comparison without two traditions, no table in the chat widget, absence forces
// the honest reply); Jev chooses among the rest; a shape default covers Jev being down.
import { describe, it, expect } from 'vitest';
import { toFindings, dataProfile, describeProfile } from '../../api/lib/anis/findings.js';
import { FORMATS, feasibleFormats, defaultFormat, chooseFormat } from '../../api/lib/anis/formats.js';
import { channelFor } from '../../api/lib/anis/channels.js';

const q = (title, author, religion = "Baha'i", lang = 'en') => ({ source_title: title, source_author: author, religion, source_lang: lang, citation_url: `https://x/${title}` });
const chat = channelFor('widget-chat'), email = channelFor('email', { trusted: true });

describe('findings', () => {
  it('each passage is a text_shows finding with its authority kind; nothing found is an absence', () => {
    const f = toFindings({ retrieved: [q('Kitáb-i-Íqán', 'Bahá’u’lláh'), q('God Passes By', 'Shoghi Effendi'), q('Gospel of John', 'John', 'Christian')] });
    expect(f.map((x) => x.authority.name)).toEqual(['scripture', 'authorized interpretation', 'scripture of its tradition']);
    expect(toFindings({})).toEqual([expect.objectContaining({ kind: 'absence' })]);
  });
  it('a people record becomes documented findings: denials and disputes keep their status', () => {
    const pa = { notMet: [{ id: 3, name: 'Ṭáhirih', evidence: [{ statement: 'never attained the presence', when: '1848' }] }],
      contested: [{ id: 4, name: 'X', evidence: [], against: [] }] };
    const f = toFindings({ peopleAnswer: pa, entities: [{ id: 5, name: 'Quddús', evidence: [{ verified: 'met', when: '1844' }] }] });
    expect(f.map((x) => [x.person, x.status, !!x.denies])).toEqual([['Quddús', 'verified', false], ['Ṭáhirih', 'verified', true], ['X', 'disputed', false]]);
  });
  it('the profile summarises what was found', () => {
    const p = dataProfile(toFindings({ retrieved: [q('A', 'a'), q('B', 'b', 'Islam', 'ar'), q('C', 'c')] }), { plan: { comparative: true, shape: 'topic' } });
    expect(p).toMatchObject({ passages: 3, authors: 3, traditions: 2, hasOriginal: true, comparative: true, absence: false });
    expect(describeProfile(p)).toMatch(/3 passages from 3 authors in 2 traditions/);
  });
});

describe('code removes the impossible', () => {
  const prof = (o) => ({ passages: 3, authors: 1, traditions: 1, authorityKinds: 1, people: 0, denied: 0, disputed: 0, dates: 0, hasOriginal: false, absence: false, comparative: false, shape: 'topic', ...o });
  const ids = (p, c = chat) => feasibleFormats(p, c).map((f) => f.id);
  it('absence forces the honest reply and nothing else', () => expect(ids(prof({ passages: 0, absence: true }))).toEqual(['honest_absence']));
  it('no timeline without three dates; no comparison without two traditions and a comparative question', () => {
    expect(ids(prof({}))).not.toContain('timeline');
    expect(ids(prof({ people: 3, dates: 4 }))).toContain('timeline');
    expect(ids(prof({ comparative: true }))).not.toContain('comparison');
    expect(ids(prof({ comparative: true, traditions: 2 }))).toContain('comparison');
  });
  it('no table in the chat widget; the long letter only by email', () => {
    const p = prof({ comparative: true, traditions: 2 });
    expect(ids(p, chat)).not.toContain('comparison_table');
    expect(ids(p, email)).toContain('comparison_table');
    expect(ids(p, chat)).not.toContain('letter');
    expect(ids(p, email)).toContain('letter');
  });
  it('the range of voices needs three authors; the authority layers need two kinds', () => {
    expect(ids(prof({ authors: 2 }))).not.toContain('range_of_voices');
    expect(ids(prof({ authors: 3 }))).toContain('range_of_voices');
    expect(ids(prof({ authorityKinds: 2 }))).toContain('authority_layers');
  });
  it('every format has a when, a how and a fits rule', () => { for (const f of FORMATS) expect(f.when && f.how && typeof f.fits).toBeTruthy(); });
});

describe('the choice', () => {
  const p = { passages: 4, authors: 3, traditions: 1, authorityKinds: 2, people: 0, denied: 0, disputed: 0, dates: 0, hasOriginal: false, absence: false, comparative: false, shape: 'topic' };
  it('Jev chooses among the feasible formats only', async () => {
    const r = await chooseFormat({ question: 'What does the Writings say about justice?', profile: p, channel: chat, apiKey: 'k',
      fetchImpl: async (_u, o) => { const body = JSON.parse(o.body); expect(Object.keys(body.questions.format.criteria)).not.toContain('timeline');
        return { ok: true, json: async () => ({ answers: { format: { choice: 'authority_layers', confidence: 0.7 } } }) }; } });
    expect(r).toMatchObject({ id: 'authority_layers', by: 'jev' });
  });
  it('a choice outside the feasible set is ignored → shape default', async () => {
    const r = await chooseFormat({ question: 'q', profile: p, channel: chat, apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ answers: { format: { choice: 'timeline' } } }) }) });
    expect(r).toMatchObject({ id: 'range_of_voices', by: 'default' });
  });
  it('Jev down → the shape default; people questions default to the people record', async () => {
    expect((await chooseFormat({ question: 'q', profile: p, channel: chat, apiKey: 'k', fetchImpl: async () => { throw new Error('down'); } })).id).toBe('range_of_voices');
    expect(defaultFormat(feasibleFormats({ ...p, people: 2 }, chat), { ...p, people: 2 }).id).toBe('people_record');
  });
});
