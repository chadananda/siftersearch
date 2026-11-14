// Every host site loads Anis through /widget.js. The element bundle URL was unversioned with a 5-minute cache, so a
// deploy was invisible until caches expired (the home page kept an old Anis without the open hook). The loader now
// points at /widget/sifter-chat.js?v=<content hash>: a new build is a new URL, and that URL can be cached forever.
import { describe, it, expect } from 'vitest';
import { versionedLoader, publicLoader, bundleHash, pinnedAsset, LOADER_CACHE, PINNED_CACHE } from '../../api/routes/widget.js';

describe('widget bundle versioning', () => {
  it('stamps the bundle URL in the loader with the content hash', () => {
    const loader = "var BUNDLE = api + '/widget/sifter-chat.js';";
    expect(versionedLoader(loader, 'abc123')).toContain("var BUNDLE = api + '/widget/sifter-chat.js?v=abc123';");
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
    const loader = "var api = new URL(script.src).origin;\n  var BUNDLE = api + '/widget/sifter-chat.js';";
    const out = publicLoader(loader, 'h1', 'https://siftersearch.com');
    expect(out).toContain('/widget/sifter-chat.js?v=h1');
    const run = (src) => new Function('script', out.split('\n')[0] + ' return api;')({ src });
    expect(run('https://api.siftersearch.com/widget.js')).toBe('https://siftersearch.com');
    expect(run('https://siftersearch.com/widget.js')).toBe('https://siftersearch.com');
    expect(run('http://localhost:7839/widget.js')).toBe('http://localhost:7839');
    const two = publicLoader(loader, 'h1', 'https://siftersearch.com', ['https://anis.oceanlibrary.com']);
    const run2 = (src) => new Function('script', two.split('\n')[0] + ' return api;')({ src });
    expect(run2('https://anis.oceanlibrary.com/widget.js')).toBe('https://anis.oceanlibrary.com');
    expect(run2('https://api.siftersearch.com/widget.js')).toBe('https://siftersearch.com');
  });

  it('the loader is revalidated on every page load (never browser-cached)', () => {
    expect(LOADER_CACHE).toMatch(/no-cache/);
    expect(LOADER_CACHE).not.toMatch(/max-age=[1-9]/);
  });

  it('the real loader is stamped: versioned bundle URL, per-build tag, public origin', async () => {
    const { readFileSync } = await import('fs');
    const real = readFileSync(new URL('../../api/static/widget/widget.js', import.meta.url), 'utf8');
    const out = publicLoader(real, 'beef01', 'https://siftersearch.com');
    expect(out).toContain("var BUNDLE = api + '/widget/sifter-chat.js?v=beef01';");
    expect(out).toContain("'sifter-chat-' + ver");
    expect(out).toContain('api = "https://siftersearch.com"');
  });
  it('the element and the lazy voice bundle are immutable only at their own hash; the loader never', () => {
    const hashes = { 'sifter-chat.js': 'aaa', 'anis-voice.js': 'bbb' };
    expect(pinnedAsset('anis-voice.js', 'bbb', hashes)).toBe(true);
    expect(pinnedAsset('anis-voice.js', 'aaa', hashes)).toBe(false);
    expect(pinnedAsset('sifter-chat.js', 'aaa', hashes)).toBe(true);
    expect(pinnedAsset('anis-voice.js', undefined, { 'anis-voice.js': undefined })).toBe(false);
    expect(pinnedAsset('widget.js', 'x', { 'widget.js': 'x' })).toBe(false);
  });
  it('a pinned build is kept a year by browsers and the edge (s-maxage), immutable', () => {
    expect(PINNED_CACHE).toMatch(/\bimmutable\b/);
    expect(PINNED_CACHE).toMatch(/max-age=31536000/);
    expect(PINNED_CACHE).toMatch(/s-maxage=31536000/);
  });
});
