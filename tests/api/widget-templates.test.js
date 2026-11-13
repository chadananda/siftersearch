// Inline display templates (widgets/templates.js) and the Worker's stream filter (worker/anis/links.js).
import { describe, it, expect } from 'vitest';
import { expandTemplates } from '../../api/lib/assistant/widgets/templates.js';
import { widgetSegments } from '../../api/lib/assistant/widgets/segments.js';
import { templateFilter, finishLinks } from '../../worker/anis/links.js';

const found = new Map([['P1', { text: 'Line one.\n\nLine two.', source_url: 'https://x/1', title: 'Gleanings', author: 'Bahá\'u\'lláh', cover_url: '/c/1.jpg' }]]);
const works = new Map([['B1', { title: 'Kitáb-i-Íqán', author: 'Bahá\'u\'lláh', url: 'https://x/iqan' }]]);
const books = new Map([['B1', { year: 1862, cover_url: '/c/iqan.jpg' }]]);

describe('expandTemplates', () => {
  it('scene: quoted title + line, its passages whole, the first cover; no title or no passage in hand → dropped', () => {
    const { text, widgets } = expandTemplates('Lead.\n{{scene "Conference of Badasht" "1848: the old law set aside" P1 P9}}\n{{scene P1}}\nEnd.', { found });
    expect(widgets).toHaveLength(1);
    expect(widgets[0]).toMatchObject({ kind: 'scene', id: 'scene-1', title: 'Conference of Badasht', line: '1848: the old law set aside', cover_url: '/c/1.jpg' });
    expect(widgets[0].passages.map((p) => p.url)).toEqual(['https://x/1']);
    expect(text).toContain('**Conference of Badasht** — 1848: the old law set aside');
    expect(text).toContain('> Line one.');
    expect(text).not.toContain('{{');
  });
  it('quote and book templates → marker + fallback + data; unknown kind or ref → line dropped', () => {
    const { text, widgets } = expandTemplates('Intro.\n{{quote P1}}\n{{book B1}}\n{{quote P7}}\n{{chart P1}}\nEnd.', { found, works, books });
    expect(widgets.map((w) => [w.kind, w.id])).toEqual([['quote', 'quote-1'], ['book', 'book-2']]);
    expect(widgets[0]).toMatchObject({ url: 'https://x/1', cover_url: '/c/1.jpg' });
    expect(widgets[1]).toMatchObject({ year: 1862, cover_url: '/c/iqan.jpg' });
    expect(text).not.toContain('{{');
    const segs = widgetSegments(text, widgets);
    expect(segs.map((s) => s.kind)).toEqual(['text', 'widget', 'widget', 'text']);
    expect(segs[1].md).toContain('> Line two.'); expect(segs[3].md.trim()).toBe('End.');
  });
  it('prose with no template is untouched', () => {
    expect(expandTemplates('Plain [link](https://x).', { found, works })).toEqual({ text: 'Plain [link](https://x).', widgets: [] });
  });
});

describe('templateFilter', () => {
  it('holds a template split across chunks, drops it, lets other braces through', () => {
    const f = templateFilter();
    expect(['Hi ', '{', '{quo', 'te P1}', '}', ' there {x}'].map(f).join('')).toBe('Hi  there {x}');
  });
});

describe('finishLinks', () => {
  it('a quote marker narrows the paragraph range to the quoted words (site offsets, ocean-range.js); no marker leaves the range', () => {
    const p = { text: 'God is love and light.', source_url: 'https://oceanlibrary.com/book/?paraId=para_3&selectionString=abc.0~abc.22' };
    const r = finishLinks('See [x](https://oceanlibrary.com/book/?paraId=para_3#~q=love%20and%20light) and [y](https://oceanlibrary.com/book/?paraId=para_3).', [p]);
    expect(r.narrowed).toBe(1);
    expect(r.text).toContain('selectionString=abc.5~abc.17'); expect(r.text).toContain('selectionString=abc.0~abc.18'); expect(r.text).not.toContain('#~q=');
  });
});

describe('finishResearch (tower research-tool boundary)', () => {
  it('passages anywhere get their book cover + year (one docs read) and a book-level link → the paragraph range; existing cover_url kept', async () => {
    const { finishResearch } = await import('../../api/routes/anis-impl-tools.js');
    const calls = [];
    const out = { passages: [{ document_id: 5, text: 'God is ⁅s1⁆love.', url: 'https://oceanlibrary.com/youth/' }, { doc_id: 6, text: 'b' }, { document_id: 5, cover_url: '/own.jpg' }], work: { document_id: 5 } };
    await finishResearch(out, { docsOf: async (ids) => { calls.push(ids); return [{ id: 5, cover_url: '/c5.jpg', year: 1930 }]; },
      rangeOf: async (url, words) => `${url}?paraId=para_2&selectionString=b.0~b.9&w=${words}` });
    expect(out.passages[0].url).toBe('https://oceanlibrary.com/youth/?paraId=para_2&selectionString=b.0~b.9&w=God is love.');
    expect(calls).toEqual([[5, 6]]);
    expect(out.passages[0]).toMatchObject({ cover_url: '/c5.jpg', year: 1930 });
    expect(out.passages[1].cover_url).toBeUndefined();
    expect(out.passages[2].cover_url).toBe('/own.jpg');
    expect(out.work.cover_url).toBe('/c5.jpg');
  });
});
