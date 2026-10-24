// Historical perspective per speaker (Chad 10-23): the data tags every person; first-hand speakers (Hands, ITC pre-1988,
// the 1963 House) rank beside the Hands; a surname alone never matches; the ITC members are in the data.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { historicalIndex, historicalTier } from '../../api/lib/media/historical.js';
import { rankFor, rankOf } from '../../api/lib/ops/media-jobs.js';

const people = JSON.parse(readFileSync(new URL('../../data/media-speaker-people.json', import.meta.url), 'utf8')).people;
const of = historicalIndex(people);

describe('historical tags', () => {
  it('every person carries one of first-hand / historian / modern', () => {
    for (const p of people) expect(['first-hand', 'historian', 'modern'], p.key).toContain(p.historical);
  });
  it('the ITC Counsellors appointed before 1988 are first-hand, by name form', () => {
    for (const n of ['Florence Mayberry', 'Aziz Yazdi', 'Anneliese Bopp', 'Magdalene Carney', 'Khamsi, Masud', 'Sabri, I.', 'Isobel Sabri', 'Peter J. Khan', 'Hooper C. Dunbar']) {
      expect(of(n)?.historical, n).toBe('first-hand');
    }
    expect(people.filter((p) => /ITC pre-1988/.test(p.historical_basis || '')).map((p) => p.key).sort())
      .toEqual(['anneliese-bopp', 'aziz-yazdi', 'florence-mayberry', 'hooper-dunbar', 'isobel-sabri', 'magdalene-carney', 'masud-khamsi', 'peter-khan']);
  });
  it('a surname alone, or another Sabri, does not match', () => {
    expect(of('Sabri')).toBeNull();
    expect(of('Sabri, H.')).toBeNull();
    expect(of('Khan')).toBeNull();
  });
  it('an explicit exclusion is never first-hand (Arbab joined the ITC in 1988; excluded wins)', () => {
    for (const p of people.filter((x) => x.exclude)) expect(p.historical, p.key).toBe('modern');
  });
});

describe('queue rank', () => {
  it('first-hand rises to the Hands tier, modern drops to the last', () => {
    expect(historicalTier(4, 'first-hand')).toBe(2);
    expect(historicalTier(1, 'first-hand')).toBe(1);
    expect(historicalTier(4, 'modern')).toBe(5);
    expect(historicalTier(3, 'historian')).toBe(3);
  });
  it('a local talk by an ITC Counsellor ranks ahead of an untagged local speaker of the same year', async () => {
    const role = () => 'scholar';
    const itc = await rankFor({ source_kind: 'file', rel: "Baha'i/talks/Khamsi Various/Khamsi, Masud - Teaching in Latin America - 1988 05 09.mp3", speaker: 'Khamsi, Masud', year: 1988, id: 9 }, new Map(), role, of);
    const other = await rankFor({ source_kind: 'file', rel: "Baha'i/talks/X/Someone Else - A Talk - 1988 05 09.mp3", speaker: 'Someone Else', year: 1988, id: 9 }, new Map(), role, of);
    expect(Math.floor(itc / 1e7)).toBe(2);
    expect(itc).toBeLessThan(other);
    expect(other).toBe(rankOf(4, 1988, 9));
  });
});

describe('International Bahá’í Council members and pilgrims of the Guardian’s time are first-hand (Chad 10-23)', () => {
  it('the verified IBC list and the local pilgrim recollections', () => {
    for (const n of ['Amelia Collins', 'Jessie Revell', 'Ethel Revell', 'Lutfullah Hakim', 'Sylvia Ioas', 'Borrah Kavelin', 'Mildred Mottahedeh', 'Ben Weeden', 'Gladys Weeden',
      'Sheila Banani', 'Catharine Nourse', 'Ted Cardell', 'Aziz Panahi', 'Jalal Khazeh']) expect(of(n)?.historical, n).toBe('first-hand');
    expect(people.find((p) => p.key === 'leroy-ioas').historical_basis).toMatch(/International Bahá’í Council/);
    expect(people.find((p) => p.key === 'ali-akbar-furutan').historical_basis).not.toMatch(/Council/);   // not an IBC member
  });
});

describe('media-rank reads the ITC and first-hand target sections and ranks them with the Hands', () => {
  it('registers the new targets; a first-hand speaker lands in tier 2', async () => {
    const { mkdtempSync, writeFileSync } = await import('fs'); const { join } = await import('path'); const { tmpdir } = await import('os');
    const { mediaRankJob } = await import('../../api/lib/ops/media-jobs.js');
    const d = mkdtempSync(join(tmpdir(), 'rk-'));
    writeFileSync(join(d, 'youtube-talks.json'), JSON.stringify({ hands_uhj: [] }));
    writeFileSync(join(d, 'itc-talks.json'), JSON.stringify({ itc_pre_1988: [{ video_id: 'k1', speaker: 'Mas‘úd Khamsí', title: 'Opening of New Territories 1963' }],
      first_hand: [{ video_id: 'b1', speaker: 'Sheila Banani', title: 'Memoirs #1' }] }));
    const created = [], ranks = [];
    const repo = { findMediaByYoutube: async () => null, createMediaItem: async (r) => { created.push(r.youtube_id); return { id: created.length }; },
      rankRows: async () => created.map((y, i) => ({ id: i + 1, source_kind: 'youtube', youtube_id: y })), setQueueRanks: async (r) => ranks.push(...r) };
    await mediaRankJob({ talks: join(d, 'youtube-talks.json') }, { repo, listing: { speakerRole: () => 'scholar' }, excluded: () => false });
    expect(created).toEqual(['k1', 'b1']);
    for (const r of ranks) expect(Math.floor(r.rank / 1e7)).toBe(2);
  });
});

describe("Chad's decisions 10-23 (the answers collection)", async () => {
  const { excludedBy, loadExclusions } = await import('../../api/lib/media/exclusions.js');
  const { resolveSpeaker } = await import('../../api/lib/media/identity.js');
  it('the 19 curation drops are excluded by given name + surname; a surname alone is not', () => {
    for (const n of ['Arthur Lyon Dahl', 'Gregory Dahl', 'Michael Penn', 'Rainn Wilson', 'Bob Harris', 'Ed Harris', 'Robert Weinberg', 'Xin Zhihong']) {
      expect(excludedBy({ speaker: n }), n).toMatchObject({ reason: 'curation: not historical (Chad 10-23)' });
    }
    for (const n of ['Penn', 'Harris', 'Dahl', 'Moojan Momen', 'Todd Lawson', 'Steven Phelps', 'Peter Smith']) expect(excludedBy({ speaker: n }), n).toBeNull();
    expect(loadExclusions().find((r) => r.id === 'curation-not-historical').people).toHaveLength(19);
  });
  it('historian / modern tags; the unsure are ranked last', () => {
    for (const n of ['Armin Eschraghi', 'Michael Day', 'Siyamak Zabihi-Moghaddam']) expect(of(n)?.historical, n).toBe('historian');
    for (const n of ['Christopher Buck', 'Louis Venters', 'Moojan Momen', 'Peter Smith', 'Robert Stockman']) expect(of(n)?.historical, n).toBe('modern');
    expect(of('Reba Carruth')?.rank).toBe('last');
    expect(historicalTier(5, 'modern', 'last')).toBe(6);
    expect(of('Todd Lawson')?.rank).toBeNull();   // kept: ranked as usual
  });
  it('the confirmed identities: surname-only labels resolve to the person Chad named', () => {
    const notSpeakers = [];
    for (const [form, key] of [['Furútan', 'ali-akbar-furutan'], ['Nakhjavání', 'ali-nakhjavani'], ['Grossmann', 'hartmut-grossmann'], ['Taherzadeh', 'adib-taherzadeh'],
      ['Sabri', 'isobel-sabri'], ['Khamsi-Dunbar,M.', 'masud-khamsi'], ['Faizi', 'abul-qasim-faizi'], ['Dr. Mohajer', 'payman-mohajer']]) {
      expect(resolveSpeaker(form, people, {}, { notSpeakers }).key, form).toBe(key);
    }
  });
});
