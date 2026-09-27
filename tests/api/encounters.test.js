// Who-met-whom fast path (Chad 2026-09-26: "a common search pattern"; 1s budget for the whole search).
// Only 21.7% of `met` claims carry target_entity_id, so the index keys each claim by its typed target AND by the
// names its statement carries — joined in memory, never a LIKE scan over 600k claims per request.
import { describe, it, expect } from 'vitest';
import { createEncounterIndex, encounterSearch } from '../../api/lib/encounters.js';

const persons = [
  { id: 1, cn: 'Bahá’u’lláh', imp: 100, aliases: '["Mírzá Ḥusayn-‘Alí","Bahá"]' },
  { id: 2, cn: 'The Báb', imp: 99, aliases: '["Siyyid ‘Alí-Muḥammad"]' },
  { id: 3, cn: 'Quddús', imp: 80, aliases: '["Muḥammad-‘Alíy-i-Bárfurúshí","Muḥammad-‘Alí"]' },
  { id: 4, cn: 'Ṭáhirih', imp: 80, aliases: '["Qurratu’l-‘Ayn"]' },
  { id: 5, cn: 'Mullá Ḥusayn-i-Bushrú’í', imp: 85, aliases: '["Mullá Ḥusayn","Bábu’l-Báb"]' },
  { id: 6, cn: 'Imám Ḥusayn', imp: 90, aliases: '[]' },
  { id: 7, cn: 'Vaḥíd', imp: 60, aliases: '[]' },
  { id: 8, cn: 'Ḥájí Háshim-i-‘Aṭṭár (of Baghdád)', imp: 5, aliases: '["Shíráz"]' },
  { id: 9, cn: '‘Abdu’l-Bahá', imp: 95, aliases: '[]' },
  { id: 10, cn: 'Mullá ‘Alí Mardan', imp: 3, aliases: '[]' },
  { id: 11, cn: 'Mullá ‘Alíy-i-Basṭámí', imp: 50, aliases: '["Mullá ‘Alí"]' },
  { id: 12, cn: 'Muḥammad-Ḥasan-i-Bushrú’í', imp: 20, aliases: '["Mírzá Muḥammad-Ḥasan"]' },
  { id: 13, cn: 'Mírzá Muḥammad-‘Alí', imp: 10, aliases: '["they","he"]' },
  { id: 14, cn: 'Nabíl-i-A‘ẓam', imp: 70, aliases: '["Nabíl"]' },
  { id: 15, cn: 'Nabíl', imp: 2, aliases: '[]' },
];
const groups = [{ id: 50, name: 'Letters of the Living (Ḥurúf-i-Ḥayy)', aliases: '[]' }];
const members = [{ group: 50, id: 3 }, { group: 50, id: 4 }, { group: 50, id: 5 }, { group: 50, id: 11 }, { group: 50, id: 12 }];
const claims = [
  { id: 1, eid: 5, rel: 'met', tid: null, st: 'Mullá Ḥusayn met Bahá’u’lláh in Ṭihrán', doc: 10, pid: 'para_1', tv: '1848' },
  { id: 2, eid: 3, rel: 'met', tid: 1, st: 'Quddús met Him at Badasht', doc: 10, pid: 'para_2', tv: '1848' },
  { id: 3, eid: 4, rel: 'accompanied', tid: null, st: 'Ṭáhirih accompanied Bahá’u’lláh’s party to Badasht', doc: 11, pid: 'para_3', tv: null },
  { id: 4, eid: 7, rel: 'met', tid: null, st: 'Vaḥíd met the Báb in Shíráz', doc: 12, pid: 'para_4', tv: '1846' },
  { id: 5, eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn met the Báb in Shíráz', doc: 12, pid: 'para_5', tv: '1844' },
  { id: 6, eid: 7, rel: 'visited', tid: null, st: 'Vaḥíd visited the Bábí fort', doc: 12, pid: 'para_6', tv: null },
  { id: 7, eid: 1, rel: 'met', tid: null, st: 'Bahá’u’lláh met Quddús at Badasht', doc: 10, pid: 'para_7', tv: '1848' },
  { id: 8, eid: 6, rel: 'met', tid: null, st: 'Imám Ḥusayn met his companions', doc: 13, pid: 'para_8', tv: null },
  // Live false matches (2026-09-26), each filed under the wrong person before the phrase/uniqueness rules:
  { id: 9, eid: 9, rel: 'met', tid: null, st: '‘Abdu’l-Bahá met the pilgrims', doc: 14, pid: 'para_9', tv: null },
  { id: 10, eid: 1, rel: 'hosted', tid: null, st: 'Bahá’u’lláh hosted Mullá ‘Alí Mardan', doc: 14, pid: 'para_10', tv: null },
  { id: 11, eid: 1, rel: 'met', tid: null, st: 'Mírzá Ḥusayn-‘Alí met Mullá Muḥammad', doc: 14, pid: 'para_11', tv: '1844' },
  { id: 12, eid: 1, rel: 'accompanied', tid: null, st: 'Bahá’u’lláh accompanied Mírzá Muḥammad-Ḥasan', doc: 14, pid: 'para_12', tv: '1879' },
  { id: 13, eid: 7, rel: 'accompanied', tid: null, st: 'Vaḥíd accompanied Bahá’u’lláh', prf: 'on the journey to Baghdád', doc: 15, pid: 'para_13', tv: '1853' },
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

  it('a name counts only as a contiguous, unique phrase that is not part of a longer name', () => {
    const lotl = encounterSearch('Which Letters of the Living met Bahá’u’lláh?', { index });
    const ids = lotl.people.map((p) => p.id);
    expect(ids).not.toContain(11);   // "Mullá ‘Alí" inside "Mullá ‘Alí Mardan"
    expect(ids).not.toContain(12);   // alias in the target's own statement (reverse direction is canonical-only)
    expect(lotl.people.find((p) => p.id === 3).evidence.map((e) => e.paraId)).not.toContain('para_11');   // scattered words
    expect(encounterSearch('who met Bahá’u’lláh', { index }).people.map((p) => p.id)).not.toContain(9);   // "Bahá" in ‘Abdu’l-Bahá
  });

  it('equal words → the more prominent bearer, even over an exact canonical name', () => {
    expect(encounterSearch('did Nabíl meet Bahá’u’lláh?', { index }).with?.id ?? encounterSearch('did Nabíl meet Bahá’u’lláh?', { index }).target.id).toBe(14);
  });

  it('a bare role is not a name ("the narrator")', () => {
    const ix = createEncounterIndex({ persons: [{ id: 1, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 2, cn: 'Nabíl-i-A‘ẓam', imp: 70, aliases: '["the narrator","Nabíl"]' }],
      groups: [], members: [], claims: [{ id: 1, eid: 1, rel: 'visited', tid: null, st: 'The Báb — visited the narrator', prf: 'He would frequently come to the home of my late father', doc: 9, pid: 'p', tv: '1844' }] });
    expect(encounterSearch('did Nabíl meet the Báb?', { index: ix }).people).toEqual([]);
  });

  it('an alias made of function words is not a name ("they")', () => {
    expect(encounterSearch('did Quddús meet Ṭáhirih, and when did they meet?', { index }).with?.id).toBe(3);
  });

  it('"the Báb" is not Bábu’l-Báb', () => {
    expect(encounterSearch('who met the Báb in Shiraz', { index }).target.id).toBe(2);
  });

  it('the verb picks the edge and the leftover words rank', () => {
    const r = encounterSearch('who accompanied Bahá’u’lláh to Baghdad?', { index });
    expect(r.relations).toEqual(['accompanied', 'companion-of']);
    expect(r.topic).toEqual(['baghdad']);
    expect(r.people[0].name).toBe('Vaḥíd');
    expect(r.people[0].evidence[0].topic).toBe(true);
    expect(r.people.flatMap((p) => p.evidence.map((e) => e.relation))).not.toContain('met');
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

  // Chad 2026-09-27: "All the letters of the living met the Bab save Tahirih." Five of Ṭáhirih's "met the Báb" claims
  // cite proofs that say she never did; Nabíl's "knew the Báb" is "made me acquainted with the Revelation of the Báb".
  describe('accuracy: the proof decides', () => {
    const acc = createEncounterIndex({
      persons: [
        { id: 2, cn: 'The Báb', imp: 99, aliases: '[]' },
        { id: 3, cn: 'Quddús', imp: 80, aliases: '[]' },
        { id: 4, cn: 'Ṭáhirih', imp: 80, aliases: '[]' },
        { id: 5, cn: 'Mullá Ḥusayn', imp: 85, aliases: '[]' },
        { id: 9, cn: 'Nabíl-i-A‘ẓam', imp: 70, aliases: '["Nabíl"]' },
        { id: 10, cn: 'Mullá Ḥasan-i-Bajistání', imp: 70, aliases: '[]' },
      ],
      groups: [{ id: 50, name: 'Letters of the Living', aliases: '[]' }],
      members: [3, 4, 5, 10].map((id) => ({ group: 50, id })),
      claims: [
        { id: 1, eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn — met the Báb', prf: 'the Báb received him in His house', doc: 1, pid: 'para_1', tv: '1844' },
        { id: 2, eid: 3, rel: 'met', tid: 2, st: 'Quddús — met the Báb', prf: 'Quddús was admitted into His presence', doc: 1, pid: 'para_2', tv: '1844' },
        { id: 3, eid: 4, rel: 'met', tid: 2, st: 'Ṭáhirih — met the Báb', prf: 'she never attained the presence of the Báb', doc: 2, pid: 'para_3', tv: null },
        { id: 4, eid: 4, rel: 'met', tid: 2, st: 'Ṭáhirih — met the Báb', prf: 'She never met the Bab during her lifetime', doc: 3, pid: 'para_4', tv: null },
        { id: 5, eid: 4, rel: 'knew', tid: 2, st: 'Ṭáhirih — knew the Báb', prf: 'recognize the Bab without ever seeing Him', doc: 4, pid: 'para_5', tv: null },
        { id: 6, eid: 9, rel: 'knew', tid: 2, st: 'Nabíl — knew the Báb', prf: 'first made me acquainted with the Revelation of the Báb', doc: 1, pid: 'para_6', tv: '1847' },
      ],
    });

    it('a proof that negates the meeting is evidence AGAINST it, never for it', () => {
      const r = encounterSearch('which Letters of the Living met the Báb?', { index: acc });
      expect(r.people.map((p) => p.name).sort()).toEqual(['Mullá Ḥusayn', 'Quddús']);
      expect(r.notMet.map((p) => p.name)).toEqual(['Ṭáhirih']);
      expect(r.notMet[0].evidence[0].proof).toMatch(/never/);
    });

    it('"knew" is not "met"', () => {
      const r = encounterSearch('did Nabíl meet the Báb?', { index: acc });
      expect(r.pattern).toBe('pair');
      expect(r.people).toEqual([]);
    });

    it('a group answer accounts for every member — those with no cited evidence are named, not dropped', () => {
      const r = encounterSearch('which Letters of the Living met the Báb?', { index: acc });
      expect(r.noEvidence.map((p) => p.name)).toEqual(['Mullá Ḥasan-i-Bajistání']);
    });

    it('evidence both ways is contested, with both proofs', () => {
      const both = createEncounterIndex({
        persons: [{ id: 2, cn: 'The Báb', imp: 99, aliases: '[]' }, { id: 4, cn: 'Ṭáhirih', imp: 80, aliases: '[]' }],
        groups: [], members: [],
        claims: [
          { id: 1, eid: 4, rel: 'met', tid: 2, st: 'Ṭáhirih — met the Báb', prf: 'at last she was with the Báb', doc: 5, pid: 'p1', tv: '1848' },
          { id: 2, eid: 4, rel: 'met', tid: 2, st: 'Ṭáhirih — met the Báb', prf: 'Ṭáhirih never saw the Báb', doc: 6, pid: 'p2', tv: null },
        ],
      });
      const r = encounterSearch('did Ṭáhirih meet the Báb?', { index: both });
      expect(r.people).toEqual([]);
      expect(r.contested[0].name).toBe('Ṭáhirih');
      expect(r.contested[0].against[0].proof).toMatch(/never saw/);
    });

    it('Persian negation counts too', async () => {
      const { NEGATED } = await import('../../api/lib/encounters.js');
      expect(NEGATED.test('هرگز به ملاقات حضرت باب نرسید')).toBe(true);
      expect(NEGATED.test('با جناب قدّوس ملاقات نمود')).toBe(false);
      expect(NEGATED.test('she never attained the presence of the Báb')).toBe(true);
      expect(NEGATED.test('She never met the Bab during her lifetime')).toBe(true);
      expect(NEGATED.test('Ṭáhirih never saw the Báb')).toBe(true);
      expect(NEGATED.test('With the exception of Siyyid Ḥusayn and his brother, neither the public nor the governor was allowed to see Him')).toBe(false);
    });
  });

  describe('bindings that cannot be right', () => {
    const ix = createEncounterIndex({
      persons: [
        { id: 2, cn: 'the Báb', imp: 99, aliases: '[]' },
        { id: 7, cn: 'Siyyid ‘Alí-Muḥammad (the Báb)', imp: 0, aliases: '[]' },          // an unmerged twin
        { id: 11, cn: 'Muḥammad-Ḥasan-i-Bushrú’í', imp: 60, aliases: '[]' },
      ],
      groups: [{ id: 50, name: 'Letters of the Living', aliases: '[]' }], members: [{ group: 50, id: 11 }],
      claims: [
        // live: object "the Báb" bound to the SUBJECT himself; the proof is genuine evidence of the meeting
        { id: 1, eid: 11, rel: 'met', tid: 11, st: 'Muḥammad-Ḥasan-i-Bushrú’í — met the Báb', prf: 'بشيراز رفته بشرف لقإ و ايمان باب اعظم', doc: 1, pid: 'p1', tv: '1844' },
      ],
    });
    it('a target typed to its own subject is ignored, and the statement still counts by name', () => {
      const r = encounterSearch('which Letters of the Living met the Báb?', { index: ix });
      expect(r.people.map((p) => p.name)).toEqual(['Muḥammad-Ḥasan-i-Bushrú’í']);
      expect(r.people[0].evidence[0].via).toBe('named:bab');
    });
    it('a canonical name belongs to its bearer even when a twin carries it in parentheses', () => {
      expect(encounterSearch('who met the Báb', { index: ix }).target.id).toBe(2);
    });
  });

  it('the core histories settle a conflict: Shoghi Effendi’s denial is not "contested" by a secondary retelling', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 4, cn: 'Ṭáhirih', imp: 80, aliases: '[]' }],
      groups: [], members: [], authoritative: [21310],
      claims: [
        { id: 1, eid: 4, rel: 'met', tid: 2, st: 'Ṭáhirih — met the Báb', prf: 'held a conversation with the Bab', doc: 999, pid: 'p1', tv: null },
        { id: 2, eid: 4, rel: 'met', tid: 2, st: 'Ṭáhirih — met the Báb', prf: 'unlike her fellow-disciples, never attained the presence of the Báb', doc: 21310, pid: 'para_31', tv: null },
      ],
    });
    const r = encounterSearch('did Ṭáhirih meet the Báb?', { index: ix });
    expect(r.contested).toEqual([]);
    expect(r.notMet[0]).toMatchObject({ name: 'Ṭáhirih', evidence: [expect.objectContaining({ authoritative: true, negated: true })] });
    expect(r.notMet[0].disputedBy[0].proof).toMatch(/held a conversation/);
  });

  it('a model verdict from the whole paragraph overrides the proof span', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 9, cn: 'Nabíl-i-A‘ẓam', imp: 70, aliases: '["Nabíl"]' }, { id: 5, cn: 'Mullá Ḥusayn', imp: 85, aliases: '[]' }],
      groups: [], members: [],
      claims: [
        { id: 1, eid: 9, rel: 'met', tid: 2, st: 'Nabíl-i-A‘ẓam — met the Báb', prf: 'He would frequently come to the home of my late father', doc: 3, pid: 'p1', tv: null, vd: 'wrong_person' },
        { id: 2, eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn — met the Báb', prf: 'I left His house', doc: 1, pid: 'p2', tv: '1844', vd: 'met', vq: 'the Báb received him in His house' },
      ],
    });
    expect(encounterSearch('did Nabíl meet the Báb?', { index: ix }).people).toEqual([]);
    const r = encounterSearch('did Mullá Ḥusayn meet the Báb?', { index: ix });
    expect(r.people[0].evidence[0]).toMatchObject({ verified: 'met', verifiedQuote: 'the Báb received him in His house' });
  });

  it('a pair is one meeting: an authoritative denial settles both sides', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 4, cn: 'Ṭáhirih', imp: 80, aliases: '[]' }],
      groups: [], members: [], authoritative: [21310],
      claims: [
        { id: 1, eid: 2, rel: 'met', tid: 4, st: 'the Báb — met Ṭáhirih', prf: 'جمال ابهی با جناب قدّوس و طاهره مذاکرات فرمودند', doc: 77, pid: 'p1', tv: null },
        { id: 2, eid: 4, rel: 'met', tid: 2, st: 'Ṭáhirih — met the Báb', prf: 'unlike her fellow-disciples, never attained the presence of the Báb', doc: 21310, pid: 'para_31', tv: null },
      ],
    });
    const r = encounterSearch('did Ṭáhirih meet the Báb?', { index: ix });
    expect(r.people).toEqual([]);
    expect(r.notMet[0].disputedBy.length).toBe(1);
  });

  it('a name inside a PLACE name is the place ("the House of the Báb")', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 9, cn: 'Nabíl-i-A‘ẓam', imp: 70, aliases: '["Nabíl"]' }],
      groups: [], members: [], places: ['the House of the Báb', 'Shíráz'],
      claims: [{ id: 1, eid: 9, rel: 'visited', tid: null, st: 'Nabíl-i-A‘ẓam — visited the House of the Báb', prf: 'When Nabíl carried out these lengthy rites', doc: 5, pid: 'p', tv: null }],
    });
    expect(encounterSearch('did Nabíl meet the Báb?', { index: ix }).people).toEqual([]);
  });

  it('a name after "house of / remains of / mother of" is not the person', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 9, cn: 'Nabíl-i-A‘ẓam', imp: 70, aliases: '["Nabíl"]' }],
      groups: [], members: [],
      claims: [
        { id: 1, eid: 9, rel: 'visited', tid: null, st: 'Nabíl-i-A‘ẓam — visited the House of the Báb', prf: 'rites', doc: 5, pid: 'p1', tv: null },
        { id: 2, eid: 9, rel: 'accompanied', tid: null, st: 'Nabíl-i-A‘ẓam — accompanied the remains of the Báb', prf: 'bore', doc: 5, pid: 'p2', tv: null },
      ],
    });
    expect(encounterSearch('did Nabíl meet the Báb?', { index: ix }).people).toEqual([]);
  });

  it('a scene makes every pair of its participants "present with" evidence', () => {
    const scene = (sid, eid, name, tid, role) => ({ id: `s${sid}:${eid}:${tid}`, eid, rel: 'met', tid, st: `${name} (${role}) — present with …`, prf: 'the preacher who occupied the pulpit was momentarily struck dumb', doc: 3887, pid: 'p5183786', tv: null, vd: 'met', scene: sid });
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 5, cn: 'Mullá Ḥusayn', imp: 85, aliases: '[]' }, { id: 7, cn: 'Siyyid Káẓim-i-Rashtí', imp: 70, aliases: '[]' }],
      groups: [], members: [],
      claims: [scene(1, 5, 'Mullá Ḥusayn', 2, 'preacher'), scene(1, 2, 'the Báb', 5, 'guest'), scene(1, 7, 'Siyyid Káẓim', 2, 'chief guest')],
    });
    const r = encounterSearch('did Mullá Ḥusayn ever meet the Báb?', { index: ix });
    expect(r.people.map((p) => p.name).sort()).toEqual(['Mullá Ḥusayn', 'the Báb']);
    expect(r.people[0].evidence[0]).toMatchObject({ scene: 1, verified: 'met' });
  });

  it('a scene links only through its participants, never through names in its summary', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 9, cn: 'Nabíl-i-A‘ẓam', imp: 70, aliases: '["Nabíl"]' }, { id: 11, cn: 'Mírzá Aḥmad', imp: 20, aliases: '[]' }],
      groups: [], members: [],
      claims: [{ id: 's1:9:11', eid: 9, rel: 'met', tid: 11, st: 'Nabíl (companion) — present with Mírzá Aḥmad, the Báb’s amanuensis (companion), Kirmánsháh: Nabíl dwells with the Báb’s amanuensis',
        prf: 'I was, at that time, dwelling in Kirmánsháh', doc: 21308, pid: 'p1', tv: null, vd: 'met', scene: 1 }],
    });
    expect(encounterSearch('did Nabíl meet the Báb?', { index: ix }).people).toEqual([]);
    expect(encounterSearch('did Nabíl meet Mírzá Aḥmad?', { index: ix }).people.map((p) => p.name)).toEqual(['Nabíl-i-A‘ẓam']);
  });

  // Live 2026-09-27: every later AUTHORITATIVE meeting (Máh-Kú 1847, never mentioning Shíráz) outranked the Karbilá
  // scene, so "prior to" must be read as chronology: Shíráz is dated by the evidence that mentions it (1844).
  it('"prior to Shíráz" is chronology: later authoritative meetings that never mention Shíráz sink too', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 5, cn: 'Mullá Ḥusayn', imp: 85, aliases: '[]' }],
      groups: [], members: [], authoritative: [21308],
      claims: [
        { id: 1, eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn — met the Báb', prf: 'The Youth who met me outside the gate of Shíráz', doc: 21308, pid: 'a', tv: '1844', vd: 'met' },
        { id: 's7:5:2', eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn (guest) — present with the Báb (host), castle of Máh-Kú: a Naw-Rúz feast', prf: 'He then summoned His friends', doc: 21308, pid: 'c', tv: '1848', vd: 'met', scene: 7 },
        { id: 'c9', eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn — companion-of the Báb', prf: 'The days of our companionship', doc: 21308, pid: 'd', tv: '1847', vd: 'met' },
        { id: 's9:5:2', eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn (preacher) — present with the Báb (guest), Karbilá: struck dumb', prf: 'the preacher … was momentarily struck dumb', doc: 3887, pid: 'b', tv: '1841', vd: 'met', scene: 9 },
      ],
    });
    const ev = encounterSearch('Had the Báb ever met Mullá Ḥusayn prior to Shíráz?', { index: ix }).people.find((p) => p.name === 'Mullá Ḥusayn').evidence;
    expect(ev[0].scene).toBe(9);
    expect(ev.findIndex((e) => e.scene === 7)).toBeGreaterThan(0);
  });

  it('"prior to Shíráz" pushes the Shíráz meetings down and the earlier one up', () => {
    const ix = createEncounterIndex({
      persons: [{ id: 2, cn: 'the Báb', imp: 99, aliases: '[]' }, { id: 5, cn: 'Mullá Ḥusayn', imp: 85, aliases: '[]' }],
      groups: [], members: [], authoritative: [21308],
      claims: [
        { id: 1, eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn — met the Báb', prf: 'The Youth who met me outside the gate of Shíráz', doc: 21308, pid: 'a', tv: '1844', vd: 'met' },
        { id: 's9:5:2', eid: 5, rel: 'met', tid: 2, st: 'Mullá Ḥusayn (preacher) — present with the Báb (guest), Mullá Sadiq’s house, Karbilá: struck dumb', prf: 'the preacher … was momentarily struck dumb', doc: 3887, pid: 'b', tv: null, vd: 'met', scene: 9 },
      ],
    });
    const r = encounterSearch('Had the Báb ever met Mullá Ḥusayn prior to Shíráz?', { index: ix });
    expect(r.before).toEqual(['shiraz']);
    expect(r.people.find((p) => p.name === 'Mullá Ḥusayn').evidence[0].scene).toBe(9);
  });
});
