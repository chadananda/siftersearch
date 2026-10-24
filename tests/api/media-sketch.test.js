// Speaker SKETCHES (Chad 10-23: pen-and-ink courtroom-style portraits): a manifest entry is used only with both masters and
// the verified photo it was drawn from; the drawing is the portrait in listing rows (every day — no photo rotation over
// it), the talk page keeps the real photos behind the drawing, and shorts take the 9:16 drawing.
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { shapeSketch, loadSketches, sketchOf } from '../../api/lib/media/sketch.js';
import { dayPick, galleryOf, sketchOf as itemSketch } from '../../src/lib/speaker-gallery.js';
import { mediaShortJob } from '../../api/lib/ops/media-jobs.js';

const E = { file: 'media-speakers/ab/sketch-0123456789abcdef.jpg', sha: 'a'.repeat(64), sq_file: 'media-speakers/ab/sketch-sq-0123456789abcdef.jpg', sq_sha: 'b'.repeat(64),
  width: 768, height: 1376, source_sha: 'c'.repeat(64), source_credit: 'The Bahá’í World, vol. 13', model: 'gemini-3.1-flash-image' };

describe('sketch manifest', () => {
  it('shapes an entry: both masters versioned by hash, ai_rendered, the source photo named', () => {
    const s = shapeSketch(E);
    expect(s.url).toMatch(/media-speakers\/ab\/sketch-0123456789abcdef\.jpg\?v=aaaaaaaaaaaaaaaa$/);
    expect(s.square).toMatch(/sketch-sq-0123456789abcdef\.jpg\?v=bbbbbbbbbbbbbbbb$/);
    expect(s).toMatchObject({ ai_rendered: true, source_sha: E.source_sha, width: 768, height: 1376 });
  });
  it('refuses a drawing without its source photo, a bad file or a bad hash', () => {
    expect(shapeSketch({ ...E, source_sha: null })).toBeNull();
    expect(shapeSketch({ ...E, file: 'elsewhere/x.jpg' })).toBeNull();
    expect(shapeSketch({ ...E, sq_sha: 'zz' })).toBeNull();
  });
  it('loads a manifest file (bad entries dropped); a missing file means no sketches', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'sk-')), 'm.json');
    writeFileSync(f, JSON.stringify({ speakers: { ab: E, cd: { ...E, source_sha: null } } }));
    const m = loadSketches(f);
    expect([...m.keys()]).toEqual(['ab']);
    expect(sketchOf('ab', m).ai_rendered).toBe(true);
    expect(sketchOf('cd', m)).toBeNull();
    expect(loadSketches(join(tmpdir(), 'no-such-sketches.json')).size).toBe(0);
  });
});

describe('pages', () => {
  it('a drawn listing row keeps its drawing every day; an undrawn one still rotates its photos', () => {
    const drawn = { k: 'ab', p: 'sk.jpg', dr: 1, g: [{ u: '1.jpg' }, { u: '2.jpg' }] };
    for (const d of [new Date(0), new Date(86400_000), new Date(2 * 86400_000)]) expect(dayPick(drawn, d).p).toBe('sk.jpg');
    const plain = { k: 'ab', p: '1.jpg', g: [{ u: '1.jpg' }, { u: '2.jpg' }] };
    expect(new Set([0, 1, 2].map((n) => dayPick(plain, new Date(n * 86400_000)).p))).toEqual(new Set(['1.jpg', '2.jpg']));
  });
  it('the talk page: the drawing leads, the photos (with credits) stay behind it — never the drawing as a photo', () => {
    const thumb = { kind: 'photo', url: 'sk-sq.jpg', photo_url: 'photo.jpg', credit: 'BW 13', sketch: { square: 'sk-sq.jpg', url: 'sk.jpg', source_credit: 'BW 13' } };
    expect(itemSketch({ thumb })).toMatchObject({ square: 'sk-sq.jpg', url: 'sk.jpg' });
    expect(galleryOf({ thumb }).map((p) => [p.url, p.credit])).toEqual([['photo.jpg', 'BW 13']]);
    expect(galleryOf({ thumb: { ...thumb, gallery: [{ url: 'a.jpg', credit: 'x' }, { url: 'b.jpg' }] } }).map((p) => p.url)).toEqual(['a.jpg', 'b.jpg']);
    expect(itemSketch({ thumb: { kind: 'photo', url: 'p.jpg' } })).toBeNull();
  });
  it('a short takes the speaker’s 9:16 drawing; without one, the extended photo master', async () => {
    const seen = [];
    const repo = { getMediaBySlug: async () => ({ slug: 's', speaker_key: 'ab' }), getSpeaker: async () => ({ file: 'media-speakers/ab.jpg', sha: 'd'.repeat(64) }) };
    const short = { renderShortFor: async (item, params, deps) => { seen.push(await deps.portraitUrl(item)); return {}; } };
    await mediaShortJob({ slug: 's' }, { repo, short, sketchOf: () => ({ url: 'https://x/sk.jpg' }) });
    await mediaShortJob({ slug: 's' }, { repo, short, sketchOf: () => null });
    expect(seen[0]).toBe('https://x/sk.jpg');
    expect(seen[1]).toMatch(/media-speakers\/ab\.jpg\?v=dddd/);
  });
});
