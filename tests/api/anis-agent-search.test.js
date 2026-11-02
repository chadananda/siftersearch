// agentSearch: direct multiIndexSearch + links, no planner/LLM; tradition → religion filter only when given.
import { describe, it, expect, vi } from 'vitest';
import { agentSearch } from '../../api/lib/assistant/agent-search.js';
import { agentTools } from '../../api/lib/assistant/agent.js';

const hit = (o = {}) => ({ id: 7, doc_id: 3, paragraph_index: 4, text: 'O Son of Spirit!', title: 'The Hidden Words', author: "Bahá'u'lláh", religion: "Baha'i", collection: 'Core', language: 'en', ...o });
const links = async (hs) => hs.map((h) => ({ ...h, url: `https://oceanlibrary.com/d/${h.doc_id}#p${h.paragraph_index}` }));

describe('agentSearch', () => {
  it('passes the query as given, limit 8, no filter without tradition', async () => {
    const multi = vi.fn(async () => ({ hits: [hit()] }));
    const out = await agentSearch({ multiIndexSearch: multi, withLinks: links })('detachment', undefined);
    expect(multi).toHaveBeenCalledWith('detachment', { limit: 8, filters: {} });
    expect(out[0]).toMatchObject({ document_id: 3, paragraph_index: 4, source_url: 'https://oceanlibrary.com/d/3#p4', title: 'The Hidden Words' });
    expect(typeof out.ms).toBe('number');
  });
  it('religion filter only when tradition is given', async () => {
    const multi = vi.fn(async () => ({ hits: [] }));
    await agentSearch({ multiIndexSearch: multi, withLinks: links })('x', 'Islam');
    expect(multi.mock.calls[0][1].filters).toEqual({ religion: 'Islam' });
  });
  it('drops whole-book paragraphs and falls back to unlinked hits if linking fails', async () => {
    const multi = async () => ({ hits: [hit({ text: 'x'.repeat(9000) }), hit({ id: 8, source_url: 'https://a/b' })] });
    const out = await agentSearch({ multiIndexSearch: multi, withLinks: async () => { throw new Error('db'); } })('q');
    expect(out).toHaveLength(1);
    expect(out[0].source_url).toBe('https://a/b');
  });
  it('agentTools search_library uses it and never the planner', async () => {
    const planner = vi.fn();
    const t = agentTools({ search: planner, fastSearch: agentSearch({ multiIndexSearch: async () => ({ hits: [hit()] }), withLinks: links }) });
    const r = await t.search('detachment', "Baha'i");
    expect(r[0].source_url).toMatch(/oceanlibrary/);
    expect(planner).not.toHaveBeenCalled();
  });
});
