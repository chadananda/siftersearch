// OceanLibrary display ids: block kinds, cited numbers, defects (api/lib/library/ol-display-ids.js — Chad 10-23).
import { describe, it, expect } from 'vitest';
import { parseExport, numberBook, numberingDefects, olPn, baseKind } from '../../api/lib/library/ol-display-ids.js';

const book = (body) => `---\nbookid: "t_en"\ntitle: "T"\nlanguage: "en"\n---\n\n${body}\n`;
const LONG = 'and this is a long paragraph of real content that goes on for quite a few words so that it is never a lead-in line at all, because real paragraphs run on';

describe('olPn', () => {
  it('keeps OL numbers, trims, drops a trailing dot', () => {
    expect(olPn(' 1.2.3 ')).toBe('1.2.3');
    expect(olPn('13:1')).toBe('13:1');
    expect(olPn('12.')).toBe('12');
    expect(olPn('')).toBe(null);
    expect(olPn('none')).toBe(null);
  });
  it('turns uppercase roman segments into Arabic, keeps letter prefixes', () => {
    expect(olPn('I.1.2')).toBe('1.1.2');
    expect(olPn('XXXIII:4.1')).toBe('33:4.1');
    expect(olPn('p.3')).toBe('p.3');
    expect(olPn('a1')).toBe('a1');
    expect(olPn('qa.105')).toBe('qa.105');
    expect(olPn('L1.1')).toBe('L1.1');   // not a valid roman segment — left as OL wrote it (a defect)
  });
});

describe('parseExport', () => {
  it('reads blocks, attaches a standalone attr line to the text above, drops footnotes, counts paraN', () => {
    const { fm, blocks } = parseExport(book([
      '# T {.on id="bl2s" type="title" subtype="book title"}',
      'First paragraph. {id="bl30" num="1" type="par" language="en"}',
      '1.  A list item',
      '{id="bl31" num="2" type="par" language="en"}',
      '[^1]: A note. {language="en"}',
    ].join('\n\n')));
    expect(fm.bookid).toBe('t_en');
    expect(blocks.map((b) => [b.ilm, b.num, b.type, b.paraN])).toEqual([['bl2s', null, 'title', 1], ['bl30', '1', 'par', 2], ['bl31', '2', 'par', 3]]);
    expect(blocks[2].text).toBe('1.  A list item');
  });
});

describe('numberBook', () => {
  it('Íqán: unnumbered invocation after a header gets no number; paragraphs cite by OL number', () => {
    const { blocks } = parseExport(book([
      '### Part One {id="h1" type="header" subtype="subheader"}',
      'In the name of our Lord, the Exalted, the Most High. {id="i0" type="par"}',
      `No man shall attain ${LONG} {id="p1" num="1" type="par"}`,
      `The essence of these words ${LONG} {id="p2" num="2" type="par"}`,
    ].join('\n\n')));
    const r = numberBook(blocks).blocks;
    expect(r[1]).toMatchObject({ kind: 'content', pn: null, cite: false });
    expect(r[2]).toMatchObject({ kind: 'content', pn: '1', cite: true });
    expect(r[3]).toMatchObject({ pn: '2', cite: true });
  });

  it('Hidden Words: the body under a numbered address cites as that Hidden Word', () => {
    const { blocks } = parseExport(book([
      'O Son of Spirit! {id="31" num="a1" type="par"}',
      'My first counsel is this: Possess a pure, kindly and radiant heart. {id="32" type="par"}',
      '*** {id="33" type="hr"}',
      'O Son of Spirit! {id="34" num="a2" type="par"}',
    ].join('\n\n')));
    const r = numberBook(blocks).blocks;
    expect(r[0]).toMatchObject({ pn: 'a1', cite: true });
    expect(r[1]).toMatchObject({ pn: 'a1', inherited: true });
    expect(r[3]).toMatchObject({ pn: 'a2' });
  });

  it('Lights of Guidance: a source line with a stray number is not citable and causes no collision', () => {
    const { blocks } = parseExport(book([
      '**37. Avoid Intrigues** {id="h37" num="37" type="par"}',
      `“Quotation ${LONG}” {id="q37" num="1.37.1" type="par"}`,
      '(From a letter written on behalf of Shoghi Effendi, p. 1) {id="s37" num="1.82" type="par"}',
      '**38. Next Item** {id="h38" num="38" type="par"}',
      `“Another ${LONG}” {id="q38" num="1.38.1" type="par"}`,
      '(From a letter of the Universal House of Justice) {.reference id="s38" num="1.82" type="par"}',
    ].join('\n\n')));
    const nb = numberBook(blocks);
    expect(nb.blocks[2]).toMatchObject({ kind: 'source', pn: null, cite: false });
    expect(nb.blocks[5].kind).toBe('source');
    expect(nb.dups).toEqual([]);
    expect(nb.blocks[0]).toMatchObject({ pn: '37', cite: true });
    expect(nb.blocks[1]).toMatchObject({ pn: '1.37.1', cite: true });
    expect(numberingDefects(blocks, nb).groups).toEqual([{ num: '1.82', kind: 'source', blocks: expect.any(Array) }]);
  });

  it('a signature line before an hr is not citable', () => {
    const { blocks } = parseExport(book([`Body ${LONG} {id="b" num="1.1" type="par"}`, 'Shoghi {id="s" num="1.2" type="par"}', '*** {id="h" type="hr"}'].join('\n\n')));
    expect(baseKind(blocks[1], 'hr')).toBe('signature');
    expect(numberBook(blocks).blocks[1]).toMatchObject({ kind: 'signature', pn: null });
  });

  it('a salutation sharing the next paragraph’s number is its lead-in (cites with it, not a collision)', () => {
    const { blocks } = parseExport(book(['Dearest Friends, {id="a" num="1.3.2" type="par"}', `I have during the last few days ${LONG} {id="b" num="1.3.2" type="par"}`].join('\n\n')));
    const nb = numberBook(blocks);
    expect(nb.blocks[0]).toMatchObject({ kind: 'lead-in', pn: '1.3.2', cite: false });
    expect(nb.blocks[1]).toMatchObject({ kind: 'content', pn: '1.3.2', cite: true });
    expect(nb.dups).toEqual([]);
  });

  it('two content paragraphs sharing a number: both lose their reference (an OL defect), and the Aqdas invocation is flagged', () => {
    const { blocks } = parseExport(book([
      'In the name of Him Who is the Supreme Ruler over all that hath been and all that is to be. {id="bl2z" num="1" type="par"}',
      `The first duty prescribed by God ${LONG} {id="bl30" num="2" type="par"}`,
      `They whom God hath endued with insight ${LONG} {id="bl31" num="2" type="par"}`,
      `O ye peoples of the world! ${LONG} {id="bl32" num="3" type="par"}`,
    ].join('\n\n')));
    const nb = numberBook(blocks);
    expect(nb.dups).toEqual(['2']);
    expect(nb.blocks[1]).toMatchObject({ dup: true, cite: false });
    expect(nb.blocks[3]).toMatchObject({ pn: '3', cite: true });
    expect(nb.blocks[0].invocationNumbered).toBe(true);
    const d = numberingDefects(blocks, nb);
    expect(d.groups.map((g) => [g.num, g.kind])).toEqual([['2', 'content']]);
    expect(d.invocations).toEqual([{ num: '1', ilm: 'bl2z', text: expect.stringMatching(/^In the name of Him/) }]);
  });
});
