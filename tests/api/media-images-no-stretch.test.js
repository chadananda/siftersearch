// Chad 10-22: "you are stretching the aspect ratio of pictures. do not do this." Every <img> on the media surfaces must
// either be object-fit: cover (face-centred crops from the image service) or carry no fixed box — never a width+height
// box that scales a picture non-uniformly. Server-rendered images (the quote cards) resize with fit: 'cover'.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { computeCoverCrop } from '../../worker/img/transform.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk(join(ROOT, 'src/components/media')), ...walk(join(ROOT, 'src/pages/media'))].filter((f) => /\.(svelte|astro)$/.test(f));

describe('media images never stretch', () => {
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const imgs = [...src.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    if (!imgs.length) continue;
    it(f.replace(ROOT, ''), () => {
      for (const tag of imgs) {
        const cls = (tag.match(/class="([^"]*)"/) || [])[1] || '';
        const coverClass = /\bobject-cover\b/.test(cls)
          || cls.split(/\s+/).some((c) => c && new RegExp(`\\.${c}\\s*\\{[^}]*object-fit:\\s*cover`).test(src));
        const boxed = /\b(width|height)=/.test(tag) || /\b(h-|w-|aspect-)/.test(cls);
        expect(!boxed || coverClass, `stretchable <img> in ${f}: ${tag.slice(0, 160)}`).toBe(true);
      }
    });
  }
  it('the image service scales uniformly before it crops (portrait, landscape, upscale)', () => {
    for (const [sw, sh, tw, th] of [[400, 560, 640, 1024], [400, 524, 256, 256], [1600, 900, 320, 400], [200, 260, 440, 550]]) {
      const g = computeCoverCrop(sw, sh, tw, th, { fx: 0.5, fy: 0.2 });
      expect(Math.abs(g.scaledW / g.scaledH - sw / sh) / (sw / sh)).toBeLessThan(0.01);
      expect([g.cropW, g.cropH]).toEqual([tw, th]);
      expect(g.scaledW >= tw && g.scaledH >= th).toBe(true);
    }
  });
  it('server-rendered quote cards crop with fit: cover', () => {
    const card = readFileSync(join(ROOT, 'api/lib/media/moment-card.js'), 'utf8');
    for (const m of card.matchAll(/\.resize\(([^)]*)\)/g)) expect(m[1]).toMatch(/fit:\s*'cover'/);
  });
});
