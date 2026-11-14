// SBS print helpers + SSR render of the document against the fixture contract.
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'fs';
import { smartQuotes, isOrnament, prepRow, loadAll, sectionStarts, cssString, sbsUrl } from '../../src/lib/sbs.js';
import SbsDocument from '../../src/components/print/SbsDocument.svelte';
const fx = JSON.parse(readFileSync('tests/fixtures/sbs-sample.json', 'utf8'));
describe('sbs helpers', () => {
  it('smart quotes', () => { expect(smartQuotes('"Love," he said, \'it\'s\'')).toBe('“Love,” he said, ‘it’s’'); });
  it('ornaments', () => { expect(isOrnament(' * * * ')).toBe(true); expect(isOrnament('a*')).toBe(false); expect(prepRow({ o: '*', t: '*' }).orn).toBe(true); expect(prepRow({ o: 'x', t: '"y"' }).t).toBe('“y”'); });
  it('section starts + css string + url', () => { expect(sectionStarts(fx.sections).get(5).i).toBe(1); expect(cssString('a"b\\')).toBe('a\\"b\\\\'); expect(sbsUrl('http://x', 'a b', 400)).toBe('http://x/api/library/documents/a%20b/sbs?offset=400&limit=400'); });
  it('loadAll follows next_offset', async () => {
    const pages = { 0: { ...fx, paragraphs: fx.paragraphs.slice(0, 4), next_offset: 4 }, 4: { ...fx, sections: [], paragraphs: fx.paragraphs.slice(4), next_offset: null } };
    const calls = []; const f = async (u) => { const o = +/offset=(\d+)/.exec(u)[1]; calls.push(o); return { ok: true, json: async () => pages[o] }; };
    const r = await loadAll(f, 'http://x', 1); expect(r.paragraphs.length).toBe(8); expect(calls).toEqual([0, 4]); expect(r.sections.length).toBe(2);
  });
});
describe('SbsDocument SSR', () => {
  it('renders cover, contents, rows, paragraph numbers', () => {
    const { body } = render(SbsDocument, { props: { docId: '999', initial: fx, pageUrl: 'http://x/print/sbs/999' } });
    expect(body).toContain('The Hidden Words'); expect(body).toContain('Contents'); expect(body).toContain('From the Persian'); expect(body).toContain('۝');
    expect((body.match(/class="row[ "]/g) || []).length).toBeGreaterThanOrEqual(8); expect(body).toContain('“Love is My stronghold,”');
  });
  it('403 shows copyright message', () => { expect(render(SbsDocument, { props: { docId: '1', initial: null, initialStatus: 403 } }).body).toContain('copyright'); });
  it('cssString cannot close the style element', () => {
    expect(cssString('a</style><script>x</script>')).not.toContain('<');
    expect(cssString('say "hi"')).toBe('say \\"hi\\"');
  });
});
