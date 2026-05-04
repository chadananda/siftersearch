// Chat-route scope plumbing tests (Phase E3).
//
// Pins the wiring that delivers chatbot_location → scope_config →
// multiIndexSearch. Without these tests, a future refactor could drop the
// scope_config parameter at any layer (executeTool, executeSearch, the chat
// route schema) and the wall to bahaiteachings.org would silently leak.
//
// We test the chat-side plumbing (executeSearch passes scope_config through;
// executeTool builds ctx.scope_config). The actual fan-out is covered by
// tests/api/search-fanout.test.js. The scope resolution from chatbot_location
// is covered by tests/api/search-scope.test.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every multiIndexSearch / hybridSearch call to verify scope_config
// is plumbed through executeSearch.
const searchCalls = [];

vi.mock('../../api/lib/search.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    multiIndexSearch: vi.fn(async (query, options) => {
      searchCalls.push({ fn: 'multiIndexSearch', query, options });
      return { hits: [{ id: 1, doc_id: 1, paragraph_index: 0 }] };
    }),
    hybridSearch: vi.fn(async (query, options) => {
      searchCalls.push({ fn: 'hybridSearch', query, options });
      return { hits: [] };
    }),
    keywordSearch: vi.fn(async () => ({ hits: [] })),
  };
});

vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryAll: vi.fn(async () => []),
  queryOne: vi.fn(async () => null),
}));

vi.mock('../../api/lib/auth.js', () => ({
  optionalAuthenticate: () => {},
}));

vi.mock('../../api/lib/anonymous.js', () => ({
  getAnonymousUserId: () => 'anon-test',
}));

vi.mock('../../api/lib/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

vi.mock('../../api/lib/config.js', () => ({
  config: {
    ai: { openai: { apiKey: 'test' } },
    search: { enabled: true, host: 'http://localhost' },
  },
}));

describe('executeSearch scope_config plumbing (Phase E3)', () => {
  let executeSearch, executeTool;

  beforeEach(async () => {
    searchCalls.length = 0;
    const chat = await import('../../api/routes/chat.js');
    executeSearch = chat.executeSearch;
    executeTool = chat.executeTool;
  });

  it('executeSearch passes scope_config through to multiIndexSearch', async () => {
    const scope_config = { primary: false, sites: ['bt'] };
    await executeSearch({ query: 'test', mode: 'passages', scope_config });
    const call = searchCalls.find(c => c.fn === 'multiIndexSearch');
    expect(call).toBeDefined();
    expect(call.options.scope_config).toEqual(scope_config);
  });

  it('executeSearch with no scope_config passes undefined (default scope)', async () => {
    await executeSearch({ query: 'test', mode: 'passages' });
    const call = searchCalls.find(c => c.fn === 'multiIndexSearch');
    expect(call).toBeDefined();
    expect(call.options.scope_config).toBeUndefined();
  });

  it('executeTool wraps args + ctx.scope_config when calling search', async () => {
    const scope_config = { primary: true, sites: ['balib'] };
    await executeTool('search', { query: 'unity' }, { scope_config });
    const call = searchCalls.find(c => c.fn === 'multiIndexSearch');
    expect(call).toBeDefined();
    expect(call.options.scope_config).toEqual(scope_config);
  });

  it('executeTool without ctx still works (default behavior)', async () => {
    await executeTool('search', { query: 'unity' });
    const call = searchCalls.find(c => c.fn === 'multiIndexSearch');
    expect(call).toBeDefined();
    expect(call.options.scope_config).toBeUndefined();
  });

  it('site-only chatbot location plumbs through to searches that exclude primary', async () => {
    // Simulate the resolved scope for chatbot_location='bahaiteachings.org'
    const siteOnlyScope = { primary: false, sites: ['bt'] };
    await executeTool('search', { query: 'opinion essay topic' }, { scope_config: siteOnlyScope });
    const call = searchCalls.find(c => c.fn === 'multiIndexSearch');
    expect(call.options.scope_config.primary).toBe(false);
    expect(call.options.scope_config.sites).toEqual(['bt']);
  });
});
