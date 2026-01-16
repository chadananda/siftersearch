/**
 * Authority Feature Tests
 *
 * BDD tests for the doctrinal authority system that weights
 * search results based on author, collection, and religion.
 *
 * Authority is now read from library meta.yaml files:
 * - .religion/meta.yaml - religion-level defaults
 * - .collection/meta.yaml - collection-level defaults
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the config module
vi.mock('../../api/lib/config.js', () => ({
  config: {
    library: {
      basePath: '/mock/library'
    }
  }
}));

// Mock fs to simulate library structure
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');

  // Simulated meta.yaml contents
  const mockMetaFiles = {
    '/mock/library/Bahai Faith/.religion/meta.yaml': `
title: "Baha'i Faith"
authority: 6
description: "The Baha'i Faith"
`,
    '/mock/library/Bahai Faith/Core Tablets/.collection/meta.yaml': `
title: Core Tablets
authority: 10
`,
    '/mock/library/Bahai Faith/Core Publications/.collection/meta.yaml': `
title: Core Publications
authority: 10
`,
    '/mock/library/Bahai Faith/Pilgrim Notes/.collection/meta.yaml': `
title: Pilgrim Notes
authority: 1
`,
    '/mock/library/Bahai Faith/Studies Papers/.collection/meta.yaml': `
title: Studies Papers
authority: 3
`,
    '/mock/library/Islam/.religion/meta.yaml': `
title: Islam
authority: 6
`,
  };

  return {
    ...actual,
    readFileSync: vi.fn((path, encoding) => {
      if (mockMetaFiles[path]) {
        return mockMetaFiles[path];
      }
      throw new Error(`ENOENT: no such file: ${path}`);
    }),
    readdirSync: vi.fn((path) => {
      if (path === '/mock/library') {
        return ['Bahai Faith', 'Islam', '.DS_Store'];
      }
      if (path === '/mock/library/Bahai Faith') {
        return ['Core Tablets', 'Core Publications', 'Pilgrim Notes', 'Studies Papers', '.religion'];
      }
      if (path === '/mock/library/Islam') {
        return ['.religion'];
      }
      return [];
    }),
    statSync: vi.fn((path) => ({
      isDirectory: () => !path.includes('.DS_Store') && !path.endsWith('.yaml')
    }))
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
    describe('author-based authority (fallback)', () => {
      // Author-based authority only applies when no collection/religion authority exists
      it('should return 10 for Bahá\'u\'lláh when no collection/religion match', () => {
        const authority = getAuthority({
          author: 'Bahá\'u\'lláh',
          religion: 'Unknown Religion',
          collection: 'Unknown Collection'
        });
        expect(authority).toBe(10);
      });

      it('should return 10 for The Báb when no collection/religion match', () => {
        const authority = getAuthority({
          author: 'The Báb',
          religion: 'Unknown Religion',
          collection: 'Unknown Collection'
        });
        expect(authority).toBe(10);
      });

      it('should return 9 for Shoghi Effendi when no collection/religion match', () => {
        const authority = getAuthority({
          author: 'Shoghi Effendi',
          religion: 'Unknown Religion',
          collection: 'Unknown Collection'
        });
        expect(authority).toBe(9);
      });

      it('should match author by substring when no collection/religion match', () => {
        const authority = getAuthority({
          author: 'Tablets of Bahá\'u\'lláh revealed after the Kitáb-i-Aqdas',
          religion: 'Unknown Religion',
          collection: 'Unknown Collection'
        });
        expect(authority).toBe(10);
      });
    });

    describe('collection-based authority', () => {
      it('should return 10 for Core Publications collection', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Bahai Faith',
          collection: 'Core Publications'
        });
        expect(authority).toBe(10);
      });

      it('should return 10 for Core Tablets collection', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Bahai Faith',
          collection: 'Core Tablets'
        });
        expect(authority).toBe(10);
      });

      it('should return 1 for Pilgrim Notes (lowest authority)', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Bahai Faith',
          collection: 'Pilgrim Notes'
        });
        expect(authority).toBe(1);
      });

      it('should return 3 for Studies Papers', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Bahai Faith',
          collection: 'Studies Papers'
        });
        expect(authority).toBe(3);
      });
    });

    describe('religion-based authority', () => {
      it('should return 6 for Bahai Faith religion with unknown collection', () => {
        const authority = getAuthority({
          author: 'Unknown',
          religion: 'Bahai Faith',
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
          religion: 'Bahai Faith',
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
      it('should prioritize collection over author', () => {
        // Pilgrim Notes (collection = 1) should beat Bahá'u'lláh (author = 10)
        // because collection authority takes precedence
        const authority = getAuthority({
          author: 'Bahá\'u\'lláh',
          religion: 'Bahai Faith',
          collection: 'Pilgrim Notes'
        });
        expect(authority).toBe(1);
      });

      it('should prioritize collection over religion default', () => {
        // Core Tablets (10) should beat religion default (6)
        const authority = getAuthority({
          author: 'Unknown Author',
          religion: 'Bahai Faith',
          collection: 'Core Tablets'
        });
        expect(authority).toBe(10);
      });

      it('should use author-based only as fallback when no collection match', () => {
        // Religion default (6) should beat author (10) because collection check happens first
        // But when collection doesn't exist, religion default applies, then author fallback
        const authority = getAuthority({
          author: 'Bahá\'u\'lláh',
          religion: 'Bahai Faith',
          collection: 'Some Unknown Collection'
        });
        // Religion default (6) takes precedence over author fallback
        expect(authority).toBe(6);
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
        { id: 'doc1', author: 'Bahá\'u\'lláh', religion: 'Bahai Faith', collection: 'Core Tablets' },
        { id: 'doc2', author: 'Unknown', religion: 'Bahai Faith', collection: 'Pilgrim Notes' },
        { id: 'doc3', author: 'Unknown', religion: 'Unknown', collection: 'Unknown' }
      ];

      const result = getAuthorityBatch(docs);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('doc1')).toBe(10); // Core Tablets collection
      expect(result.get('doc2')).toBe(1);  // Pilgrim Notes collection
      expect(result.get('doc3')).toBe(5);  // Default
    });

    it('should handle empty array', () => {
      const result = getAuthorityBatch([]);
      expect(result.size).toBe(0);
    });
  });
});

describe('Authority Ranking in Search', () => {
  beforeEach(() => {
    reloadConfig();
  });

  it('should rank Sacred Text (10) higher than Published (5)', () => {
    const sacredAuthority = getAuthority({
      author: 'Bahá\'u\'lláh',
      religion: 'Bahai Faith',
      collection: 'Core Tablets'
    });

    const publishedAuthority = getAuthority({
      author: 'Paul Lample',
      religion: 'Bahai Faith',
      collection: 'Bahai Books'
    });

    expect(sacredAuthority).toBeGreaterThan(publishedAuthority);
  });

  it('should rank Core Publications (10) higher than Pilgrim Notes (1)', () => {
    const coreAuthority = getAuthority({
      author: 'Unknown',
      religion: 'Bahai Faith',
      collection: 'Core Publications'
    });

    const pilgrimAuthority = getAuthority({
      author: 'Unknown',
      religion: 'Bahai Faith',
      collection: 'Pilgrim Notes'
    });

    expect(coreAuthority).toBe(10);
    expect(pilgrimAuthority).toBe(1);
    expect(coreAuthority).toBeGreaterThan(pilgrimAuthority);
  });
});
