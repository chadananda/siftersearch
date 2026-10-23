// QA 10-22 item 7 (tests/fixtures/media-qa/metadata.json): speakers from file names and series siblings; one title pattern.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(async () => null), queryAll: vi.fn(async () => []), transaction: vi.fn() }));
import { parseMediaPath, seriesTitle, partTitle } from '../../api/lib/media/names.js';
import { metaFixFor, mediaMetaFixJob } from '../../api/lib/ops/media-jobs.js';

const known = ['Zikrullah Khadem', 'Martha Root', 'Peter Khan', 'Collis Featherstone', 'William Sears', 'Steven Phelps'];

describe('speakers in file names', () => {
  it.each([
    ['Pilgrim recollections (Shoghi Effendi)/Khadem Forerunner 1985.mp3', 'Zikrullah Khadem', 'Forerunner'],
    ['Historic recordings/Misc Other/Khanum-Freedom_1981.mp3', 'Amatu’l-Bahá Rúḥíyyih Khánum', 'Freedom'],
    ['Historic recordings/Misc Other/Includes Martha Root Nov 1932.mp3', 'Martha Root', null],
    ['Historic recordings/Misc Other/PKhan on Shrines being closed.WMA', 'Peter Khan', 'Shrines Being Closed'],
    ['Pilgrim recollections (Shoghi Effendi)/1957 Various Khadem Will.mp3', 'Zikrullah Khadem', 'Will'],
    ["sharaf's talks/Echos from the Lotus/Echoes_From_The_Lotus__Collis_Featherstone.03.mp3", 'Collis Featherstone', 'Echoes From The Lotus'],
    ["sharaf's talks/Echos from the Lotus/Echoes_From_The_Lotus__Afshin.03.mp3", 'Afshin', 'Echoes From The Lotus'],
    ['x/William_Sears__Prophecies.03.mp3', 'William Sears', 'Prophecies'],
  ])('%s → %s', (rel, speaker, title) => {
    const h = parseMediaPath(rel, { known });
    expect(h.speaker).toBe(speaker);
    if (title) expect(h.title).toBe(title);
    expect(h.title).not.toBe(speaker);
  });
});

describe('one title pattern per series', () => {
  it.each([['10/14 Gems of Divine Mysteries', 10, 14], ['Gems of Divine Mysteries (part 3 of 14)', 3, 14], ['Gems of Divine Mysteries (7/14)', 7, 14],
    ['Reminiscences of Shoghi Effendi, Part 2', 2, null]])('%s', (t, part, of) => {
    const s = seriesTitle(t);
    expect(s).toMatchObject({ part, of });
    expect(partTitle(s)).toMatch(/^(Gems of Divine Mysteries|Reminiscences of Shoghi Effendi) — Part \d+/);
  });
  it('a title without a part is unchanged', () => expect(seriesTitle('The Prayerful Attitude')).toEqual({ title: 'The Prayerful Attitude', part: null, of: null }));
});

describe('the metadata fix', () => {
  it('speaker from the file; series name no longer the speaker or the title', () => {
    expect(metaFixFor({ speaker: null, title: 'Forerunner', source_kind: 'file' }, { known, rel: 'Pilgrim recollections (Shoghi Effendi)/Khadem Forerunner 1985.mp3' }))
      .toEqual({ speaker: 'Zikrullah Khadem' });
    expect(metaFixFor({ speaker: 'Collis Featherstone', title: 'Collis Featherstone', source_kind: 'file' }, { known, rel: "s/Echos from the Lotus/Echoes_From_The_Lotus__Collis_Featherstone.03.mp3" }))
      .toMatchObject({ title: 'Echoes From The Lotus — Part 3', series: 'Echoes From The Lotus', part: 3 });
    expect(metaFixFor({ speaker: null, title: '10/14 Gems of Divine Mysteries', source_kind: 'youtube' })).toEqual({ title: 'Gems of Divine Mysteries — Part 10 of 14', series: 'Gems of Divine Mysteries', part: 10, part_of: 14 });
  });
  it('series siblings share the one speaker they agree on; writes meta and queues an update', async () => {
    const items = { 1: { id: 1, slug: 'phelps-gems-1', dir: '/d1', speaker: 'Steven Phelps', source_kind: 'youtube' }, 2: { id: 2, slug: '2-14-gems', dir: '/d2', speaker: null, source_kind: 'youtube' } };
    const metas = { '/d1': { title: 'Gems of Divine Mysteries (1/14)', speaker: 'Steven Phelps' }, '/d2': { title: '2/14 Gems of Divine Mysteries' } };
    const written = {}; const queue = vi.fn();
    const r = await mediaMetaFixJob({ write: true }, { repo: { listSpeakers: async () => [], doneItemIds: async () => [1, 2], getMediaItem: async (id) => items[id] },
      ops: { pendingRuns: async () => [] }, queue, roots: { mediaRoot: () => '/tank/media' }, readMeta: async (d) => metas[d], writeMeta: async (d, m) => { written[d] = m; } });
    expect(r.changed.find((c) => c.slug === '2-14-gems')).toMatchObject({ speaker: 'Steven Phelps', title: 'Gems of Divine Mysteries — Part 2 of 14' });
    expect(written['/d2'].speaker).toBe('Steven Phelps');
    expect(queue).toHaveBeenCalledWith('media-item', { id: 2, redo: ['update'] }, 'media-meta-fix');
  });
});
