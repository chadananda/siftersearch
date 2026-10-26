// QA audit 10-22 (tests/fixtures/media-qa/wrong-person-links.json): 18 wrong person links — ACCURACY cases: every one must now be
// refused or resolved to the expected person; the lookup fallback is gone. Covenant-breakers are linked like anyone else when
// the words are unambiguously them (Chad 10-23: "we should link to them accurately"); ambiguous words link to no one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { bioIndex, resolvePerson, candidatesFor } from '../../api/lib/media/links.js';

const fx = JSON.parse(readFileSync(new URL('../fixtures/media-qa/wrong-person-links.json', import.meta.url), 'utf8'));
// the people involved, as the biography set has them (names/aliases/sides from GET /api/v1/people)
const bio = [
  { id: 1, name: "Ibráhím Khayru'lláh", side: "Bahá'í (Western, later Covenant-breaker)", aliases: ['Dr. Ibráhím Ḵhayru’lláh'] },
  { id: 2, name: 'Mírzá Muḥammad-‘Alí', side: "Bahá'í", aliases: ['the arch-Covenant-breaker', 'Ghuṣn-i-Akbar (the Greater Branch)'] },
  { id: 3, name: 'Quddús', side: 'Bábí', aliases: ['the Last Point'] },
  { id: 4, name: 'Laura Barney', aliases: ['Laura Clifford Barney'] }, { id: 5, name: 'Leroy Ioas', aliases: [] },
  { id: 6, name: 'May Maxwell', aliases: [] }, { id: 7, name: 'Sutherland Maxwell', aliases: ['William Sutherland Maxwell'] },
  { id: 8, name: 'Rúḥu’lláh Varqá', aliases: [] }, { id: 9, name: '‘Abdu’l-Bahá', aliases: ['the Master'] }, { id: 10, name: 'Paul von Hindenburg', aliases: [] },
  { id: 11, name: 'Mrs. E. Hoagg', aliases: ['Emogene Hoagg'] }, { id: 12, name: 'St. John the Divine', aliases: [] }, { id: 13, name: 'Róbert Nádler', aliases: [] },
  { id: 14, name: 'Sir Stewart Symes', aliases: [] }, { id: 15, name: 'S̱hayḵh ‘Alí (son of S̱hayḵh Aḥmad-i-Aḥsá’í)', aliases: [] }, { id: 16, name: 'Stephen Wise', aliases: [] },
  { id: 17, name: 'Mírzá Muḥammad-‘Alíy-i-Qazvíní', aliases: ['Mírzá Muḥammad-‘Alí (martyr of Qazvín)'] }, { id: 18, name: 'Dr. Luṭfu’lláh Ḥakím', aliases: [] },
];
const index = bioIndex(bio);
const byName = new Map(bio.map((p) => [p.name, p.id]));

describe('wrong person links (QA fixture)', () => {
  for (const c of fx.cases) {
    it(`${c.slug}: "${c.text}" is never linked to ${c.linked_to}`, async () => {
      // the model's guess was the wrong person — the words must still decide
      const r = await resolvePerson({ text: c.text.replace(/[,.]$/, ''), canonical: c.linked_to }, { index });
      // "Muḥammad-‘Alí": the arch-Covenant-breaker and the martyr of Qazvín both carry the words → ambiguous, no link
      if (/covenant-breaker/i.test(c.expected || '')) { expect(r.entity_id).toBeUndefined(); expect(r.why).toMatch(/ambiguous/); return; }
      if (r.entity_id) {
        expect(r.entity_id).not.toBe(byName.get(c.linked_to));
        const want = byName.get(String(c.expected || '').replace(/\s*\(.*$/, ''));
        expect(r.entity_id).toBe(want);
      }
    });
  }
  it('a Covenant-breaker named unambiguously is linked (accurately); the right person still wins elsewhere', async () => {
    expect(candidatesFor(index, 'Khayru’lláh')).toEqual([1]);
    expect((await resolvePerson({ text: 'Ibráhím Khayru’lláh' }, { index })).entity_id).toBe(1);
    expect((await resolvePerson({ text: 'Ioas', canonical: 'Laura Barney' }, { index })).entity_id).toBe(5);
    expect((await resolvePerson({ text: 'Dr. Ḥakím' }, { index })).entity_id).toBe(18);   // not Khayru'lláh: the words decide
    expect((await resolvePerson({ text: 'the Master' }, { index })).entity_id).toBe(9);
    expect((await resolvePerson({ text: 'Muḥammad-‘Alí', canonical: 'Mírzá Muḥammad-‘Alí' }, { index })).entity_id).toBe(2);   // the context chooses among those who carry the words
  });
});

describe('media-relink: talks whose person mentions the retired guard refused get a links + update re-run', () => {
  it('only the affected talks, busy ones skipped, dry run changes nothing', async () => {
    const { mediaRelinkJob } = await import('../../api/lib/ops/media-jobs.js');
    const links = { '/a': { unresolved: [{ kind: 'person', text: 'the Guardian', why: 'the words also name a Covenant-breaker' }] },
      '/b': { unresolved: [{ kind: 'person', text: 'Haggai', why: 'no biography page for these words' }] },
      '/c': { unresolved: [{ kind: 'person', text: '‘Abdu’l-Bahá', why: 'the words also name a Covenant-breaker' }] } };
    const items = { 1: { id: 1, dir: '/a' }, 2: { id: 2, dir: '/b' }, 3: { id: 3, dir: '/c' } };
    const queued = [];
    const deps = { repo: { doneItemIds: async () => [1, 2, 3], getMediaItem: async (id) => items[id] }, readLinks: async (d) => links[d],
      ops: { pendingRuns: async (n) => (n === 'media-item' ? [{ params: { id: 3 } }] : []) }, queue: async (n, p) => queued.push([n, p]) };
    expect(await mediaRelinkJob({}, deps)).toMatchObject({ talks: 3, affected: 2, mentions: 2, queued: 0 });
    expect(queued).toEqual([]);
    expect(await mediaRelinkJob({ write: true }, deps)).toMatchObject({ affected: 2, queued: 1, skipped_busy: 1 });
    expect(queued).toEqual([['media-item', { id: 1, redo: ['links', 'update'] }]]);
    queued.length=0;await mediaRelinkJob({write:true,only:['links','update']},deps);
    expect(queued).toEqual([['media-item',{id:1,redo:['links','update'],only:['links','update']}]]);
  });
});
