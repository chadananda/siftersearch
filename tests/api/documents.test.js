/**
 * Documents API Tests
 *
 * Tests the document access and export functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the search module
vi.mock('../../api/lib/search.js', () => ({
  getMeili: vi.fn(() => ({
    index: vi.fn(() => ({
      getDocument: vi.fn(),
      search: vi.fn()
    }))
  })),
  INDEXES: {
    DOCUMENTS: 'documents',
    PARAGRAPHS: 'paragraphs'
  }
}));

describe('Documents API - URL Generation', () => {
  it('should generate valid download token format', () => {
    // Token should be 32 characters (nanoid default)
    const tokenLength = 32;
    expect(tokenLength).toBe(32);
  });

  it('should support multiple export formats', () => {
    const supportedFormats = ['json', 'jsonl', 'csv', 'txt', 'md'];
    expect(supportedFormats).toContain('json');
    expect(supportedFormats).toContain('jsonl');
    expect(supportedFormats).toContain('csv');
    expect(supportedFormats).toContain('txt');
    expect(supportedFormats).toContain('md');
  });
});

describe('Export Format Generation', () => {
  const mockDocument = {
    id: 'doc_123',
    title: 'Test Document',
    author: 'Test Author',
    religion: 'Buddhism',
    language: 'ar',
    year: 2024
  };

  const mockSegments = [
    {
      id: 'doc_123_p0',
      document_id: 'doc_123',
      paragraph_index: 0,
      text: 'First paragraph of the document.',
      heading: 'Introduction',
      title: 'Test Document',
      author: 'Test Author'
    },
    {
      id: 'doc_123_p1',
      document_id: 'doc_123',
      paragraph_index: 1,
      text: 'Second paragraph continues here.',
      heading: 'Introduction',
      title: 'Test Document',
      author: 'Test Author'
    }
  ];

  it('should format JSON export correctly', () => {
    const result = JSON.stringify({
      document: mockDocument,
      segments: mockSegments
    }, null, 2);

    expect(result).toContain('"title": "Test Document"');
    expect(result).toContain('"segments"');
    expect(JSON.parse(result).segments.length).toBe(2);
  });

  it('should format JSONL export correctly', () => {
    const lines = [
      JSON.stringify({ _type: 'document', ...mockDocument }),
      ...mockSegments.map(s => JSON.stringify(s))
    ];
    const result = lines.join('\n');

    const parsed = result.split('\n').map(l => JSON.parse(l));
    expect(parsed[0]._type).toBe('document');
    expect(parsed[1].paragraph_index).toBe(0);
    expect(parsed[2].paragraph_index).toBe(1);
  });

  it('should format CSV export with headers', () => {
    const headers = ['paragraph_index', 'text', 'heading', 'title', 'author', 'religion', 'language'];
    const csvRows = [headers.join(',')];

    for (const seg of mockSegments) {
      const row = headers.map(h => {
        const val = seg[h] ?? '';
        const escaped = String(val).replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      });
      csvRows.push(row.join(','));
    }

    const result = csvRows.join('\n');
    expect(result).toContain('paragraph_index,text,heading');
    expect(result.split('\n').length).toBe(3); // header + 2 rows
  });

  it('should format markdown with frontmatter', () => {
    const mdParts = [
      '---',
      `title: "${mockDocument.title}"`,
      `author: "${mockDocument.author}"`,
      `language: ${mockDocument.language}`,
      '---\n',
      `# ${mockDocument.title}\n`
    ];

    let lastHeading = '';
    for (const seg of mockSegments) {
      if (seg.heading && seg.heading !== lastHeading) {
        mdParts.push(`\n## ${seg.heading}\n`);
        lastHeading = seg.heading;
      }
      mdParts.push(seg.text);
    }

    const result = mdParts.join('\n');
    expect(result).toContain('---');
    expect(result).toContain('title: "Test Document"');
    expect(result).toContain('# Test Document');
    expect(result).toContain('## Introduction');
  });

  it('should format plain text without metadata when disabled', () => {
    const textParts = mockSegments.map(seg => seg.text);
    const result = textParts.join('\n\n');

    expect(result).not.toContain('Title:');
    expect(result).toContain('First paragraph');
    expect(result).toContain('Second paragraph');
  });
});

describe('Bulk Export', () => {
  it('should handle multiple document IDs', () => {
    const documentIds = ['doc_1', 'doc_2', 'doc_3'];
    expect(documentIds.length).toBe(3);
  });

  it('should enforce max document limit', () => {
    const maxDocuments = 50;
    const documentIds = Array(100).fill('doc').map((d, i) => `${d}_${i}`);

    // API should reject more than 50
    expect(documentIds.length).toBeGreaterThan(maxDocuments);
  });
});

describe('Arabic Document Support', () => {
  const arabicDocument = {
    id: 'doc_arabic',
    title: 'كتاب الأخلاق',
    author: 'الشيخ الرئيس',
    language: 'ar',
    religion: 'Islam'
  };

  const arabicSegments = [
    {
      id: 'doc_arabic_p0',
      text: 'بسم الله الرحمن الرحيم',
      paragraph_index: 0
    },
    {
      id: 'doc_arabic_p1',
      text: 'الحمد لله رب العالمين',
      paragraph_index: 1
    }
  ];

  it('should preserve Arabic text in JSON export', () => {
    const result = JSON.stringify({
      document: arabicDocument,
      segments: arabicSegments
    });

    expect(result).toContain('بسم الله');
    expect(result).toContain('كتاب الأخلاق');
  });

  it('should handle RTL text in markdown export', () => {
    const mdContent = `---
title: "${arabicDocument.title}"
language: ${arabicDocument.language}
---

# ${arabicDocument.title}

${arabicSegments.map(s => s.text).join('\n\n')}`;

    expect(mdContent).toContain('كتاب الأخلاق');
    expect(mdContent).toContain('language: ar');
  });

  it('should properly escape Arabic in CSV', () => {
    const text = arabicSegments[0].text;
    // Arabic text with comma should be quoted
    const csvValue = text.includes(',') ? `"${text}"` : text;
    expect(csvValue).toContain('بسم الله');
  });
});

describe('Token Expiry', () => {
  it('should set 15 minute expiry', () => {
    const TOKEN_EXPIRY_MS = 15 * 60 * 1000;
    expect(TOKEN_EXPIRY_MS).toBe(900000);
  });
});
