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
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of MANIFEST.icons) expect(fs.existsSync(`public${i.src}`)).toBe(true);
    expect(JSON.stringify(m)).not.toMatch(/sifter/i);
  });
  it('the service worker may control the whole host and never caches chat or the widget', async () => {
    const r = at('/anis-sw.js');
    expect(r.headers.get('service-worker-allowed')).toBe('/');
    const src = await r.text();
    expect(src).toContain('(api|widget|d)');
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
    expect(page.replace(/data-key="[^"]+"/, '').replace(/^\/\/.*$/gm, '')).not.toMatch(/siftersearch/i);
  });
});
