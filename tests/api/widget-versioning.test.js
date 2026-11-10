// Every host site loads Anis through /widget.js. The element bundle URL was unversioned with a 5-minute cache, so a
// deploy was invisible until caches expired (the home page kept an old Anis without the open hook). The loader now
// points at /widget/sifter-chat.js?v=<content hash>: a new build is a new URL, and that URL can be cached forever.
import { describe, it, expect } from 'vitest';
import { versionedLoader, publicLoader, bundleHash, LOADER_CACHE } from '../../api/routes/widget.js';

describe('widget bundle versioning', () => {
  it('stamps the bundle URL in the loader with the content hash', () => {
    const loader = "var bundle = document.createElement('script');\n  bundle.src = api + '/widget/sifter-chat.js';";
    expect(versionedLoader(loader, 'abc123')).toContain("bundle.src = api + '/widget/sifter-chat.js?v=abc123';");
  });

  it('the hash changes when the bundle changes, and is stable otherwise', () => {
    expect(bundleHash('a')).toBe(bundleHash('a'));
    expect(bundleHash('a')).not.toBe(bundleHash('b'));
    expect(bundleHash('a')).toMatch(/^[0-9a-f]{10}$/);
  });

  it('leaves a loader without the known line untouched (never breaks the embed)', () => {
    expect(versionedLoader('something else', 'x')).toBe('something else');
  });

  it('points the widget at the public site whatever address served the loader; local dev keeps its own', () => {
    const loader = "var api = new URL(script.src).origin;\n  bundle.src = api + '/widget/sifter-chat.js';";
    const out = publicLoader(loader, 'h1', 'https://siftersearch.com');
    expect(out).toContain('/widget/sifter-chat.js?v=h1');
    const run = (src) => new Function('script', out.split('\n')[0] + ' return api;')({ src });
    expect(run('https://api.siftersearch.com/widget.js')).toBe('https://siftersearch.com');
    expect(run('https://siftersearch.com/widget.js')).toBe('https://siftersearch.com');
    expect(run('http://localhost:7839/widget.js')).toBe('http://localhost:7839');
  });

  it('the loader is revalidated on every page load (never browser-cached)', () => {
    expect(LOADER_CACHE).toMatch(/no-cache/);
    expect(LOADER_CACHE).not.toMatch(/max-age=[1-9]/);
  });
});
