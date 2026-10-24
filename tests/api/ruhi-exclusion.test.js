// Chad 10-23: Ruhi books are refused at every door (no unique quotes, no scholarship). api/lib/dewey/prepare.js excludedWork
import { describe, it, expect } from 'vitest';
import { excludedWork, RUHI_REASON } from '../../api/lib/dewey/prepare.js';

describe('Ruhi exclusion', () => {
  it.each([
    [{ title: 'Reflections on the Life of the Spirit', author: 'Ruhi Institute' }],
    [{ title: 'Arising to Serve', author: 'Unknown' }],
    [{ title: 'Book 7: Walking Together on a Path of Service' }],
    [{ title: 'The Covenant of Bahá’u’lláh (Ruhi Book 8)' }],
    [{ title: 'Unit 2', file_path: 'Bahai/Study Guides/Ruhi Book 10 - Building Vibrant Communities.md' }],
    [{ title: 'Teaching Children’s Classes, Grade 1', author: 'X' }],
    [{ title: 'Some Course', publisher: 'Palabra Publications' }],
    [{ title: 'Some Course', front: ['Some Course', '© Ruhi Foundation, Colombia, 1987. All rights reserved.'] }],
    [{ title: 'Libro 1', author: 'Fundación Ruhi' }],
  ])('refuses %o', (w) => { expect(excludedWork(w)).toMatchObject({ reason: RUHI_REASON }); });
  it.each([
    [{ title: 'The Guardian of the Bahá’í Faith', author: 'Rúḥíyyih Rabbání' }],
    [{ title: 'Rúhíyyih Khánum in America', author: 'Rúhíyyih Khánum', front: ['© 1990 Rúhíyyih Khánum'] }],
    [{ title: 'A Manual for Pioneers', author: 'Ruhiyyih Rabbani', file_path: 'Bahai/Books/ruhiyyih_manual.md' }],
    [{ title: 'Ruhi Institute', author: 'The Universal House of Justice (sent via the Department of the Secretariat)' }],
    [{ title: 'Training Institutes: Attaining a Higher Level of Functioning', author: 'International Teaching Centre' }],
    [{ title: 'The Covenant of Bahá’u’lláh', author: 'Adib Taherzadeh', publisher: 'George Ronald' }],
    [{ title: 'The Twin Manifestations', author: 'Someone' }],
    [{ title: 'O Ruhi! Upon thee be the salutations of God', author: "Bahá'u'lláh" }],
    [{ title: 'A study of the training institute', author: 'A Scholar', front: ['In 1987 the Ruhi Institute in Colombia developed courses that many have studied with care and at length across the world in the decades since.'] }],
  ])('keeps %o', (w) => { expect(excludedWork(w)).toBe(null); });
});

describe('Ruhi at every door', () => {
  it('scouts never scout, offer or want a Ruhi book', async () => {
    const { scoutList } = await import('../../api/lib/dewey/scout/scout.js');
    const r = await scoutList([{ title: 'Reflections on the Life of the Spirit', author: 'Ruhi Institute' }], { deps: { items: async () => [] } });
    expect(r.outcomes).toEqual([{ title: 'Reflections on the Life of the Spirit', state: 'excluded', why: RUHI_REASON }]);
  });
  it('book requests never ask a contributor for one', async () => {
    const { pickRequests } = await import('../../api/lib/dewey/requests.js');
    const pool = [{ title: 'Arising to Serve', author: 'Ruhi Institute', source: 'wanted' }, { title: 'The Dawn of a New Day', author: 'Shoghi Effendi', source: 'wanted' }];
    expect(pickRequests(pool, [], { min: 1 }).map((x) => x.title)).toEqual(['The Dawn of a New Day']);
  });
});
