// /media/remaster (unlisted before/after demo): data + audio URLs, noindex, out of the sitemap, edge-cached, linked from
// /media, and the restoration tool is never named in anything shipped. Live render is verified after deploy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CLIPS, audioUrl, isUnlisted, REMASTER_PATH } from '../../src/lib/remaster-demo.js';
import { policyFor } from '../../worker/edge-cache.js';
import { mediaKey } from '../../worker/media.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const page = read('src/pages/media/remaster.astro');

describe('/media/remaster', () => {
  it('lists 13 clips, each with unique id, title, year and defect', () => {
    expect(CLIPS).toHaveLength(13);
    expect(new Set(CLIPS.map((c) => c.id)).size).toBe(13);
    for (const c of CLIPS) for (const k of ['id', 'title', 'year', 'defect']) expect(c[k]).toBeTruthy();
  });

  it('audio is same-origin and served from R2 by the media-file edge route', () => {
    const u = audioUrl('ioas', 'after');
    expect(u).toBe('/api/media/demo-remaster/file/ioas-after.m4a?v=1');
    expect(mediaKey(new URL('https://siftersearch.com' + u))).toBe('demo-remaster/ioas-after.m4a@1');
  });

  it('renders the title, before/after players and is noindex,nofollow', () => {
    expect(page).toContain('SifterSearch Media Recovery and Remaster');
    expect(page).toMatch(/noindex=\{true\}/);
    expect(page).toMatch(/X-Robots-Tag', 'noindex, nofollow'/);
    expect(page).toMatch(/audioUrl\(c\.id, 'before'\)/);
    expect(page).toMatch(/audioUrl\(c\.id, 'after'\)/);
    expect(page).toMatch(/o\.pause\(\)/);   // starting one pauses the others
  });

  it('is excluded from the sitemap', () => {
    expect(isUnlisted('https://siftersearch.com/media/remaster/')).toBe(true);
    expect(isUnlisted('https://siftersearch.com/media/remaster')).toBe(true);
    expect(isUnlisted('https://siftersearch.com/media')).toBe(false);
    expect(read('astro.config.mjs')).toMatch(/if \(isUnlisted\(page\)\) return false/);
  });

  it('is an edge-cached public page', () => {
    expect(policyFor(new URL('https://siftersearch.com' + REMASTER_PATH), 'GET', new Headers())).toMatchObject({ mode: 'cache', kind: 'html' });
  });

  it('is linked from /media', () => {
    expect(read('src/pages/media/index.astro')).toMatch(/href="\/media\/remaster"[^>]*cursor-pointer/);
  });

  it('never names the restoration tool', () => {
    for (const p of ['src/pages/media/remaster.astro', 'src/lib/remaster-demo.js', 'src/pages/media/index.astro']) {
      expect(read(p)).not.toMatch(/uni-?pase/i);
    }
  });
});
