// Unit tests for the OceanLibrary adapter's parseDoc — paragraph extraction.
//
// Regression coverage for the content-loss bug discovered 2026-06-16: the
// Dawn-Breakers martyr-roll lists (e.g. the 18 Sang-Sar martyrs) were silently
// dropped on ingest. Root cause: OceanLibrary writes list items as a text block
// followed by a SEPARATE `{id=… type="par"}` attribute block. The old parser
// only read attributes that TRAILED the block inline, so every list-item block
// had attrs:null and was discarded by `if (!attrs) continue`, and the orphaned
// attr-only block had empty text and was discarded too. Footnote definitions
// were also deliberately dropped. All content (incl. footnotes) must be kept.

import { describe, it, expect } from 'vitest';
import { parseDoc } from '../../api/services/site-adapters/oceanlibrary.js';

const FM = [
  '---',
  'title: Test Book',
  'author: Nabíl',
  'ocean_category: Bahá’í',
  'language: en',
  'source_url: https://oceanlibrary.com/test',
  '---',
  ''
].join('\n');

// Mirrors the exact on-disk shape of the Dawn-Breakers martyr roll: a header
// paragraph with an INLINE attr, then each list item as its own text block with
// its `{id …}` attr on the FOLLOWING block.
const MARTYR_LIST = [
  'Of the companions of the village of Sang-Sar, eighteen were martyred. Their names are as follows: {id="para_1188" type="par" language="en"}',
  '',
  '1.  Siyyid Aḥmad, whose body was cut to pieces by Mírzá Muḥammad-Taqí. He was a noted divine.',
  '',
  '{id="para_1189" type="par" language="en"}',
  '',
  '1.  Mír Abu’l-Qásim, Siyyid Aḥmad’s brother, who won the crown of martyrdom.',
  '',
  '{id="para_1190" type="par" language="en"}',
  '',
  '1.  Mír Mihdí, the paternal uncle of Siyyid Aḥmad,',
  '',
  '{id="para_1191" type="par" language="en"}'
].join('\n');

describe('oceanlibrary adapter — list-item content is not dropped', () => {
  it('ingests every list item whose attribute is on the following block', async () => {
    const { paragraphs } = await parseDoc('test.md', FM + MARTYR_LIST, {});
    const texts = paragraphs.map(p => p.text);

    // The header survives (it always did — inline attr).
    expect(texts.some(t => t.startsWith('Of the companions'))).toBe(true);

    // All three martyr names must be present (they were dropped before the fix).
    expect(texts.some(t => t.includes('Siyyid Aḥmad'))).toBe(true);
    expect(texts.some(t => t.includes('Mír Abu’l-Qásim'))).toBe(true);
    expect(texts.some(t => t.includes('Mír Mihdí'))).toBe(true);

    // header + 3 names = 4 content paragraphs.
    expect(paragraphs.length).toBe(4);
  });

  it('strips the leading markdown list marker from item text', async () => {
    const { paragraphs } = await parseDoc('test.md', FM + MARTYR_LIST, {});
    const ahmad = paragraphs.find(p => p.text.includes('Siyyid Aḥmad'));
    expect(ahmad.text.startsWith('1.')).toBe(false);
    expect(ahmad.text.startsWith('Siyyid Aḥmad')).toBe(true);
  });

  it('attaches the trailing standalone attribute id to the preceding item', async () => {
    const { paragraphs } = await parseDoc('test.md', FM + MARTYR_LIST, {});
    const ahmad = paragraphs.find(p => p.text.includes('Siyyid Aḥmad'));
    const abulQasim = paragraphs.find(p => p.text.includes('Mír Abu’l-Qásim'));
    // {id=para_1189} follows the Siyyid Aḥmad block → belongs to it.
    expect(ahmad.external_para_id).toBe('para_1189');
    expect(abulQasim.external_para_id).toBe('para_1190');
  });
});

describe('oceanlibrary adapter — footnotes are ingested', () => {
  const WITH_FOOTNOTES = [
    'A body paragraph that references a note.[^1] {id="para_10" type="par" language="en"}',
    '',
    '[^1]: This is the first footnote definition and must be searchable.',
    '[^2]: A second footnote, written with no blank line between definitions.'
  ].join('\n');

  it('keeps footnote definitions as blocktype "footnote"', async () => {
    const { paragraphs } = await parseDoc('test.md', FM + WITH_FOOTNOTES, {});
    const notes = paragraphs.filter(p => p.blocktype === 'footnote');
    expect(notes.length).toBe(2);
    expect(notes[0].text).toContain('first footnote definition');
    expect(notes[1].text).toContain('second footnote');
  });

  it('gives each footnote a stable external_para_id derived from its marker', async () => {
    const { paragraphs } = await parseDoc('test.md', FM + WITH_FOOTNOTES, {});
    const ids = paragraphs.filter(p => p.blocktype === 'footnote').map(p => p.external_para_id);
    expect(ids).toContain('fn_1');
    expect(ids).toContain('fn_2');
  });

  it('still ingests the body paragraph that carries the footnote marker', async () => {
    const { paragraphs } = await parseDoc('test.md', FM + WITH_FOOTNOTES, {});
    expect(paragraphs.some(p => p.text.startsWith('A body paragraph'))).toBe(true);
  });
});

describe('oceanlibrary adapter — attr-less prose is kept, structural blocks still skipped', () => {
  it('keeps a text block that has no attribute at all (null id, not dropped)', async () => {
    const md = [
      'Block with an inline attr. {id="para_1" type="par" language="en"}',
      '',
      'A plain prose block with no attribute whatsoever.'
    ].join('\n');
    const { paragraphs } = await parseDoc('test.md', FM + md, {});
    const plain = paragraphs.find(p => p.text.startsWith('A plain prose block'));
    expect(plain).toBeTruthy();
    expect(plain.external_para_id).toBeNull();
  });

  it('still skips hr / toc / title blocks and updates heading from header blocks', async () => {
    const md = [
      '### Chapter One {id="h1" type="header"}',
      '',
      'First paragraph under the chapter. {id="para_1" type="par" language="en"}',
      '',
      '* * * {id="hr1" type="hr"}',
      '',
      'Skip me {id="t1" type="title"}'
    ].join('\n');
    const { paragraphs } = await parseDoc('test.md', FM + md, {});
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].heading).toBe('Chapter One');
    expect(paragraphs[0].text).toBe('First paragraph under the chapter.');
  });
});
