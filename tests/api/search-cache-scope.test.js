// The keyword-search cache keyed on the query string alone, so "justice" filtered to one author and
// "justice" unfiltered shared one entry — whichever ran first answered both.
import { describe, it, expect, beforeEach } from 'vitest';
import { getCachedSearch, setCachedSearch, clearSearchCache } from '../../api/lib/search/cache.js';

describe('search cache scope', () => {
  beforeEach(() => clearSearchCache());

  it('keeps a filtered result apart from the unfiltered one', () => {
    setCachedSearch('justice', [{ id: 1 }], 1, '{"author":"Shoghi Effendi"}');
    expect(getCachedSearch('justice', false)).toBeNull();
    expect(getCachedSearch('justice', false, '{"author":"Shoghi Effendi"}').hits).toEqual([{ id: 1 }]);
  });

  it('still serves the unscoped entry to an unscoped read', () => {
    setCachedSearch('Justice ', [{ id: 2 }], 1);
    expect(getCachedSearch('justice', false).hits).toEqual([{ id: 2 }]);
  });
});
