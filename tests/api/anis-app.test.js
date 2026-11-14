// anis.oceanlibrary.com as an installable app (worker/anis-app.js): manifest, root-scoped service worker, TWA asset link, root page.
import { describe, it, expect } from 'vitest';
import { anisAppRoute, MANIFEST, assetLinks, APP_PAGE } from '../../worker/anis-app.js';
import fs from 'node:fs';

const at = (p) => anisAppRoute(new URL(`https://anis.oceanlibrary.com${p}`), {});

describe('Anís app host', () => {
  it('the root renders the app page; unknown paths fall through', () => {
    expect(at('/')).toBe(APP_PAGE);
    expect(at('/d/abcdef12')).toBeNull();
    expect(at('/api/chat/stream')).toBeNull();
  });
  it('serves an installable manifest whose icons exist', async () => {
    const r = at('/anis.webmanifest');
    expect(r.headers.get('content-type')).toContain('manifest+json');
    const m = await r.json();
    expect(m).toMatchObject({ display: 'standalone', scope: '/', short_name: 'Anís' });
    for (const p of ['any', 'maskable', 'monochrome']) expect(m.icons.some((i) => i.purpose === p)).toBe(true);
    expect(m.prefer_related_applications).toBe(false);
    for (const f of ['store-1024.png', 'play-feature-1024x500.png', 'og-1200x630.png', 'favicon.ico']) expect(fs.existsSync(`public/anis-app/${f}`)).toBe(true);
    for (const i of MANIFEST.icons) expect(fs.existsSync(`public${i.src}`)).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/sifter/i);
  });
  it('the service worker may control the whole host and never caches chat or the widget', async () => {
    const r = at('/anis-sw.js');
    expect(r.headers.get('service-worker-allowed')).toBe('/');
    const src = await r.text();
    expect(src).toContain('(api|widget|d|discuss|doc|bio|media)');
    expect(() => new Function(src.replace(/self\.|caches\.|location\./g, 'globalThis.'))).not.toThrow();
  });
  it('asset links stay empty until the Android package is configured', () => {
    expect(assetLinks({})).toEqual([]);
    const [l] = assetLinks({ ANIS_TWA_PACKAGE: 'com.oceanlibrary.anis', ANIS_TWA_SHA256: 'AA:BB, CC:DD' });
    expect(l.target).toMatchObject({ package_name: 'com.oceanlibrary.anis', sha256_cert_fingerprints: ['AA:BB', 'CC:DD'] });
  });
  it('the page carries the Apple home-screen tags and no SifterSearch branding', () => {
    const page = fs.readFileSync('src/pages/anis-app.astro', 'utf8');
    for (const t of ['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-touch-icon', 'viewport-fit=cover', '/anis.webmanifest', '/anis-sw.js'])
      expect(page).toContain(t);
    expect(page.replace(/const TOKEN = '[^']+';/, '').replace(/^\/\/.*$/gm, '')).not.toMatch(/siftersearch/i);
  });
  it('the host has its own robots and sitemap, and root icons come from the app\'s files', async () => {
    const robots = await at('/robots.txt').text();
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Sitemap: https://anis.oceanlibrary.com/anis-sitemap.xml');
    expect(await at('/anis-sitemap.xml').text()).toContain('<loc>https://anis.oceanlibrary.com/</loc>');
    const asked = [];
    await anisAppRoute(new URL('https://anis.oceanlibrary.com/favicon.ico'), { ASSETS: { fetch: (u) => { asked.push(String(u)); return new Response('x'); } } });
    expect(asked).toEqual(['https://anis.oceanlibrary.com/anis-app/favicon.ico']);
  });
  it('the page has structured data and a crawlable heading', () => {
    const page = fs.readFileSync('src/pages/anis-app.astro', 'utf8');
    for (const t of ["'@type': 'WebApplication'", '<h1>', 'summary_large_image', 'og-1200x630.png']) expect(page).toContain(t);
    expect(page).toContain("version:'${pkg.version}'");   // the app shows its build beside the title (Chad 11-13)
  });
  it('paints the widget shell from the first byte, pinned to the bundle that is built (P6: rerun `npm run build:widget`)', async () => {
    const { bundleHash } = await import('../../api/routes/widget.js');
    const shell = JSON.parse(fs.readFileSync('src/widget/anis-shell.json', 'utf8'));
    expect(shell.v).toBe(bundleHash(fs.readFileSync('api/static/widget/sifter-chat.js', 'utf8')));
    expect(shell.html).toMatch(/^<div class="root calm /);              // never animates in
    expect(shell.html).toContain('class="welcome');
    expect(shell.html).toContain('role="main"');                        // the page's one main landmark
    expect(shell.html).not.toMatch(/siftersearch/i);
    const page = fs.readFileSync('src/pages/anis-app.astro', 'utf8');
    for (const t of ['<template shadowrootmode="open" set:html={shellHtml}>', 'onload="anisMount()"', "sifter-chat-${shell.v}", 'html:not(.js) [data-anis-shell]'])
      expect(page).toContain(t);
  });
});
