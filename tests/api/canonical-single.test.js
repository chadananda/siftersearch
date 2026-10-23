// Exactly ONE <link rel="canonical"> (and one og:url) per page. Layout.astro emits both through astro-seo from its
// `canonical` prop; until 10-23 /library/* and /research/* also emitted their own, so every library page carried two
// (and a collection URL's two disagreed on the trailing slash). The SSR HTML itself is checked live by
// tests/e2e/seo-canonical-sitemap.spec.js; this guards the source.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name))
  : /\.(astro|svelte)$/.test(e.name) ? [join(d, e.name)] : []));
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('one canonical per page', () => {
  it('no page or component emits its own <link rel="canonical"> or og:url (Layout does, once)', () => {
    const offenders = walk(join(ROOT, 'src')).map((f) => [relative(ROOT, f), strip(readFileSync(f, 'utf8'))])
      .filter(([f, s]) => f !== 'src/layouts/Layout.astro' && (/rel=["']canonical["']/.test(s) || /property=["']og:url["']/.test(s)))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });
  it('Layout takes the page canonical and passes it to astro-seo once', () => {
    const s = readFileSync(join(ROOT, 'src/layouts/Layout.astro'), 'utf8');
    expect(s).toMatch(/canonical\?: string/);
    expect(s.match(/canonical=\{canonicalUrl\}/g)).toHaveLength(1);
  });
  it('the library page hands Layout its canonical (the document\'s own stored path)', () => {
    const s = readFileSync(join(ROOT, 'src/pages/library/[...path].astro'), 'utf8');
    expect(s).toMatch(/canonical=\{canonicalUrl\}/);
    expect(s).toMatch(/doc\.slug/);
  });
});
