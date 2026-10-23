// Name and work links (Chad 10-22): people → /biography/<id> through the biography set and the identity lookup; works → the
// canonical copy (OceanLibrary first) through the document finder; first mention per subheader section; confident only.
import { describe, it, expect, vi } from 'vitest';
import { linkMentions, resolvePerson, resolveWork, bioIndex, firstPerSection, spansOf } from '../../api/lib/media/links.js';
import { paragraphMarkdown, pageHtml } from '../../api/lib/media/render.js';

const bio = [{ id: 7, name: '‘Abdu’l-Bahá', aliases: ['the Master', '‘Abbás Effendi'] }, { id: 9, name: 'Shoghi Effendi', aliases: '["the Guardian"]' },
  { id: 11, name: 'Mullá Ḥusayn', aliases: [] }, { id: 12, name: 'Mullá Ḥusayn', aliases: [] }];
const m = (o) => ({ para: 1, i0: 0, i1: 1, text: 'x', kind: 'person', confidence: 0.95, ...o });

describe('people', () => {
  it('a name or an alias resolves to its one biography; a shared name is ambiguous; no lookup fallback', async () => {
    const index = bioIndex(bio);
    expect(await resolvePerson(m({ canonical: '‘Abdu’l-Bahá', text: 'the Master' }), { index })).toMatchObject({ entity_id: 7 });
    expect(await resolvePerson(m({ canonical: 'Shoghi Effendi', text: 'the Guardian' }), { index })).toMatchObject({ entity_id: 9 });
    expect((await resolvePerson(m({ text: 'Mullá Ḥusayn' }), { index })).why).toMatch(/ambiguous/);
    expect((await resolvePerson(m({ text: 'Shoghí Effendí Rabbání', canonical: 'Shoghi Effendi' }), { index })).why).toMatch(/no biography/);
  });
});

describe('works', () => {
  const docs = [{ id: 1, title: 'The Dawn-Breakers', source_site: 'bahai-library.com', language: 'en', paragraph_count: 900 },
    { id: 2, title: 'The Dawn-Breakers: Nabíl’s Narrative of the Early Days of the Bahá’í Revelation', source_site: 'oceanlibrary.com', language: 'en', paragraph_count: 2000 },
    { id: 3, title: 'Dawn-Breakers study guide', source_site: 'oceanlibrary.com', language: 'en' }];
  it('a title variant matches; the OceanLibrary copy wins; a derivative work does not match', async () => {
    const find = vi.fn(async () => docs);
    const r = await resolveWork(m({ kind: 'work', canonical: 'The Dawn-Breakers: Nabíl’s Narrative', text: 'Nabíl’s Narrative' }), { find });
    expect(r.doc.id).toBe(2);
    expect((await resolveWork(m({ kind: 'work', canonical: 'Gleanings' }), { find })).why).toMatch(/no held copy/);
  });
  it('a named chapter links to that section of the chosen copy', async () => {
    const sections = vi.fn(async () => [{ doc_id: 9, title: 'other' }, { doc_id: 2, title: 'Chapter III', start_index: 120, first_para_id: 'p121' }]);
    const r = await resolveWork(m({ kind: 'work', canonical: 'The Dawn-Breakers', section: 'Chapter III' }), { find: async () => docs, sections });
    expect(r.section).toMatchObject({ start_index: 120 });
  });
});

describe('linkMentions', () => {
  it('first mention per section, confident only; person → /biography/<id>; work → linkFor', async () => {
    const mentions = [m({ para: 1, text: 'the Master', canonical: '‘Abdu’l-Bahá' }), m({ para: 2, text: '‘Abdu’l-Bahá', canonical: '‘Abdu’l-Bahá' }),
      m({ para: 5, text: 'the Master', canonical: '‘Abdu’l-Bahá' }), m({ para: 5, text: 'Shoghi Effendi', canonical: 'Shoghi Effendi', confidence: 0.5 }),
      m({ para: 6, kind: 'work', text: 'the Íqán', canonical: 'Kitáb-i-Íqán' })];
    const linkFor = vi.fn((doc) => ({ url: `https://oceanlibrary.com/${doc.id}` }));
    const r = await linkMentions(mentions, [{ p: 4 }], { bio, find: async () => [{ id: 44, title: 'Kitáb-i-Íqán', source_site: 'oceanlibrary.com', language: 'en' }], linkFor });
    expect(r.links.map((l) => [l.para, l.url])).toEqual([[1, '/biography/7'], [5, '/biography/7'], [6, 'https://oceanlibrary.com/44']]);
    expect(r.unresolved.map((u) => u.why)).toEqual(['low confidence (0.5)']);
  });
  it('a quote wins where it overlaps a link', () => {
    expect(spansOf(1, [{ para: 1, i0: 2, i1: 6, url: 'q' }], [{ para: 1, i0: 3, i1: 4, url: '/biography/7' }, { para: 1, i0: 7, i1: 8, url: '/biography/9' }]).map((s) => s.url)).toEqual(['q', '/biography/9']);
  });
});

describe('renditions with links', () => {
  const words = 'then the Master read the Íqán aloud'.split(' ').map((w, i) => ({ w, s: i, e: i + 1 }));
  const p = { n: 1, t0: 0, t1: 7, spk: 'S1', words, sentences: [[0, 7]] };
  const links = [{ para: 1, i0: 1, i1: 3, kind: 'person', url: '/biography/7', name: '‘Abdu’l-Bahá' }, { para: 1, i0: 4, i1: 6, kind: 'work', url: 'https://oceanlibrary.com/44', title: 'Kitáb-i-Íqán' }];
  it('transcript.md stays plain text (links live in transcript.json and media_links, not in the indexed text)', () => {
    expect(paragraphMarkdown(p, [], links)).toBe('then the Master read the Íqán aloud');
  });
  it('page.html: name links stay in the page, work links open the source; clicks on them navigate', () => {
    const html = pageHtml({ meta: { slug: 's', title: 'T', rights: { playback: 'full' }, source: { kind: 'file' } }, paragraphs: [p], links });
    expect(html).toContain('<a class="ln" href="https://siftersearch.com/biography/7" title="‘Abdu’l-Bahá">');
    expect(html).toContain('<a class="ln" href="https://oceanlibrary.com/44" title="Kitáb-i-Íqán" target="_blank" rel="noopener">');
    expect(html).toContain("closest('a.ln')");
  });
  it('firstPerSection keys by the canonical name', () => {
    expect(firstPerSection([m({ para: 2, canonical: 'A B' }), m({ para: 1, canonical: 'A B' })]).map((x) => x.para)).toEqual([1]);
  });
});
