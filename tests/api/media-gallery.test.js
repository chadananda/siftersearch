// Speaker galleries (Chad 10-23: "numerous photos of each speaker so we can rotate them"): the curated manifest → ordered
// rows (primary first, invalid entries reported), an idempotent sync, the API shape (credits, extended master), the
// AI-extended master made once within a $ cap, and the portrait inventory over published + queued talks.
import { describe, it, expect, vi } from 'vitest';
import { manifestRows, planGallerySync, speakerGallery, compactGallery, coverage, entryProblem, photoUrl } from '../../api/lib/media/gallery.js';
import { mediaGalleryJob, mediaPortraitInventoryJob } from '../../api/lib/ops/media-gallery-jobs.js';
import { dayPick, galleryOf } from '../../src/lib/speaker-gallery.js';

const sha = (c) => c.repeat(64);
const E = (c, extra = {}) => ({ file: `media-speakers/ab/${c.repeat(16)}.jpg`, sha: sha(c), origin: 'bahai.media', source_url: `https://bahai.media/File:${c}.jpg`, credit: `cr ${c}`, ...extra });

describe('manifest → rows', () => {
  it('orders the primary first, ranks by position, drops duplicates and reports invalid entries', () => {
    const { rows, problems } = manifestRows({ speakers: { ab: [E('1'), E('2', { primary: true, year: 1972 }), E('1'), { file: 'x.jpg', sha: 'zz' }] } });
    expect(rows.get('ab').map((r) => [r.sha[0], r.rank, r.year])).toEqual([['2', 0, 1972], ['1', 1, null]]);
    expect(problems).toEqual([{ key: 'ab', i: 3, why: 'bad file x.jpg' }]);
    expect(entryProblem(E('3', { source_url: null }))).toBe('no source');
    expect(entryProblem({ ...E('3', { source_url: null }), origin: 'current-primary' })).toBeNull();
  });
  it('sync plan: only new or changed rows are written; photos dropped from the manifest are deleted', () => {
    const { rows } = manifestRows({ speakers: { ab: [E('1'), E('2')] } });
    const want = rows.get('ab');
    expect(planGallerySync(want, [])).toMatchObject({ upserts: want, deletes: [] });
    const have = [{ ...want[0] }, { ...want[1], credit: 'old' }, { sha: sha('9') }];
    const p = planGallerySync(want, have);
    expect(p.upserts.map((r) => r.sha[0])).toEqual(['2']);
    expect(p.deletes).toEqual([sha('9')]);
  });
});

describe('API shape', () => {
  it('primary first; the media_speakers portrait leads when the gallery lacks it; extended only when made', () => {
    const rows = [{ speaker_key: 'a', sha: sha('2'), rank: 1, file: 'media-speakers/a/2.jpg', credit: 'B' },
      { speaker_key: 'a', sha: sha('1'), rank: 0, file: 'media-speakers/a/1.jpg', credit: 'A', year: 1980, ext_file: 'media-speakers/a/1-ext.jpg', ext_sha: sha('e') }];
    const g = speakerGallery(rows, { url: 'https://x/primary.jpg?v=1', credit: 'P' });
    expect(g.map((p) => p.credit)).toEqual(['P', 'A', 'B']);
    expect(g[1].extended).toMatchObject({ url: photoUrl('media-speakers/a/1-ext.jpg', sha('e')), ai_extended: true });
    expect(g[2].extended).toBeNull();
    expect(speakerGallery(rows, { url: g[1].url }).length).toBe(2);   // the primary already in the gallery is not repeated
    expect(compactGallery(g)[1]).toEqual({ u: g[1].url, x: g[1].extended.url, cr: 'A', y: 1980 });
    expect(coverage([{ photos: 0 }, { photos: 1 }, { photos: 2 }, { photos: 7 }])).toEqual({ people: 4, none: 1, one: 1, two: 1, three_plus: 1 });
  });
});

describe('pages: the day pick', () => {
  it('is deterministic per person and day, differs across days, and keeps the primary without a gallery', () => {
    const s = { k: 'adib-taherzadeh', p: 'P', px: 'PX', cr: 'c', g: [{ u: 'A', x: 'AX', cr: 'ca' }, { u: 'B', cr: 'cb' }, { u: 'C' }] };
    const d = new Date('2026-10-23T12:00:00Z');
    expect(dayPick(s, d)).toEqual(dayPick(s, d));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => dayPick(s, new Date(d.getTime() + i * 86400_000)).p));
    expect(seen.size).toBe(3);
    const pick = dayPick(s, d);
    expect(pick.k).toBe('adib-taherzadeh');
    expect(['A', 'B', 'C']).toContain(pick.p);
    expect(dayPick({ k: 'x', p: 'P', px: 'PX' }, d)).toMatchObject({ p: 'P', px: 'PX' });
    expect(galleryOf({ thumb: { url: 'U', credit: 'c', gallery: [{ url: 'U' }, { url: 'V' }] } }).length).toBe(2);
    expect(galleryOf({ thumb: { url: 'U', credit: 'c' } })).toEqual([{ url: 'U', credit: 'c', licence: null, year: null, source_url: null, page_url: null }]);
  });
});

describe('media-gallery job', () => {
  it('dry run reports, write applies, extend makes one master per needing photo within the cap', async () => {
    const applied = [], ext = [];
    let stored = [];
    const repo = { galleryRows: vi.fn(async () => stored), applyGallery: vi.fn(async (k, p) => { applied.push([k, p]); stored = p.upserts.map((r) => ({ ...r })); }),
      setGalleryExtension: vi.fn(async (k, s, f) => ext.push([k, s, f])) };
    const manifest = { speakers: { ab: [E('1', { needs_ext: true }), E('2')] } };
    expect(await mediaGalleryJob({}, { repo, manifest })).toMatchObject({ people: 1, photos: 2, upserts: 2, write: false });
    expect(applied).toEqual([]);
    await mediaGalleryJob({ write: true }, { repo, manifest });
    expect(applied[0][1].upserts.length).toBe(2);
    expect((await mediaGalleryJob({ write: true }, { repo, manifest })).upserts).toBe(0);   // idempotent
    const outpaint = { extendPortrait: vi.fn(async () => ({ bytes: Buffer.from('jpg'), usd: 0.042 })), geminiOutpaint: vi.fn() };
    const putCdnPortrait = vi.fn(async (k) => k);
    const r = await mediaGalleryJob({ extend: true }, { repo, manifest, outpaint, model: 'm', tools: { imageSize: async () => ({ w: 600, h: 600 }), ffmpeg: vi.fn() },
      speakers: { putCdnPortrait }, fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array(10).buffer }) });
    expect(r).toMatchObject({ extended: 1, usd: 0.042 });
    expect(putCdnPortrait.mock.calls[0][0]).toBe(`media-speakers/ab/${'1'.repeat(16)}-ext.jpg`);
    expect(ext[0][2]).toMatchObject({ ext_file: `media-speakers/ab/${'1'.repeat(16)}-ext.jpg`, ext_model: 'm' });
    stored[0].ext_file = 'done';
    expect((await mediaGalleryJob({ extend: true }, { repo, manifest, outpaint, model: 'm', tools: {}, speakers: { putCdnPortrait } })).extended).toBe(0);
    stored[0].ext_file = null;
    expect((await mediaGalleryJob({ extend: true, maxUsd: 0 }, { repo, manifest, outpaint, model: 'm', tools: {}, speakers: { putCdnPortrait } })).stopped).toBe('$0 cap');
  });
});

describe('media-portrait-inventory', () => {
  it('one person across name forms and states, Hands/UHJ first, photos from the gallery or the primary', async () => {
    const repo = {
      speakerStateCounts: async () => [{ speaker: 'Taherzadeh', speaker_key: 'taherzadeh', state: 'done', n: 40 }, { speaker: 'Adib Taherzadeh', speaker_key: 'adib-taherzadeh', state: 'queued', n: 80 },
        { speaker: 'Jane Doe', speaker_key: 'jane-doe', state: 'queued', n: 300 }, { speaker: 'Jane Doe', speaker_key: 'jane-doe', state: 'duplicate', n: 5 }],
      galleryRows: async () => [{ speaker_key: 'adib-taherzadeh' }, { speaker_key: 'adib-taherzadeh' }, { speaker_key: 'adib-taherzadeh' }],
      listSpeakers: async () => [{ key: 'jane-doe', file: 'media-speakers/jane-doe.jpg' }],
    };
    const people = [{ key: 'adib-taherzadeh', name: 'Adib Taherzadeh', role: 'uhj', aliases: ['A. Taherzadeh'], works: ['The Revelation of Bahá’u’lláh'] }];
    const r = await mediaPortraitInventoryJob({}, { repo, people });
    expect(r.people[0]).toMatchObject({ key: 'adib-taherzadeh', role: 'uhj', photos: 3, queued: 80 });
    expect(r.people.find((p) => p.key === 'jane-doe')).toMatchObject({ talks: 300, photos: 1 });
    expect(r.coverage).toMatchObject({ three_plus: 1 });
  });
});
