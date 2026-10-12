import { describe, it, expect } from 'vitest';
import { assignBlockIds } from '../../api/lib/library/block-ids.js';
import { parseMarkdownBlocks } from '../../api/services/block-parser.js';

describe('block ids for library files', () => {
  it('every text block gets id + pn; headings do not; the parser attaches them to the right block', () => {
    const src = '---\ntitle: T\n---\n# Heading\n\nFirst paragraph.\n\nSecond paragraph\ncontinues here.\n';
    const r = assignBlockIds(src);
    expect(r).toMatchObject({ assigned: 2, kept: 0, skipped: 0 });
    expect(r.text).toBe('---\ntitle: T\n---\n# Heading\n\nFirst paragraph.\n{id="para_1" pn="1"}\n\nSecond paragraph\ncontinues here.\n{id="para_2" pn="2"}\n');
    const blocks = parseMarkdownBlocks(r.text.replace(/^---[\s\S]*?---\n/, ''), { splitOversized: false });
    expect(blocks.filter((b) => b.type === 'paragraph').map((b) => b.attrs)).toEqual([{ id: 'para_1', pn: '1' }, { id: 'para_2', pn: '2' }]);
  });
  it('ids are permanent: existing kept, new ones take max+1; an existing pn (verse) is never changed; idempotent', () => {
    const src = 'Old one.\n{id="para_7" pn="1"}\n\nNew one.\n\nVerse text.\n{pn="2:1"}\n';
    const r = assignBlockIds(src);
    expect(r.text).toBe('Old one.\n{id="para_7" pn="1"}\n\nNew one.\n{id="para_8" pn="2"}\n\nVerse text.\n{id="para_9" pn="2:1"}\n');
    expect(assignBlockIds(r.text).text).toBe(r.text);
  });
  it('a quote + footnote line in one file block → each run labelled, parser agrees', () => {
    const r = assignBlockIds('> quoted text one\n> more quoted\n[2]: Aristotle, Ethics.\n');
    expect(r).toMatchObject({ assigned: 2, skipped: 0 });
    const blocks = parseMarkdownBlocks(r.text, { splitOversized: false });
    expect(blocks.map((b) => [b.type, b.attrs])).toEqual([['quote', { id: 'para_1', pn: '1' }], ['paragraph', { id: 'para_2', pn: '2' }]]);
  });
});
