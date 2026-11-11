// biography_lookup / person-report.js: name → the right person, report shape (portrait, timeline with cited sources, spread facts), writer PEOPLE entry.
import { describe, it, expect } from 'vitest';
import { personReport, pickPerson, toReport, reportToEntity } from '../../api/lib/person-report.js';
import { anisUserPayload } from '../../api/lib/assistant/prompt.js';
import { REGISTRY } from '../../api/lib/assistant/tools.js';

const bioRec = (over = {}) => ({ id: 7, name: 'Quddús', aliases: ['Ḥájí Muḥammad-‘Alíy-i-Bárfurúshí'], side: 'Bábí', summary: 'The last Letter of the Living.', importance: 9,
  portrait: 'https://cdn.example/q.jpg', portraitFull: null, wiki: { title: 'Quddús', url: 'https://en.wikipedia.org/wiki/Quddus' }, dates: [], death: { year: 1849 }, kinship: [],
  characterizations: Array.from({ length: 100 }, (_, i) => ({ quote: `fact ${i}`, relation: 'r', when: String(1820 + i), proof: `p${i}`, source: 'The Dawn-Breakers', cite: `DB ¶${i}`, url: `https://oceanlibrary.com/dawn-breakers_nabil?paraId=para_${i}` })),
  characterizationsTotal: 100, books: ['The Dawn-Breakers', 'God Passes By'], mentionCount: 900, timeline: null, ...over });

describe('person report', () => {
  it('picks the exact name/alias match over a more important namesake', () => {
    expect(pickPerson([{ id: 1, name: 'Muḥammad', type: 'person', importance: 10 }, { id: 2, name: 'Quddús', type: 'person', importance: 3, exact_match: true }]).id).toBe(2);
    expect(pickPerson([{ id: 3, name: 'Badasht', type: 'event', exact_match: true }])).toBeNull();
  });
  it('name → report with portrait, others listed; id skips the lookup', async () => {
    const deps = { entityLookup: async () => [{ id: 7, name: 'Quddús', type: 'person', exact_match: true, importance: 9 }, { id: 8, name: 'Quddús (other)', type: 'person', importance: 1 }],
      getBioPerson: async (id) => (id === 7 ? bioRec() : null) };
    const r = await personReport({ name: 'Quddus' }, { deps });
    expect(r.found).toBe(true);
    expect(r.person.portrait).toBe('https://cdn.example/q.jpg');
    expect(r.person.wikipedia.url).toMatch(/wikipedia/);
    expect(r.others.map((o) => o.id)).toEqual([8]);
    expect(r.person.facts).toHaveLength(40);
    expect(r.person.facts[0].statement).toBe('fact 0');          // spread keeps the life start to end
    expect(r.person.factsTotal).toBe(100);
    expect((await personReport({ id: '7' }, { deps: { entityLookup: async () => { throw new Error('no lookup'); }, getBioPerson: deps.getBioPerson } })).person.name).toBe('Quddús');
    expect(await personReport({ name: 'Nobody' }, { deps: { entityLookup: async () => [], getBioPerson: async () => null } })).toEqual({ found: false, person: null, others: [] });
  });
  it('timeline events carry their resolved sources; the writer entry uses them', () => {
    const r = toReport(bioRec({ timeline: { events: [{ date: '1848', year: 1848, title: 'Badasht', text: 'He attended Badasht.', cites: ['f1'], quote: 'reached Badasht' }],
      relationships: [{ who: 'Mullá Ḥusayn', type: 'companion', cites: ['f1'] }], journeys: [], sources: { f1: { source: 'The Dawn-Breakers', cite: 'DB ¶300', url: 'https://oceanlibrary.com/dawn-breakers_nabil?paraId=para_300', proof: 'reached Badasht' } } } }));
    expect(r.timeline.events[0].sources[0]).toMatchObject({ cite: 'DB ¶300', url: expect.stringContaining('para_300') });
    const e = reportToEntity(r);
    expect(e.evidence).toEqual([{ statement: 'Badasht: He attended Badasht.', when: '1848', source: 'The Dawn-Breakers, DB ¶300', url: 'https://oceanlibrary.com/dawn-breakers_nabil?paraId=para_300', proof: 'reached Badasht' }]);
    const text = anisUserPayload({ question: 'Tell me about Quddús', passages: [], entities: [e] });
    expect(text).toMatch(/PEOPLE[^\n]*\n- Quddús \(also called Ḥájí[^)]*\) — The last Letter of the Living\.: Badasht: He attended Badasht\. \(1848\)/);
  });
  it('no timeline → the cited facts are the evidence', () => {
    const e = reportToEntity(toReport(bioRec()));
    expect(e.evidence).toHaveLength(40);
    expect(e.evidence[0]).toMatchObject({ statement: 'fact 0', source: 'The Dawn-Breakers, DB ¶0' });
  });
  it('biography_lookup is registered, deterministic, and its output passes its own schema', async () => {
    const t = REGISTRY.biography_lookup;
    expect(t.cost.llm).toBe(false);
    const out = await t.run({ name: 'Quddús' }, { deps: { personReport: async (a) => ({ found: true, person: { ...toReport(bioRec()), id: 7 }, others: [], _a: a }) } });
    expect(out._a).toEqual({ name: 'Quddús' });
    expect((await t.run({ name: '1247563' }, { deps: { personReport: async (a) => ({ found: false, person: null, others: [], _a: a }) } }))._a).toEqual({ id: '1247563' });
    const Ajv = (await import('ajv')).default;
    const { plainSchema } = await import('../../api/lib/assistant/tool-kit.js');
    expect(new Ajv({ strict: false }).validate(plainSchema(t.output), out)).toBe(true);
  });
});
