// Who-met-whom fast path (Chad 2026-09-26: "a common search pattern"; 1s budget for the whole search).
// Only 21.7% of `met` claims carry target_entity_id, so the index keys each claim by its typed target AND by the
// names its statement carries — joined in memory, never a LIKE scan over 600k claims per request.
import { describe, it, expect } from 'vitest';
import { createEncounterIndex, encounterSearch } from '../../api/lib/encounters.js';

const persons = [
  { id: 1, cn: 'Bahá’u’lláh', imp: 100, aliases: '["Mírzá Ḥusayn-‘Alí"]' },
  { id: 2, cn: 'The Báb', imp: 99, aliases: '["Siyyid ‘Alí-Muḥammad"]' },
  { id: 3, cn: 'Quddús', imp: 80, aliases: '["Muḥammad-‘Alíy-i-Bárfurúshí"]' },
  { id: 4, cn: 'Ṭáhirih', imp: 80, aliases: '["Qurratu’l-‘Ayn"]' },
  { id: 5, cn: 'Mullá Ḥusayn-i-Bushrú’í', imp: 85, aliases: '["Mullá Ḥusayn","Bábu’l-Báb"]' },
  { id: 6, cn: 'Imám Ḥusayn', imp: 90, aliases: '[]' },
  { id: 7, cn: 'Vaḥíd', imp: 60, aliases: '[]' },
  { id: 8, cn: 'Ḥájí Háshim-i-‘Aṭṭár (of Baghdád)', imp: 5, aliases: '["Shíráz"]' },
];
const groups = [{ id: 50, name: 'Letters of the Living (Ḥurúf-i-Ḥayy)', aliases: '[]' }];
const members = [{ group: 50, id: 3 }, { group: 50, id: 4 }, { group: 50, id: 5 }];
const claims = [
  { id: 1, eid: 5, rel: 'met', tid: null, st: 'Mullá Ḥusayn met Bahá’u’lláh in Ṭihrán', doc: 10, pid: 'para_1', tv: '1848' },
  { id: 2, eid: 3, rel: 'met', tid: 1, st: 'Quddús met Him at Badasht', doc: 10, pid: 'para_2', tv: '1848' },
  { id: 3, eid: 4, rel: 'accompanied', tid: null, st: 'Ṭáhirih accompanied Bahá’u’lláh’s party to Badasht', doc: 11, pid: 'para_3', tv: null },
  { id: 4, eid: 7, rel: 'met', tid: null, st: 'Vaḥíd met the Báb in Shíráz', doc: 12, pid: 'para_4', tv: '1846' },
  { id: 5, eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn met the Báb in Shíráz', doc: 12, pid: 'para_5', tv: '1844' },
  { id: 6, eid: 7, rel: 'visited', tid: null, st: 'Vaḥíd visited the Bábí fort', doc: 12, pid: 'para_6', tv: null },
  { id: 7, eid: 1, rel: 'met', tid: null, st: 'Bahá’u’lláh met Quddús at Badasht', doc: 10, pid: 'para_7', tv: '1848' },
  { id: 8, eid: 6, rel: 'met', tid: null, st: 'Imám Ḥusayn met his companions', doc: 13, pid: 'para_8', tv: null },
];
const index = createEncounterIndex({ persons, groups, members, claims, places: ['Shíráz', 'Baghdád'] });
const names = (r) => r.people.map((p) => p.name);

describe('encounterSearch', () => {
  it('group + target: members with a cited encounter, typed OR named in the statement, both directions', () => {
    const r = encounterSearch('Who were the Letters of the Living who met Bahá’u’lláh, and when?', { index });
    expect(r.pattern).toBe('group-target');
    expect(new Set(names(r))).toEqual(new Set(['Mullá Ḥusayn-i-Bushrú’í', 'Quddús', 'Ṭáhirih']));
    const q = r.people.find((p) => p.id === 3);
    // Quddús: his own typed claim AND Bahá’u’lláh’s claim naming him (reverse direction)
    expect(q.evidence.map((e) => e.paraId).sort()).toEqual(['para_2', 'para_7']);
    expect(q.evidence[0]).toMatchObject({ doc_id: 10, when: '1848' });
  });

  it('a parenthetical is a second name, not extra required words', () => {
    expect(encounterSearch('which of the Hurúf-i-Ḥayy met Bahá’u’lláh', { index }).pattern).toBe('group-target');
  });

  it('apostrophe-free ASCII query still resolves the parties', () => {
    const r = encounterSearch('which letters of the living met bahaullah', { index });
    expect(r.people.length).toBe(3);
  });

  it('target only: everyone with a cited encounter with the target, excluding the target', () => {
    const r = encounterSearch('who met the Báb', { index });
    expect(r.pattern).toBe('target');
    expect(new Set(names(r))).toEqual(new Set(['Vaḥíd', 'Mullá Ḥusayn-i-Bushrú’í']));
  });

  it('"Bábí" is not "the Báb" (whole-word matching)', () => {
    const r = encounterSearch('who met the Báb', { index });
    expect(r.people.flatMap((p) => p.evidence.map((e) => e.paraId))).not.toContain('para_6');
  });

  it('a place in the question is not a second person ("(of Baghdád)" is a qualifier; an alias that is a place is dropped)', () => {
    expect(encounterSearch('who met the Báb in Shiraz', { index }).pattern).toBe('target');
    expect(encounterSearch('who met Bahá’u’lláh in Baghdad', { index }).pattern).toBe('target');
  });

  it('every piece of evidence says why it is there', () => {
    const r = encounterSearch('who met the Báb', { index });
    const vias = r.people.flatMap((p) => p.evidence.map((e) => e.via));
    expect(vias).toContain('typed');
    expect(vias).toContain('named:bab');
  });

  it('two people: the claims between them, either direction', () => {
    const r = encounterSearch('did Bahá’u’lláh ever meet Quddús?', { index });
    expect(r.pattern).toBe('pair');
    expect(r.people.flatMap((p) => p.evidence.map((e) => e.paraId)).sort()).toEqual(['para_2', 'para_7']);
  });

  it('a bare shared name defaults to its most prominent bearer', () => {
    const r = encounterSearch('who met Husayn', { index });
    expect(r.target.id).toBe(6);
  });

  it('not a who-met-whom question → null (caller falls back)', () => {
    expect(encounterSearch('what is the station of the Báb', { index })).toBeNull();
    expect(encounterSearch('who met the bishop', { index })).toBeNull();
  });

  it('is fast: in-memory join, no per-request scan', () => {
    const t = performance.now();
    for (let i = 0; i < 200; i++) encounterSearch(`who met the Báb ${i}`, { index });
    expect((performance.now() - t) / 200).toBeLessThan(5);
  });
});
