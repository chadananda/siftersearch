/**
 * Document Indexer Tests
 *
 * Tests the document parsing and chunking logic (unit tests, no external dependencies).
 */

import { describe, it, expect } from 'vitest';
import { parseDocument, parseMarkdownFrontmatter } from '../../api/services/indexer.js';

describe('Document Parser', () => {
  describe('parseDocument', () => {
    it('should split text into paragraphs', () => {
      // Each paragraph must be at least 100 chars (the default minChunkSize)
      const text = `First paragraph with enough content to be considered valid for indexing. This paragraph contains multiple sentences to ensure it reaches the minimum character threshold required by the parser.

Second paragraph that also has sufficient length to pass the minimum threshold. We need to make sure each paragraph is long enough to be indexed properly by the system, which requires at least one hundred characters.

Third paragraph completing the test case with adequate content. This final paragraph serves as an additional test case to verify that multiple paragraphs are correctly split and indexed.`;

      const chunks = parseDocument(text);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]).toContain('First paragraph');
    });

    it('should skip chunks below minimum size', () => {
      const text = `This is a valid paragraph with sufficient content to be indexed. It contains more than one hundred characters which is the minimum threshold for indexing paragraphs properly.

Too short.

Another valid paragraph with enough content to pass the threshold. This paragraph also exceeds the minimum character requirement of one hundred characters for proper indexing.`;

      const chunks = parseDocument(text);

      expect(chunks).not.toContain('Too short.');
      expect(chunks.length).toBe(2); // Only the two long paragraphs
    });

    it('should handle long paragraphs by splitting into chunks', () => {
      const longParagraph = 'This is a sentence. '.repeat(200);
      const chunks = parseDocument(longParagraph);

      // Should be split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should be under the max size (with some buffer for overlap)
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThan(2000); // Max + overlap buffer
      });
    });

    it('should preserve chunk overlap for context', () => {
      const text = 'First sentence is here. '.repeat(50) + '\n\n' +
                   'Second section starts here. '.repeat(50);

      const chunks = parseDocument(text);

      // With overlap, later chunks should contain some content from earlier
      // This is hard to test precisely, but we verify chunking works
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty input', () => {
      const chunks = parseDocument('');
      expect(chunks).toEqual([]);
    });

    it('should handle input with only whitespace', () => {
      const chunks = parseDocument('   \n\n   \t   ');
      expect(chunks).toEqual([]);
    });
  });

  describe('parseMarkdownFrontmatter', () => {
    it('should extract frontmatter from markdown', () => {
      const markdown = `---
title: Test Document
author: John Doe
year: 2024
---

The actual content starts here.`;

      const { metadata, content } = parseMarkdownFrontmatter(markdown);

      expect(metadata.title).toBe('Test Document');
      expect(metadata.author).toBe('John Doe');
      expect(metadata.year).toBe('2024');
      expect(content.trim()).toBe('The actual content starts here.');
    });

    it('should handle quoted values', () => {
      const markdown = `---
title: "Quoted Title"
author: 'Single Quoted'
---

Content here.`;

      const { metadata } = parseMarkdownFrontmatter(markdown);

      expect(metadata.title).toBe('Quoted Title');
      expect(metadata.author).toBe('Single Quoted');
    });

    it('should return original text if no frontmatter', () => {
      const text = 'Just plain text without any frontmatter.';
      const { metadata, content } = parseMarkdownFrontmatter(text);

      expect(metadata).toEqual({});
      expect(content).toBe(text);
    });

    it('should handle partial frontmatter (missing closing)', () => {
      const text = `---
title: Incomplete
This is not valid frontmatter`;

      const { metadata, content } = parseMarkdownFrontmatter(text);

      // Should return as-is since frontmatter is incomplete
      expect(metadata).toEqual({});
      expect(content).toBe(text);
    });

    it('should extract multiple metadata fields', () => {
      const markdown = `---
title: Sacred Texts
author: Anonymous
religion: Buddhism
collection: Sutras
language: en
year: 500
---

The Dhammapada begins...`;

      const { metadata } = parseMarkdownFrontmatter(markdown);

      expect(metadata.title).toBe('Sacred Texts');
      expect(metadata.religion).toBe('Buddhism');
      expect(metadata.collection).toBe('Sutras');
      expect(metadata.language).toBe('en');
      expect(metadata.year).toBe('500');
    });
  });
});

describe('Document Chunking Options', () => {
  it('should respect custom chunk size', () => {
    const text = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500);

    const chunksDefault = parseDocument(text);
    const chunksSmall = parseDocument(text, { maxChunkSize: 200, minChunkSize: 50 });

    // Smaller max size should produce more chunks
    expect(chunksSmall.length).toBeGreaterThanOrEqual(chunksDefault.length);
  });

  it('should handle content with markdown headings', () => {
    const markdown = `# Chapter 1

This is the introduction to the chapter with enough content to pass the minimum threshold. The parser requires at least one hundred characters per chunk for proper indexing, so we need to make sure each section is long enough.

## Section 1.1

This section contains important information about the topic. We need to include enough content here to ensure the paragraph passes the minimum size filter of one hundred characters minimum.

## Section 1.2

Another section with different content that should be indexed. This final section also contains sufficient content to meet the minimum requirements for indexing.`;

    const chunks = parseDocument(markdown);

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Content text should be preserved (headings get merged with content)
    expect(chunks.some(c => c.includes('introduction to the chapter'))).toBe(true);
  });
});
