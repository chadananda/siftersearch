// Every host site loads Anis through /widget.js. The element bundle URL was unversioned with a 5-minute cache, so a
// deploy was invisible until caches expired (the home page kept an old Anis without the open hook). The loader now
// points at /widget/sifter-chat.js?v=<content hash>: a new build is a new URL, and that URL can be cached forever.
import { describe, it, expect } from 'vitest';
import { versionedLoader, bundleHash } from '../../api/routes/widget.js';

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
});
