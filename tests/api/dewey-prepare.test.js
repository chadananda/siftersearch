// Dewey's quality gate (Chad 10-19): footnotes marked at their reference, paragraphs joined across page markers, easy OCR
// fixed, walls split — and a text still unfit is refused with reasons.
import { describe, it, expect } from 'vitest';
import { extractFootnotes, fixOcr, prepareForIngest } from '../../api/lib/dewey/prepare.js';

const line = 'The believers gathered in the garden of Ridván where Bahá’u’lláh declared His mission to the companions.';

describe('footnotes', () => {
  it('a page-foot note whose number is marked in the text moves to the mark as a comment', () => {
    const page = `${line}\nThey stayed twelve days in the garden.3 Then they left\nfor Constantinople by way of Samsun.\n3 Shoghi Effendi, God Passes By, p. 153.\n12\f`;
    const r = extractFootnotes(page);
    expect(r.notes).toEqual(['3 Shoghi Effendi, God Passes By, p. 153.']);
    expect(r.text).toContain('garden.⟦fn:0⟧ Then');
    expect(r.text).not.toMatch(/^3 Shoghi/m);
  });
  it('verse numbers are not footnotes — no mark in the text', () => {
    const page = '11 And God said, Let the earth bring forth grass.\n12 And the earth brought forth grass.\n13 And the evening and the morning were the third day.';
    expect(extractFootnotes(page).notes).toEqual([]);
  });
  it('a page reference "p.12" is not a mark', () => {
    expect(extractFootnotes(`${line} See p.2 for more.\n2 Not a note at all, p. 4.`).notes).toEqual([]);
  });
});

describe('OCR', () => {
  it('fixes shape confusions toward words the document attests, leaves names alone', () => {
    const text = `${'the modern world '.repeat(6)} tbe rnodern wor1d of Bahá’u’lláh and Ṭáhirih`;
    const r = fixOcr(text);
    expect(r.text).toMatch(/the modern world of Bahá’u’lláh and Ṭáhirih$/);
    expect(r.fixes.map(([a, b]) => `${a}>${b}`)).toEqual(expect.arrayContaining(['tbe>the', 'rnodern>modern', 'wor1d>world']));
  });
  it('ligatures', () => { expect(fixOcr('the ﬁrst ﬂower').text).toBe('the first flower'); });
});

describe('prepareForIngest', () => {
  it('a paragraph split by a page break is joined and the text passes', () => {
    const body = Array.from({ length: 30 }, () => `${line} ${line}`).join('\n\n');
    const text = `${body}\n\nThe friends then travelled on toward\f\nthe city of Baghdad where they remained for ten years.\n\n${body}`;
    const r = prepareForIngest(text, { language: 'en' });
    expect(r.text).toMatch(/toward <pb n="2"\/> the city/);
    expect(r.pass).toBe(true);
  });
  it('a wall of text is split; garbled OCR is refused with the reason', () => {
    const wall = Array.from({ length: 80 }, () => line).join(' ');
    const ok = prepareForIngest(wall, { language: 'en' });
    expect(ok.repairs.walls_split).toBe(1);
    expect(ok.repairs.paragraphs_after).toBeGreaterThan(3);
    const junk = Array.from({ length: 60 }, () => 'tlie qnick hrown fqx jnmps ovcr tbc lazv dqg wliile').join(' ');
    const bad = prepareForIngest(junk, { language: 'en' });
    expect(bad.pass).toBe(false);
    expect(bad.why.join(' ')).toMatch(/OCR noise/);
  });
});

describe('dictionary OCR (10-19 trial: beard→heard, bad→had in the Bible)', () => {
  const dict = new Set(['the', 'beard', 'heard', 'bad', 'had', 'modern', 'world', 'he', 'his', 'and', 'of']);
  it('a dictionary word is never changed; a non-word is, toward an attested word', async () => {
    const { fixOcrAll } = await import('../../api/lib/dewey/prepare.js');
    const r = fixOcrAll(['he had his beard and the bad world', 'the rnodern world of Anab'], { dict });
    expect(r.texts[0]).toBe('he had his beard and the bad world');
    expect(r.texts[1]).toBe('the modern world of Anab');
  });
});

describe('site paragraphs', () => {
  it('a paragraph broken at the page is joined (break kept), a page-foot note moves into block_attrs', async () => {
    const { repairParagraphs } = await import('../../api/lib/dewey/prepare.js');
    const r = repairParagraphs([
      { text: 'The believers gathered in the garden of Ridván as the Báb had foretold.4 They stayed there twelve days and then went on toward', pdf_page: 3 },
      { text: '4 Nabíl, The Dawn-Breakers, p. 12.', pdf_page: 3 },
      { text: 'the city of Constantinople by way of Samsun on the Black Sea.', pdf_page: 4 },
    ], { language: 'en', dict: new Set(['the']) });
    expect(r.paragraphs).toHaveLength(1);
    expect(r.paragraphs[0].text).toMatch(/foretold\. They.*toward the city/);
    expect(r.paragraphs[0].block_attrs.footnotes[0]).toMatchObject({ n: 4, text: 'Nabíl, The Dawn-Breakers, p. 12.' });
    expect(r.paragraphs[0].block_attrs.pb[0][2]).toBe(4);
    expect(r.repairs).toMatchObject({ footnotes: 1, page_joins: 1 });
  });
  it('a Russian text with Latin links is not judged as Latin OCR', async () => {
    const { judge } = await import('../../api/lib/dewey/prepare.js');
    const ru = Array.from({ length: 40 }, () => 'Книга Несомненности открывает смысл священных писаний для всех народов мира.');
    expect(judge(ru).pass).toBe(true);
  });
});

describe('markup and language (10-19 trial)', () => {
  it('links become their text, table cells text, tags and escapes go', async () => {
    const { stripMarkup } = await import('../../api/lib/dewey/prepare.js');
    expect(stripMarkup('See [K121](https://bahai-library.com/a.html#K121) and **note** \\[5\\] &amp; more')).toBe('See K121 and note [5] & more');
    expect(stripMarkup('<table><tr><td>1:1</td><td>The Opening</td></tr></table>')).toBe('1:1 · The Opening');
  });
  it('Spanish and French are never "corrected" by the English dictionary', async () => {
    const { repairParagraphs } = await import('../../api/lib/dewey/prepare.js');
    const dict = new Set(['came', 'done', 'the', 'come']);
    const es = Array.from({ length: 10 }, () => ({ text: 'La carne del lobo fue dada a los pobres de la ciudad, donc el pueblo comió.' }));
    const r = repairParagraphs(es, { language: 'es', dict });
    expect(r.paragraphs[0].text).toContain('carne');
    expect(r.repairs.ocr_fixes).toBe(0);
    const mixed = repairParagraphs([{ text: "The traveller wrote of the people and of the town that he had seen there." }, { text: "Il dit: je ne sais peu de choses, donc je reste ici." }], { language: "en", dict: new Set(["pen", "done", "the", "he"]) });
    expect(mixed.paragraphs[1].text).toContain("peu de choses, donc");
  });
});

describe('hyphens and leftovers', () => {
  it('broken words joined, compounds kept, foreign dashes left; URLs and _italics_ go', async () => {
    const { closeHyphens, stripMarkup } = await import('../../api/lib/dewey/prepare.js');
    const dict = new Set(['propaganda', 'loving', 'kindness']);
    expect(closeHyphens('Propa- ganda and loving- kindness; asistirle- han', dict).text).toBe('Propaganda and loving-kindness; asistirle- han');
    expect(stripMarkup('https://bahai-library.com/images/logo.png _from Reality_ here')).toBe('from Reality here');
  });
});

describe('joins without page numbers', () => {
  it('a break inside a sentence is joined; a finished sentence or a heading is not', async () => {
    const { repairParagraphs } = await import('../../api/lib/dewey/prepare.js');
    const r = repairParagraphs([
      { text: 'He spoke of self-surrender, of vigilance, discretion and prudence on' },
      { text: 'the one hand, and fellowship and candor on the other.' },
      { text: 'A New Chapter' },
      { text: 'and then the friends departed for the city by night.' },
    ], { language: 'en', dict: new Set(['the']) });
    expect(r.paragraphs.map((p) => p.text)).toEqual([
      'He spoke of self-surrender, of vigilance, discretion and prudence on the one hand, and fellowship and candor on the other.',
      'A New Chapter', 'and then the friends departed for the city by night.']);
    expect(r.paragraphs[0].block_attrs).toBeUndefined();
  });
});
