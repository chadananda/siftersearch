// Chad 10-20: retire Meilisearch — under SEARCH_QDRANT=only the classic entry points answer from Qdrant; site-only scopes
// (no primary) still go to Meili until their content is in Qdrant.
import { describe, it, expect, afterEach, vi } from 'vitest';

describe('classic search entry points route to Qdrant under SEARCH_QDRANT=only', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('routes primary searches, keeps site-only on Meili, honours _meiliDirect', async () => {
    const { routesToQdrant } = await import('../../api/lib/search.js');
    vi.stubEnv('SEARCH_QDRANT', 'only');
    expect(routesToQdrant({})).toBe(true);
    expect(routesToQdrant({ scope_config: { primary: true, sites: ['balib'] } })).toBe(true);
    expect(routesToQdrant({ scope_config: { primary: false, sites: ['bt'] } })).toBe(false);
    expect(routesToQdrant({ _meiliDirect: true })).toBe(false);
    vi.stubEnv('SEARCH_QDRANT', 'phrase,keyword');
    expect(routesToQdrant({})).toBe(false);
  });
});
