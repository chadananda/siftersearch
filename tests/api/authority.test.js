/**
 * Authority Feature Tests
 *
 * BDD tests for the doctrinal authority system that weights
 * search results based on author, collection, and religion.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the YAML config loading
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    readFileSync: vi.fn((path) => {
      if (path.includes('authority-config.yml')) {
        return `
default_authority: 5

religions:
  Baha'i: 6
  Islam: 6

collections:
  Baha'i:
    Core Tablets: 10
    Core Publications: 10
    Pilgrim Notes: 1
    Studies Papers: 3

authors:
  Bahá'u'lláh: 10
  The Báb: 10
  Shoghi Effendi: 9
`;
      }
      return actual.readFileSync(path);
    })
  };
});

// Import after mocking
const { getAuthority, getAuthorityLabel, getAuthorityBatch, reloadConfig } = await import('../../api/lib/authority.js');

describe('Authority System', () => {
  beforeEach(() => {
    // Reload config to ensure clean state
    reloadConfig();
  });

  describe('getAuthority function', () => {
    describe('author-based authority', () => {
      it('should return 10 for Bahá\'u\'lláh (Central Figure)', () => {
        const authority = getAuthority({
          author: 'Bahá\'u\'lláh',
          religion: 'Baha\'i',
          collection: 'General'
        });
        expect(authority).toBe(10);
      });

      it('should return 10 for The Báb (Central Figure)', () => {
        const authority = getAuthority({
          author: 'The Báb',
          religion: 'Baha\'i',
          collection: 'General'
        });
        expect(authority).toBe(10);
      });

      it('should return 9 for Shoghi Effendi (Authoritative interpretation)', () => {
        const authority = getAuthority({
          author: 'Shoghi Effendi',
          religion: 'Baha\'i',
          collection: 'General'
        });
        expect(authority).toBe(9);
      });

      it('should match author by substring', () => {
        const authority = getAuthority({
          author: 'Tablets of Bahá\'u\'lláh revealed after the Kitáb-i-Aqdas',
          religion: 'Baha\'i',
          collection: 'General'
        });
        expect(authority).toBe(10);
      });
    });

    describe('collection-based authority', () => {
      it('should return 10 for Core Publications collection', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Baha\'i',
          collection: 'Core Publications'
        });
        expect(authority).toBe(10);
      });

      it('should return 10 for Core Tablets collection', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Baha\'i',
          collection: 'Core Tablets'
        });
        expect(authority).toBe(10);
      });

      it('should return 1 for Pilgrim Notes (lowest authority)', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Baha\'i',
          collection: 'Pilgrim Notes'
        });
        expect(authority).toBe(1);
      });

      it('should return 3 for Studies Papers', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Baha\'i',
          collection: 'Studies Papers'
        });
        expect(authority).toBe(3);
      });
    });

    describe('religion-based authority', () => {
      it('should return 6 for Baha\'i religion with unknown collection', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Baha\'i',
          collection: 'Some Unknown Collection'
        });
        expect(authority).toBe(6);
      });

      it('should return 6 for Islam religion with unknown collection', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Islam',
          collection: 'Unknown'
        });
        expect(authority).toBe(6);
      });
    });

    describe('default authority', () => {
      it('should return 5 for documents without matching religion/collection', () => {
        const authority = getAuthority({
          author: 'Some Person',
          religion: 'Unknown Religion',
          collection: 'Unknown Collection'
        });
        expect(authority).toBe(5);
      });

      it('should return 5 for empty document metadata', () => {
        const authority = getAuthority({});
        expect(authority).toBe(5);
      });
    });

    describe('explicit authority override', () => {
      it('should use explicit authority when provided', () => {
        const authority = getAuthority({
          author: 'Bahá\'u\'lláh',
          religion: 'Baha\'i',
          collection: 'Core Tablets',
          authority: 7
        });
        expect(authority).toBe(7);
      });

      it('should clamp authority to maximum of 10', () => {
        const authority = getAuthority({ authority: 15 });
        expect(authority).toBe(10);
      });

      it('should clamp authority to minimum of 1', () => {
        const authority = getAuthority({ authority: 0 });
        expect(authority).toBe(1);
      });
    });

    describe('priority order', () => {
      it('should prioritize author over collection', () => {
        // Bahá'u'lláh (author = 10) should beat Pilgrim Notes (collection = 1)
        const authority = getAuthority({
          author: 'Bahá\'u\'lláh',
          religion: 'Baha\'i',
          collection: 'Pilgrim Notes'
        });
        expect(authority).toBe(10);
      });

      it('should prioritize collection over religion default', () => {
        // Core Tablets (10) should beat religion default (6)
        const authority = getAuthority({
          author: 'Unknown Author',
          religion: 'Baha\'i',
          collection: 'Core Tablets'
        });
        expect(authority).toBe(10);
      });
    });
  });

  describe('getAuthorityLabel function', () => {
    it('should return "Sacred Text" for authority 10', () => {
      expect(getAuthorityLabel(10)).toBe('Sacred Text');
    });

    it('should return "Authoritative" for authority 9', () => {
      expect(getAuthorityLabel(9)).toBe('Authoritative');
    });

    it('should return "Institutional" for authority 8', () => {
      expect(getAuthorityLabel(8)).toBe('Institutional');
    });

    it('should return "Official" for authority 7', () => {
      expect(getAuthorityLabel(7)).toBe('Official');
    });

    it('should return "Reference" for authority 6', () => {
      expect(getAuthorityLabel(6)).toBe('Reference');
    });

    it('should return "Published" for authority 5', () => {
      expect(getAuthorityLabel(5)).toBe('Published');
    });

    it('should return "Historical" for authority 4', () => {
      expect(getAuthorityLabel(4)).toBe('Historical');
    });

    it('should return "Research" for authority 3', () => {
      expect(getAuthorityLabel(3)).toBe('Research');
    });

    it('should return "Commentary" for authority 2', () => {
      expect(getAuthorityLabel(2)).toBe('Commentary');
    });

    it('should return "Unofficial" for authority 1', () => {
      expect(getAuthorityLabel(1)).toBe('Unofficial');
    });
  });

  describe('getAuthorityBatch function', () => {
    it('should return a Map with authority for each document', () => {
      const docs = [
        { id: 'doc1', author: 'Bahá\'u\'lláh', religion: 'Baha\'i', collection: 'General' },
        { id: 'doc2', author: 'Unknown', religion: 'Baha\'i', collection: 'Pilgrim Notes' },
        { id: 'doc3', author: 'Unknown', religion: 'Unknown', collection: 'Unknown' }
      ];

      const result = getAuthorityBatch(docs);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('doc1')).toBe(10); // Central Figure
      expect(result.get('doc2')).toBe(1);  // Pilgrim Notes
      expect(result.get('doc3')).toBe(5);  // Default
    });

    it('should handle empty array', () => {
      const result = getAuthorityBatch([]);
      expect(result.size).toBe(0);
    });
  });
});

describe('Authority Ranking in Search', () => {
  it('should rank Sacred Text (10) higher than Published (5)', () => {
    const sacredAuthority = getAuthority({
      author: 'Bahá\'u\'lláh',
      religion: 'Baha\'i',
      collection: 'Core Tablets'
    });

    const publishedAuthority = getAuthority({
      author: 'Paul Lample',
      religion: 'Baha\'i',
      collection: 'Baha\'i Books'
    });

    expect(sacredAuthority).toBeGreaterThan(publishedAuthority);
  });

  it('should rank Core Publications (10) higher than Pilgrim Notes (1)', () => {
    const coreAuthority = getAuthority({
      author: 'Unknown',
      religion: 'Baha\'i',
      collection: 'Core Publications'
    });

    const pilgrimAuthority = getAuthority({
      author: 'Unknown',
      religion: 'Baha\'i',
      collection: 'Pilgrim Notes'
    });

    expect(coreAuthority).toBe(10);
    expect(pilgrimAuthority).toBe(1);
    expect(coreAuthority).toBeGreaterThan(pilgrimAuthority);
  });
});
