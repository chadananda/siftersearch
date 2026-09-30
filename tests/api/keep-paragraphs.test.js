// A source that declares its paragraphing (needs_segmentation: false) is never re-cut or re-joined by size.
import { describe, it, expect } from 'vitest';
import { parseMarkdownBlocks } from '../../api/services/block-parser.js';

describe('parseMarkdownBlocks keeps declared paragraphs', () => {
  const long = ('قال: حدثنا فلان. ' + 'Then He said. "A quote" 12. ').repeat(150);   // > 3,000 chars with split points
  it('splits an oversized paragraph by default (legacy behaviour)', () => {
    expect(parseMarkdownBlocks(long).length).toBeGreaterThan(1);
  });
  it('never splits when the source keeps its own paragraphs', () => {
    const blocks = parseMarkdownBlocks(long, { splitOversized: false });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe(long.trim());
  });
});
