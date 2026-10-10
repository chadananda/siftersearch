// Every image on the site goes through the image service (Chad 10-10): no raw public-R2 or ImageKit URL in page code —
// use imgSet / svcFixed / ikUrl from src/lib/imagekit.js (the one place that knows those hosts).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const RAW = /pub-[0-9a-f]{32}\.r2\.dev|ik\.imagekit\.io/;

describe('images load through the image service', () => {
  it('no raw R2 / ImageKit URL outside src/lib/imagekit.js', () => {
    const hits = walk('src').filter((p) => /\.(astro|svelte|js|ts|css)$/.test(p) && !p.endsWith('lib/imagekit.js'))
      .filter((p) => RAW.test(readFileSync(p, 'utf8')));
    expect(hits).toEqual([]);
  });
});
