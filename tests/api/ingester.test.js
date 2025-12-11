/**
 * Document Ingester Tests
 *
 * Tests the paragraph-centric ingestion service.
 * Tests parsing, hashing, and metadata extraction (unit tests, no external dependencies).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hashContent,
  parseDocument,
  parseMarkdownFrontmatter
} from '../../api/services/ingester.js';

describe('Ingester Service', () => {
  describe('hashContent', () => {
    it('should return SHA256 hash of content', () => {
      const hash = hashContent('test content');

      // SHA256 produces 64 hex characters
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should return same hash for same content', () => {
      const content = 'identical content';
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
      const hash1 = hashContent('content A');
      const hash2 = hashContent('content B');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashContent('');

      // Empty string should still produce a valid hash
      expect(hash).toHaveLength(64);
      // SHA256 of empty string is a known value
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should handle Unicode content (Arabic)', () => {
      const arabic = 'سُبْحانَكَ يا إِلهي';
      const hash = hashContent(arabic);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should handle special characters', () => {
      const special = "Bahá'í Faith™ © 2024 — «test»";
      const hash = hashContent(special);

      expect(hash).toHaveLength(64);
    });
  });

  describe('parseDocument (paragraph chunking)', () => {
    it('should split text into paragraphs', () => {
      const text = `First paragraph with enough content to be considered valid for indexing. This paragraph contains multiple sentences to ensure it reaches the minimum character threshold required by the parser which is typically one hundred characters.

Second paragraph that also has sufficient length to pass the minimum threshold. We need to make sure each paragraph is long enough to be indexed properly by the system, which requires at least one hundred characters.

Third paragraph completing the test case with adequate content. This final paragraph serves as an additional test case to verify that multiple paragraphs are correctly split and indexed.`;

      const chunks = parseDocument(text);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]).toContain('First paragraph');
    });

    it('should skip chunks below minimum size (100 chars default)', () => {
      const text = `This is a valid paragraph with sufficient content to be indexed. It contains more than one hundred characters which is the minimum threshold for indexing paragraphs properly in the system.

Short.

Another valid paragraph with enough content to pass the threshold. This paragraph also exceeds the minimum character requirement of one hundred characters for proper indexing and should be included.`;

      const chunks = parseDocument(text);

      expect(chunks).not.toContain('Short.');
      expect(chunks.length).toBe(2);
    });

    it('should handle long paragraphs by splitting into chunks', () => {
      const longParagraph = 'This is a sentence with some content. '.repeat(200);
      const chunks = parseDocument(longParagraph);

      // Should be split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should be under the max size (1500 + overlap buffer)
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThan(2000);
      });
    });

    it('should handle empty input', () => {
      const chunks = parseDocument('');
      expect(chunks).toEqual([]);
    });

    it('should handle whitespace-only input', () => {
      const chunks = parseDocument('   \n\n   \t   ');
      expect(chunks).toEqual([]);
    });

    it('should respect custom chunk options', () => {
      const text = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500);

      const chunksDefault = parseDocument(text);
      const chunksSmall = parseDocument(text, { maxChunkSize: 200, minChunkSize: 50 });

      // Smaller max size should produce more chunks
      expect(chunksSmall.length).toBeGreaterThanOrEqual(chunksDefault.length);
    });
  });

  describe('parseMarkdownFrontmatter (gray-matter)', () => {
    it('should extract frontmatter from markdown', () => {
      const markdown = `---
title: Test Document
author: John Doe
year: 2024
religion: General
---

The actual content starts here.`;

      const { metadata, content } = parseMarkdownFrontmatter(markdown);

      expect(metadata.title).toBe('Test Document');
      expect(metadata.author).toBe('John Doe');
      expect(metadata.year).toBe('2024');
      expect(metadata.religion).toBe('General');
      expect(content.trim()).toBe('The actual content starts here.');
    });

    it('should handle quoted YAML values', () => {
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

    it('should handle incomplete frontmatter gracefully', () => {
      const text = `---
title: Incomplete
This is not valid frontmatter`;

      const { metadata, content } = parseMarkdownFrontmatter(text);

      // gray-matter handles this - either parses what it can or returns raw
      expect(typeof metadata).toBe('object');
      expect(typeof content).toBe('string');
    });

    it('should handle YAML arrays by joining them', () => {
      const markdown = `---
title: Multi-Author Work
authors:
  - John Doe
  - Jane Smith
  - Bob Wilson
---

Content here.`;

      const { metadata } = parseMarkdownFrontmatter(markdown);

      // Arrays should be joined as comma-separated strings
      expect(metadata.authors).toBe('John Doe, Jane Smith, Bob Wilson');
    });

    it('should handle n.d. year values', () => {
      const markdown = `---
title: Undated Document
year: n.d.
author: Unknown
---

Content without a known date.`;

      const { metadata } = parseMarkdownFrontmatter(markdown);

      // n.d. should be preserved as string in frontmatter
      expect(metadata.year).toBe('n.d.');
    });

    it('should handle Arabic frontmatter', () => {
      const markdown = `---
title: مناجات
author: حضرة بهاءالله
language: ar
religion: Bahá'í
---

سُبْحانَكَ يا إِلهي يَشْهَدُ كُلُّ ذِي بَصَرٍ بِسَلْطَنَتِكَ`;

      const { metadata, content } = parseMarkdownFrontmatter(markdown);

      expect(metadata.title).toBe('مناجات');
      expect(metadata.author).toBe('حضرة بهاءالله');
      expect(metadata.language).toBe('ar');
      expect(content).toContain('سُبْحانَكَ');
    });

    it('should skip [object Object] values', () => {
      const markdown = `---
title: Test
nested:
  key: value
---

Content.`;

      const { metadata } = parseMarkdownFrontmatter(markdown);

      // Nested objects should be skipped (not included in metadata)
      expect(metadata.nested).toBeUndefined();
      expect(metadata.title).toBe('Test');
    });

    it('should handle empty frontmatter', () => {
      const markdown = `---
---

Just content, empty frontmatter.`;

      const { metadata, content } = parseMarkdownFrontmatter(markdown);

      expect(metadata).toEqual({});
      expect(content.trim()).toBe('Just content, empty frontmatter.');
    });
  });

  describe('Integration: Frontmatter + Chunking', () => {
    it('should parse document with frontmatter and chunk content', () => {
      const markdown = `---
title: Prayers and Meditations
author: Bahá'u'lláh
religion: Bahá'í
year: 1938
---

# Prayer I

Glorified art Thou, O Lord my God! Every man of insight confesseth Thy sovereignty and Thy dominion, and every discerning eye perceiveth the greatness of Thy majesty and the compelling power of Thy might. This is a paragraph with enough content to exceed the minimum threshold.

# Prayer II

I beseech Thee by Thy Name through which Thou hast enabled such as are devoted to Thee to recognize Thee. This second prayer also contains sufficient text to be included as a separate chunk in the indexing process.`;

      const { metadata, content } = parseMarkdownFrontmatter(markdown);
      const chunks = parseDocument(content);

      // Metadata should be extracted
      expect(metadata.title).toBe('Prayers and Meditations');
      expect(metadata.author).toBe("Bahá'u'lláh");

      // Content should be chunked
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Content Hash Change Detection', () => {
  it('should detect changed content via different hashes', () => {
    const original = 'Original document content here.';
    const modified = 'Modified document content here.';

    const hashOriginal = hashContent(original);
    const hashModified = hashContent(modified);

    expect(hashOriginal).not.toBe(hashModified);
  });

  it('should confirm unchanged content via same hash', () => {
    const content = 'Document content that does not change.';

    const hash1 = hashContent(content);
    // Simulate "re-reading" the same content later
    const hash2 = hashContent(content);

    expect(hash1).toBe(hash2);
  });

  it('should detect whitespace-only changes', () => {
    const withSpaces = 'Content with  double spaces.';
    const withSingle = 'Content with single spaces.';

    const hash1 = hashContent(withSpaces);
    const hash2 = hashContent(withSingle);

    expect(hash1).not.toBe(hash2);
  });
});

describe('Edge Cases', () => {
  it('should handle very long documents', () => {
    const longContent = 'This is sentence number X. '.repeat(10000);
    const chunks = parseDocument(longContent);

    // Should produce many chunks without crashing
    expect(chunks.length).toBeGreaterThan(10);

    // All chunks should be valid
    chunks.forEach(chunk => {
      expect(chunk.length).toBeGreaterThan(0);
      expect(chunk.length).toBeLessThan(2000);
    });
  });

  it('should handle documents with only headings', () => {
    const markdown = `# Heading 1

## Heading 2

### Heading 3`;

    const { content } = parseMarkdownFrontmatter(markdown);
    const chunks = parseDocument(content);

    // Headings alone are too short, should result in empty or filtered chunks
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it('should handle mixed language content', () => {
    const mixed = `English introduction paragraph with sufficient length to be indexed. This paragraph exceeds the minimum character threshold of one hundred characters.

مقدمة عربية مع محتوى كافٍ ليتم فهرسته. هذه الفقرة تتجاوز الحد الأدنى لعدد الأحرف المطلوبة للفهرسة وهو مئة حرف.

Back to English with more content here. This final paragraph also contains enough text to be properly indexed by the system.`;

    const chunks = parseDocument(mixed);

    // Should handle both languages
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Should contain both English and Arabic
    const hasEnglish = chunks.some(c => c.includes('English'));
    const hasArabic = chunks.some(c => c.includes('عربية'));

    expect(hasEnglish).toBe(true);
    expect(hasArabic).toBe(true);
  });

  it('should handle frontmatter with special YAML characters', () => {
    const markdown = `---
title: "Title: With Colon"
description: "Line 1\\nLine 2"
notes: |
  Multiline
  YAML block
---

Content here.`;

    const { metadata } = parseMarkdownFrontmatter(markdown);

    expect(metadata.title).toBe('Title: With Colon');
    // Multiline blocks become strings
    expect(metadata.notes).toBeDefined();
  });
});
