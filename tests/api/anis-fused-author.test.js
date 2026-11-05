// fused_search's author field (11-05): the model names the writer, code resolves the name and holds the search to that writer's
// words. A name left in a no-planner query is only more words (SAQ 77 missed for "where does 'Abdu'l-Bahá say justice…").
import { describe, it, expect, vi } from 'vitest';
import * as tools from '../../api/lib/assistant/tools.js';
import { AGENT_TOOL_NAMES } from '../../api/lib/assistant/agent.js';

const run = async (input) => {
  const fastSearch = vi.fn(async () => [{ id: 1, text: 't' }]);
  await tools.run('fused_search', input, { fastSearch });
  return fastSearch.mock.calls[0];
};

describe('fused_search author', () => {
  it.each([
    ["Abdu'l-Baha", '‘Abdu’l-Bahá'],
    ['‘Abdu’l-Bahá', '‘Abdu’l-Bahá'],
    ['Bahaullah', 'Bahá’u’lláh'],
    ["Bahá'u'lláh", 'Bahá’u’lláh'],
    ['the Bab', 'The Báb'],
    ['Shoghi Effendi', 'Shoghi Effendi'],
  ])('resolves %s to the library writer %s', async (name, writer) => {
    const [, , , filters] = await run({ query: 'the meaning of detachment', author: name });
    expect(filters).toEqual({ author: writer });
  });
  it('an unknown writer passes through as written; tradition stays its own argument', async () => {
    const [q, tradition, limit, filters] = await run({ query: 'the reed flute', tradition: 'Islam', author: ' Rumi ' });
    expect([q, tradition, limit, filters]).toEqual(['the reed flute', 'Islam', 8, { author: 'Rumi' }]);
  });
  it('no author → no author filter', async () => {
    expect((await run({ query: 'courtesy' })).length).toBe(3);
  });
  it('the agent sees author on fused_search, and its description no longer promises a name in the query narrows', () => {
    const fused = tools.llmTools(AGENT_TOOL_NAMES).find((t) => (t.function?.name ?? t.name) === 'fused_search');
    const fn = fused.function ?? fused;
    expect(Object.keys((fn.parameters ?? fn.input_schema).properties)).toEqual(expect.arrayContaining(['query', 'author']));
    expect(fn.description).not.toMatch(/name an author or work in the query to narrow/);
    expect(fn.description).toMatch(/set author/);
  });
});
