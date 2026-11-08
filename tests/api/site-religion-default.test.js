// site-religion-default: bahai-library.com / oceanoflights docs with no religion → Baha'i unless they are the site's Bible/Qur'an copies.
import { describe, it, expect } from 'vitest';
import { siteReligion, siteReligionDefaultJob } from '../../api/lib/ops/site-religion-default-job.js';

describe('siteReligion', () => {
  it.each([
    [{ title: 'Bible', author: 'bible-bible' }, 'Christian'], [{ title: 'Bible, 4-9 (Num-1Sam)', author: 'bible-bible-part2' }, 'Christian'],
    [{ title: 'AL KORAN', author: 'Sonia Zamir' }, 'Islam'], [{ title: 'rodwell', author: 'quran-quranrodwell' }, 'Islam'],
    [{ title: 'Sura 2', author: 'writings-quran-002' }, 'Islam'], [{ title: "The Qur'an", author: 'x' }, 'Islam'],
    [{ title: 'lambden_bahai_interpretation_bible', author: 'docs-l-lambden' }, "Baha'i"],
    [{ title: 'Messages to Canada: 1999 edition', author: '2478' }, "Baha'i"], [{ title: 'Star of the West Volume 1', author: 'star' }, "Baha'i"],
    [{}, "Baha'i"],
  ])('%j → %s', (d, r) => expect(siteReligion(d)).toBe(r));
});

describe('siteReligionDefaultJob', () => {
  const rows = { 'bahai-library.com': [{ id: 1, title: 'Bible', author: 'bible-bible', religion: null }, { id: 2, title: 'Star', author: 'star', religion: '' },
    { id: 3, title: 'Has one', author: 'x', religion: 'Christian' }], 'oceanoflights.org': [{ id: 4, title: 'Lawh', author: 'file-x', religion: null }] };
  const docs = async ({ sourceSite, afterId }) => ({ docs: afterId ? [] : rows[sourceSite] });
  it('dry run counts, writes nothing', async () => {
    const r = await siteReligionDefaultJob({}, { docs, corrections: async () => { throw new Error('no'); }, enqueue: async () => { throw new Error('no'); } });
    expect(r).toMatchObject({ scanned: 4, changed: 3, perSite: { 'bahai-library.com': 2, 'oceanoflights.org': 1 }, perReligion: { Christian: 1, "Baha'i": 2 }, restamp: null });
  });
  it('write corrects, then queues the restamp', async () => {
    const sent = [], q = [];
    const r = await siteReligionDefaultJob({ write: true }, { docs, corrections: async ({ fixes }) => { sent.push(...fixes); return { changes: fixes }; }, enqueue: async (...a) => { q.push(a); return 7; } });
    expect(sent).toEqual([{ id: 1, religion: 'Christian' }, { id: 2, religion: "Baha'i" }, { id: 4, religion: "Baha'i" }]);
    expect(q).toEqual([['doc-author-restamp', { ids: [1, 2, 4], was: { 1: 'bible-bible', 2: 'star', 4: 'file-x' } }, 'site-religion-default']]);
    expect(r.restamp).toBe(7);
  });
});
