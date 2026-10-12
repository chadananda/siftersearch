import { describe, it, expect } from 'vitest';
import { originalFile, anchorOf } from '../../api/lib/ops/ctai-jobs.js';
import { parseMarkdownBlocks } from '../../api/services/block-parser.js';

describe('CTAI originals paragraphed from the English', () => {
  const rows = [
    { id: 1, external_para_id: 'para_3', block_attrs: null, original_text: 'یا ابن الروح', original_lang: 'fa' },
    { id: 2, external_para_id: null, block_attrs: JSON.stringify({ id: 'para_9', pn: '4' }), original_text: 'یا ابن البشر', original_lang: 'ar' },
  ];
  it('anchor = file id, else site id, else row id', () => {
    expect(rows.map(anchorOf)).toEqual(['para_3', 'para_9']);
    expect(anchorOf({ id: 7 })).toBe('c7');
  });
  it('one original block per English paragraph, in order, align + pn carried, parser reads the attrs', () => {
    const f = originalFile({ title: 'The Hidden Words', hostDoc: 20809, works: ['the-hidden-words'] }, rows);
    const blocks = parseMarkdownBlocks(f.replace(/^---[\s\S]*?\n---\n/, ''), { splitOversized: false });
    expect(blocks.map((b) => b.attrs)).toEqual([
      { id: 'para_1', align: 'para_3', language: 'fa' },
      { id: 'para_2', pn: '4', align: 'para_9', language: 'ar' },
    ]);
    expect(f).toMatch(/^---\ntitle: "The Hidden Words — original \(CTAI paragraphing\)"\nlanguage: fa/);
  });
});
