// A /docs publish evicts the edge copies (page, API row, nav list) so the site shows it at once (Chad 11-03: "still there").
import { describe, it, expect } from 'vitest';
import { readFileSync as rf } from 'fs';

describe('docs edge purge', () => {
  it('the worker purge route takes ?doc= and evicts the docs page, its API row and the pages list', () => {
    const w = rf(new URL('../../worker/index.js', import.meta.url), 'utf8');
    expect(w).toContain("url.searchParams.get('doc')");
    expect(w).toContain('at(`/docs/${slug}`, \'html\'), at(`/api/v1/pages/${slug}`, \'api\'), at(\'/api/v1/pages\', \'api\')');
  });
  it('publish-docs calls the purge after each PUT, with the internal key', () => {
    const s = rf(new URL('../../scripts/anis/publish-docs.mjs', import.meta.url), 'utf8');
    expect(s).toMatch(/\/_edge\/purge\?doc=\$\{d\.slug\}[^\n]*x-internal-key/);
  });
});
