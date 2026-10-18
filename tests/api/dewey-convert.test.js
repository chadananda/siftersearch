// Dewey's converter: every format → Markdown with headings kept; one path for identify and intake.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { htmlToMarkdown, webarchiveHtml, toMarkdownText, samplePages, looksLikeWords } from '../../api/lib/dewey/convert.js';

describe('htmlToMarkdown', () => {
  it('keeps headings, paragraphs, lists, quotes and emphasis; drops scripts and styles', () => {
    const md = htmlToMarkdown('<html><head><title>x</title><style>p{}</style></head><body><h1>Pilgrim <b>Notes</b></h1><p>The Guardian said &ldquo;Be&nbsp;radiant&rdquo;.</p><script>bad()</script><ul><li>one</li><li>two</li></ul><blockquote>A quote</blockquote><p><em>italic</em> and <strong>bold</strong></p></body></html>');
    expect(md).toBe('# Pilgrim Notes\n\nThe Guardian said “Be radiant”.\n\n- one\n- two\n\n> A quote\n\n*italic* and **bold**');
  });
  it('decodes numeric entities (diacritics in transliteration)', () => {
    expect(htmlToMarkdown('<p>Bah&#225;&#8217;u&#x2019;ll&aacute;h</p>')).toMatch(/^Bahá’u’ll/);
  });
});

describe('toMarkdownText', () => {
  it('a Safari webarchive yields its page as Markdown', async () => {
    const bytes = Buffer.concat([Buffer.from('bplist00Ô\u0001\u0002'), Buffer.from('<!DOCTYPE html><html><body><h2>Roses</h2><p>Hautz left Milwaukee.</p></body></html>'), Buffer.from('\u0000\u0001_WebResourceURL')]);
    expect(webarchiveHtml(bytes)).toMatch(/^<!DOCTYPE html>.*<\/html>$/s);
    const r = await toMarkdownText(bytes, 'Hautz roses.webarchive');
    expect(r).toMatchObject({ format: 'webarchive', markdown: '## Roses\n\nHautz left Milwaukee.' });
  });
  it('an EPUB yields its chapters in spine order', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
    zip.file('OEBPS/content.opf', '<package><manifest><item id="c2" href="two.xhtml"/><item id="c1" href="one.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>');
    zip.file('OEBPS/one.xhtml', '<html><body><h1>Chapter One</h1><p>First.</p></body></html>');
    zip.file('OEBPS/two.xhtml', '<html><body><h1>Chapter Two</h1><p>Second.</p></body></html>');
    const r = await toMarkdownText(await zip.generateAsync({ type: 'nodebuffer' }), 'book.epub');
    expect(r.markdown).toBe('# Chapter One\n\nFirst.\n\n# Chapter Two\n\nSecond.');
  });
  it('a DOCX is read directly: styled headings (incl. custom outline-level styles), lists, bold/italic, entities', async () => {
    const zip = new JSZip();
    zip.file('word/styles.xml', '<w:styles><w:style w:type="paragraph" w:styleId="Chap"><w:name w:val="Chapter"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>');
    zip.file('word/document.xml', '<w:document><w:body>'
      + '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Pilgrim Notes</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:pStyle w:val="Chap"/></w:pPr><w:r><w:t>April 1952</w:t></w:r></w:p>'
      + '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>The Guardian</w:t></w:r><w:r><w:t xml:space="preserve"> said &amp; </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>smiled</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>first point</w:t></w:r></w:p>'
      + '<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>not bold</w:t></w:r></w:p>'
      + '</w:body></w:document>');
    const r = await toMarkdownText(await zip.generateAsync({ type: 'nodebuffer' }), 'notes.docx');
    expect(r.markdown).toBe('# Pilgrim Notes\n\n## April 1952\n\n**The Guardian** said & *smiled*\n\n- first point\n\nnot bold');
  });
  it('DOC/RTF/ODT go through LibreOffice to HTML, then Markdown', async () => {
    let seen;
    const r = await toMarkdownText(Buffer.from('{\\rtf1 x}'), 'notes.doc', { office: async (b, ext) => { seen = ext; return '<h1>Notes</h1><p>Text.</p>'; } });
    expect(seen).toBe('doc');
    expect(r.markdown).toBe('# Notes\n\nText.');
  });
  it('sniffs a missing extension (RTF goes to LibreOffice)', async () => {
    let seen;
    await toMarkdownText(Buffer.from('{\\rtf1\\ansi hello}'), '', { office: async (b, ext) => { seen = ext; return '<p>hello</p>'; } });
    expect(seen).toBe('rtf');
  });
  it('old Windows-1252 text decodes, not as replacement characters', async () => {
    const r = await toMarkdownText(Buffer.from([0x93, 0x42, 0x65, 0x94, 0x20, 0x96, 0x20, 0x92, 0x93, 0x94]), 'old.txt');
    expect(r.markdown.startsWith('“Be” – ’')).toBe(true);
  });
  it('audio is refused with a reason, not read as text', async () => {
    await expect(toMarkdownText(Buffer.from('ID3'), 'talk.mp3')).rejects.toThrow(/audio\/video/);
  });
});

describe('preliminary OCR of scans', () => {
  it('samples the title-page region and an even spread, ≤ 8 pages', () => {
    expect(samplePages(5)).toEqual([1, 2, 3, 4, 5]);
    const p = samplePages(300);
    expect(p).toHaveLength(8);
    expect(p.slice(0, 2)).toEqual([2, 3]);
    expect(p.at(-1)).toBeGreaterThan(250);
  });
  it('tells a real English read from OCR noise (handwriting read as "Japanese", 10-17)', () => {
    expect(looksLikeWords('Excerpts from the notes of Ben Levy, American Baha\'i in the Armed Forces in Germany. Pilgrimage March 9th to 16th, 1953. Mankind is now approaching the stage of maturity. Maturity means responsibility and all men are responsible to God.')).toBe(true);
    expect(looksLikeWords('プー 0 72 の と。 そん 「 レク ンタルレ ぎ CR んし り 。 EE 。 yt" いう 了 『ル レ/二2 /グ名 だ アン を wtっ ッン サリ が 計 ww チ も 症 が しゅ 5 。 | "ん /が じしゃる をrw')).toBe(false);
    expect(looksLikeWords('a fcast, at whnh atl kmd, af fimt, cmdcm smt, + tea wcn sewd. Bgy All fom Lmn w Rwe mn thn of Abdl Bba wwn thn. Prgn wm chnted + aftrwds thm thc mcn vsitd')).toBe(false);
  });
});
