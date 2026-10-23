// Speaker identity (Chad 10-23): one person, many name forms; ambiguity → review; dates after death flagged.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { nameTokens, compatible, resolveSpeaker, recordingYear } from '../../api/lib/media/identity.js';

const people = JSON.parse(readFileSync(new URL('../../data/media-speaker-people.json', import.meta.url), 'utf8')).people;
const faizi = people.find((p) => p.key === 'abul-qasim-faizi');

describe('name forms', () => {
  it('folds diacritics, apostrophes, hyphens, titles', () => {
    expect(nameTokens("Abu'l-Qásim Faizí")).toEqual(['abul', 'qasim', 'faizi']);
    expect(nameTokens('Abul-Qasim Faizi')).toEqual(['abul', 'qasim', 'faizi']);
    expect(nameTokens('Hand of the Cause Mr. A.Q. Faizi')).toEqual(['a', 'q', 'faizi']);
    expect(nameTokens('Abu’l-Qásim Fayzí')).toEqual(['abul', 'qasim', 'faizi']);
  });
  it('"A.Q. Faizi" ≡ "Abul-Qasim Faizi" (initials fit the full name)', () => {
    expect(compatible('A.Q. Faizi', 'Abul-Qasim Faizi')).toBe(true);
    expect(resolveSpeaker('A.Q. Faizi', people)).toMatchObject({ key: 'abul-qasim-faizi', display: 'Abu’l-Qásim Faizí' });
    expect(resolveSpeaker('Abul-Qasim Faizi', people).key).toBe('abul-qasim-faizi');
  });
  it('Gloria Faizi is not Abu’l-Qásim Faizí', () => {
    expect(compatible('Gloria Faizi', 'Abul-Qasim Faizi')).toBe(false);
    expect(resolveSpeaker('Gloria Faizi', people).key).toBe('gloria-faizi');
  });
});

describe('the Khadem family stays distinct', () => {
  it('Riaz ≠ Zikrullah ≠ Javidukht; a bare "Khadem" is reviewed, not merged on the name', () => {
    expect(compatible('Riaz Khadem', 'Zikrullah Khadem')).toBe(false);
    expect(resolveSpeaker('Riaz Khadem', people).key).toBe('riaz-khadem');
    expect(resolveSpeaker('Zikru’lláh Khádem', people).key).toBe('zikrullah-khadem');
    expect(resolveSpeaker('Khadem', people).review).toBeTruthy();
  });
  it('a bare surname resolves only with evidence — a work of exactly one of them', () => {
    expect(resolveSpeaker('Khadem', people, { title: 'Carmel the Mountain of God, part 2' }).key).toBe('zikrullah-khadem');
    expect(resolveSpeaker('Taherzadeh', people, { collection: 'Taherzadeh Covenant of Baha\'u\'llah' }).key).toBe('adib-taherzadeh');
  });
  it('Hartmut Grossmann is Hartmut, though "H. Grossmann" (Hermann) also fits by initial', () => {
    expect(resolveSpeaker('Hartmut Grossmann', people).key).toBe('hartmut-grossmann');
  });
  it('a reviewed surname-only form resolves once confirmed', () => {
    const ps = people.map((p) => (p.key === 'ali-akbar-furutan' ? { ...p, confirmed: ['Furútan'] } : p));
    expect(resolveSpeaker('Furútan', people).review).toBeTruthy();
    expect(resolveSpeaker('Furutan', ps).key).toBe('ali-akbar-furutan');
  });
  it('Grossmann: the recording year decides between Hermann (d. 1968) and Hartmut, else review', () => {
    expect(resolveSpeaker('Grossmann', people).review).toBeTruthy();
    expect(resolveSpeaker('Grossmann', people, { title: 'World Order 2' }).key).toBe('hartmut-grossmann');
  });
});

describe('recording vs upload dates', () => {
  it('Faizi died 1980: a YouTube "2017" is an upload year — flagged, the title year is the recording', () => {
    expect(recordingYear({ year: 2017, source_kind: 'youtube', title: 'Talk on the Hidden Words' }, faizi))
      .toMatchObject({ recorded_year: null, uploaded_year: 2017, flag: expect.stringMatching(/after the speaker's death \(1980\)/) });
    expect(recordingYear({ year: 2022, source_kind: 'youtube', title: 'Faizi in Haifa, 1974' }, faizi)).toMatchObject({ recorded_year: 1974, uploaded_year: 2022, flag: null });
    expect(recordingYear({ year: 1975, source_kind: 'file' }, faizi)).toMatchObject({ recorded_year: 1975, flag: null });
    expect(recordingYear({ year: 1995, source_kind: 'file' }, faizi).flag).toMatch(/after the speaker's death/);
  });
});

describe('the identity job', async () => {
  const { mediaIdentityJob } = await import('../../api/lib/ops/media-jobs.js');
  it('merges name forms into one person, holds the ambiguous, flags impossible years, writes meta + queues an update', async () => {
    const items = {
      1: { id: 1, slug: 'faizi-a', dir: '/a', speaker: 'Abul-Qasim Faizi', source_kind: 'file', year: 1975 },
      2: { id: 2, slug: 'faizi-b', dir: '/b', speaker: 'A.Q. Faizi', source_kind: 'youtube', year: 2017 },
      3: { id: 3, slug: 'khadem-x', dir: '/c', speaker: 'Khadem', source_kind: 'youtube', year: 2020 },
    };
    const metas = { '/a': { speaker: 'Abul-Qasim Faizi', title: 'The Hidden Words', year: 1975 }, '/b': { speaker: 'A.Q. Faizi', title: 'On prayer', year: 2017 }, '/c': { speaker: 'Khadem', title: 'Pioneering' } };
    const written = {}, queued = [];
    const r = await mediaIdentityJob({ write: true }, { people, repo: { doneItemIds: async () => [1, 2, 3], getMediaItem: async (id) => items[id], upsertSpeaker: async () => ({}) },
      ops: { pendingRuns: async () => [] }, queue: async (n, p) => queued.push(p.id), readMeta: async (d) => metas[d], writeMeta: async (d, m) => { written[d] = m; } });
    const c = r.clusters.find((x) => x.key === 'abul-qasim-faizi');
    expect(c.forms.map((f) => f.name).sort()).toEqual(['A.Q. Faizi', 'Abul-Qasim Faizi']);
    expect(written['/b']).toMatchObject({ speaker: 'Abu’l-Qásim Faizí', speaker_key: 'abul-qasim-faizi', year: null, uploaded_year: 2017 });
    expect(r.date_flags.map((f) => f.slug)).toEqual(['faizi-b']);
    expect(r.review).toMatchObject([{ slug: 'khadem-x', said: 'Khadem' }]);
    expect(written['/c']).toBeUndefined();
    expect(queued.sort()).toEqual([1, 2]);
  });
});
