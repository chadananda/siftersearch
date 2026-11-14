// src/lib/anis-host.js: the designed pages on anis.oceanlibrary.com — path map, link re-pointing, brand, redirects.
import { describe, it, expect } from 'vitest';
import { isAnisHost, astroPath, anisPath, anisHref, anisTitle, anisHtml, anisResponse } from '../../src/lib/anis-host.js';

describe('anis-host', () => {
  it('knows the host', () => {
    expect(isAnisHost('https://anis.oceanlibrary.com/media')).toBe(true);
    expect(isAnisHost(new URL('https://siftersearch.com/media'))).toBe(false);
    expect(isAnisHost('not a url')).toBe(false);
  });
  it('maps paths both ways', () => {
    expect(astroPath('/bio/the-bab', ['bio'])).toBe('/biography/the-bab');
    expect(astroPath('/discuss/x-y', ['discuss'])).toBe('/dialogue/x-y');
    expect(astroPath('/doc/1')).toBe(null);
    expect(anisPath('/biography/the-bab')).toBe('/bio/the-bab');
    expect(anisPath('/dialogue')).toBe('/discuss');
    expect(anisPath('/biographyx')).toBe('/biographyx');
  });
  it('re-points links: Anís paths kept, siftersearch-only pages dropped, other sites untouched', () => {
    expect(anisHref('/biography/the-bab')).toBe('/bio/the-bab');
    expect(anisHref('https://siftersearch.com/media/a?t=5#p2')).toBe('https://anis.oceanlibrary.com/media/a?t=5#p2');
    expect(anisHref('/search?q=x')).toBe('https://anis.oceanlibrary.com/');   // search → the Anís app (link policy)
    expect(anisHref('/admin')).toBe(null);
    expect(anisHref('https://oceanlibrary.com/x')).toBe('https://oceanlibrary.com/x');
    expect(anisHref('#top')).toBe('#top');
    expect(anisHref('/')).toBe('/');
  });
  it('brands titles as Anís', () => {
    expect(anisTitle('A Talk — SifterSearch Media')).toBe('A Talk — Anís');
    expect(anisTitle('Talks — SifterSearch')).toBe('Talks — Anís');
  });
  it('rewrites a rendered page so it names no siftersearch.com page Anís does not serve', () => {
    const { html, dropped } = anisHtml('<a class="x" href="/admin">Admin</a><a href="/biography/x">X</a><img src="/media/a/thumb.jpg">'
      + '<script type="application/ld+json">{"url":"https://siftersearch.com/media/a","publisher":"SifterSearch Media"}</script>');
    expect(html).toContain('<a class="x">Admin</a>');
    expect(html).toContain('href="/bio/x"');
    expect(html).toContain('"url":"https://anis.oceanlibrary.com/media/a"');
    expect(html).toContain('"publisher":"Anís"');
    expect(dropped).toEqual(['/admin']);
  });
  it('re-points redirects and pages, passes other bodies through', async () => {
    const r = await anisResponse(new Response(null, { status: 301, headers: { location: '/biography/b' } }));
    expect(r.headers.get('location')).toBe('/bio/b');
    const p = await anisResponse(new Response('<a href="/dialogue/z">z</a>', { headers: { 'content-type': 'text/html' } }));
    expect(await p.text()).toBe('<a href="/discuss/z">z</a>');
    const j = new Response('{"u":"https://siftersearch.com/x"}', { headers: { 'content-type': 'application/json' } });
    expect(await anisResponse(j)).toBe(j);
  });
});

describe('anis-host: the link policy behind it', () => {
  it('library and document links go through anisUrl; URL-encoded share links are re-pointed too', () => {
    expect(anisHref('https://siftersearch.com/search?q=x')).toBe('https://anis.oceanlibrary.com/');
    const { html } = anisHtml('<a href="https://x.com/intent/post?text=hi&amp;url=https%3A%2F%2Fsiftersearch.com%2Fmedia%2Fa%2Fm%2Fk1">x</a>'
      + '<i data-p="{&quot;url&quot;:&quot;https://siftersearch.com/library/bahai/x/y#p8&quot;}"></i>');
    expect(html).toContain('url=https%3A%2F%2Fanis.oceanlibrary.com%2Fmedia%2Fa%2Fm%2Fk1');
    expect(html).toContain('&quot;url&quot;:&quot;https://anis.oceanlibrary.com/&quot;');
    expect(html).not.toMatch(/siftersearch\.com/i);
  });
});
