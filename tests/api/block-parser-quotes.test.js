// Blockquotes: one block per quoted paragraph, never one per printed line (doc 429, 2026-10-03).
import { describe, it, expect } from 'vitest';
import { parseMarkdownBlocks, blocksToMarkdown } from '../../api/services/block-parser.js';

const SRC = `Speaking of these companions, Nabíl has recorded the following:

>      So intoxicated were those who had quaffed from the cup
> of Bahá’u’lláh's presence, that in their eyes the palaces of
> kings appeared more ephemeral than a spider's web...

>      Many a night, no less than ten persons subsisted on no
> more than a pennyworth of dates.
>
> A third quoted paragraph.
Prose resumes here.`;

describe('blockquotes', () => {
  const blocks = parseMarkdownBlocks(SRC);
  it('joins a quoted paragraph\'s printed lines into one quote block', () => {
    const quotes = blocks.filter((b) => b.type === 'quote');
    expect(quotes).toHaveLength(3);
    expect(quotes[0].content).toMatch(/^So intoxicated[\s\S]*spider's web\.\.\.$/);
    expect(quotes[0].content.split('\n')).toHaveLength(3);
  });
  it('a bare ">" separates quoted paragraphs; a non-quote line ends the quotation', () => {
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'quote', 'quote', 'quote', 'paragraph']);
    expect(blocks[4].content).toBe('Prose resumes here.');
  });
  it('round-trips a multi-line quote with ">" on every line', () => {
    expect(blocksToMarkdown([blocks[1]])).toBe(blocks[1].content.split('\n').map((l) => `> ${l}`).join('\n'));
  });
});
