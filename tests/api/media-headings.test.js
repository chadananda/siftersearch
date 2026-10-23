// Topic subheaders (Chad 10-22): the guard (spacing, faithful to the section, length), slugs, and how the renditions carry
// them (markdown headings without times; page.html anchors + contents list; never word spans).
import { describe, it, expect } from 'vitest';
import { acceptHeadings, headingSlug, supported, withTimes, contentStems } from '../../api/lib/media/headings.js';
import { transcriptMarkdown, pageHtml } from '../../api/lib/media/render.js';

const words = (t, t0 = 0) => t.split(' ').map((w, i) => ({ w, s: t0 + i, e: t0 + i + 1 }));
const para = (n, t, t0) => { const ws = words(t, t0); return { n, t0, t1: ws.at(-1).e, spk: 'S1', words: ws, sentences: [[0, ws.length]] }; };
const ps = [
  para(1, 'Welcome friends, tonight we look at the early days of the Faith.', 0),
  para(2, 'The Báb declared Himself the Gate to Mullá Ḥusayn in Shiraz in 1844.', 60),
  para(3, 'Why the Gate? Because He opened the way to One greater than Himself.', 100),
  para(4, 'Now the Guardian explained that his role was to interpret the Writings.', 400),
  para(5, 'His interpretation is authoritative, and the House of Justice legislates.', 700),
];

describe('acceptHeadings', () => {
  it('keeps faithful, well-spaced subheaders; marks questions; gives unique slugs', () => {
    const { headings, refused } = acceptHeadings([
      { p: 2, text: 'Why did the Báb call Himself the Gate?' },
      { p: 3, text: 'The Gate and the One to come' },                   // 40 s after the previous: too close
      { p: 4, text: 'The station of the Guardian as interpreter' },
      { p: 5, text: 'Economic justice in the modern world' },           // not what the section says
      { p: 99, text: 'nowhere' },
    ], ps, { model: 'claude-haiku-5-5' });
    expect(headings.map((h) => [h.p, h.form])).toEqual([[2, 'question'], [4, 'statement']]);
    expect(headings[0]).toMatchObject({ kind: 'heading', source: 'generated', model: 'claude-haiku-5-5', slug: 'why-did-the-bab-call-himself-the-gate' });
    expect(refused.map((r) => r.why)).toEqual(['too close to the previous heading', 'not what the section discusses']);
  });
  it('slugs are unique; content words fold diacritics and skip stopwords', () => {
    const used = new Set();
    expect([headingSlug('Prayer', used), headingSlug('Prayer', used)]).toEqual(['prayer', 'prayer-2']);
    expect(contentStems('The station of the Guardian')).toEqual(['stati', 'guard']);
    expect(supported('Ṭáhirih at Badasht', 'Tahirih appeared unveiled at the conference')).toBe(true);
  });
  it('withTimes gives the TOC the paragraph start', () => {
    expect(withTimes([{ p: 4, text: 'x' }, { p: 42, text: 'gone' }], ps)).toEqual([{ p: 4, text: 'x', t: 400 }]);
  });
});

describe('renditions with subheaders', () => {
  const meta = { slug: 's', title: 'T', speaker: 'X', language: 'en', rights: { playback: 'full' }, source: { kind: 'file' } };
  const headings = [{ p: 4, text: 'The station of the Guardian as interpreter', slug: 'the-station-of-the-guardian-as-interpreter' }];
  it('transcript.md: a markdown heading with no times before its paragraph; chapters give way to headings', () => {
    const md = transcriptMarkdown({ meta, paragraphs: ps, chapters: [{ t: 0, title: 'Old chapter' }], headings });
    expect(md).toMatch(/## The station of the Guardian as interpreter \{at="para_\d+"\}\n\nNow the Guardian/);
    expect(md).not.toContain('Old chapter');
    expect(md.split('\n').find((l) => l.startsWith('## '))).not.toMatch(/t0=/);
  });
  it('the section index reads the subheaders as sections (at="para_N": a heading just before paragraph N)', async () => {
    const { outlineSections } = await import('../../api/lib/sections.js');
    const { parseMarkdownBlocks } = await import('../../api/services/block-parser.js');
    const md = transcriptMarkdown({ meta, paragraphs: ps, headings });
    const rows = ps.map((p, i) => ({ id: 100 + i, paragraph_index: i, para_num: p.n }));
    const secs = outlineSections(md, rows);
    expect(secs.length).toBe(headings.length);
    expect(secs[0]).toMatchObject({ title: expect.stringMatching(/station of the guardian/i), first_para_id: 100 + ps.findIndex((p) => p.n === headings[0].p) });
    const h = parseMarkdownBlocks(md).find((b) => /^heading/.test(b.type));
    expect(h.content).not.toContain('{');   // the attribute never reaches the stored text
  });
  it('page.html: an anchored h2 (no word spans) and a contents list', () => {
    const html = pageHtml({ meta, paragraphs: ps, headings, audio: 'web/s.ogg' });
    expect(html).toContain('<h2 id="the-station-of-the-guardian-as-interpreter">The station of the Guardian as interpreter</h2>');
    expect(html).toContain('<nav class="toc" aria-label="Contents"><ol><li><a href="#the-station-of-the-guardian-as-interpreter">');
    expect(html.match(/<h2[^>]*>[^<]*<\/h2>/)[0]).not.toContain('data-s');
  });
});
