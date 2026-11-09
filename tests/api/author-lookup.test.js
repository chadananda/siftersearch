// author_lookup tool (tools.js matchAuthors, authors from docs-repo distinctAuthors via ctx.deps) + search.shelf by_person passing the resolved key array.
import { describe, it, expect } from 'vitest';
import { matchAuthors, run as runTool } from '../../api/lib/assistant/tools.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';

const ROWS = [{ author: 'Augustine of Hippo', n: 3 }, { author: 'Saint Augustine', n: 5 }, { author: 'Augustine', n: 1 }, { author: "Bahá'u'lláh", n: 900 }, { author: 'Mirza Baha\'ali', n: 2 }, { author: 'Ali ibn Abi Talib', n: 4 }, { author: 'Malik', n: 1 }];
const mk = (units, tools) => ({ node: 'n', question: 'q', tools, units: { ...units }, ctx: {}, templates: {} });

describe('matchAuthors', () => {
  it('Augustine finds every variant, exact first then by documents', () => {
    expect(matchAuthors('Augustine', ROWS).map((a) => a.author)).toEqual(['Augustine', 'Saint Augustine', 'Augustine of Hippo']);
    expect(matchAuthors('augustine', ROWS)[0]).toEqual({ author: 'Augustine', key: 'augustine', docs: 1 });
  });
  it('Ali is a whole token: no Baha\'ali, no Malik', () => {
    expect(matchAuthors('Ali', ROWS).map((a) => a.author)).toEqual(['Ali ibn Abi Talib']);
  });
  it('multi-token and apostrophe names; nothing resolves → []; capped', () => {
    expect(matchAuthors("Bahá'u'lláh", ROWS).map((a) => a.author)).toEqual(["Bahá'u'lláh"]);
    expect(matchAuthors('Abi Talib', ROWS)).toHaveLength(1);
    expect(matchAuthors('Nobody', ROWS)).toEqual([]);
    expect(matchAuthors('', ROWS)).toEqual([]);
    expect(matchAuthors('x', Array.from({ length: 30 }, (_, i) => ({ author: `x ${i}`, n: i }))).length).toBe(12);
  });
  it('the registry tool returns {authors} from the injected list', async () => {
    const r = await runTool('author_lookup', { name: 'Augustine' }, { deps: { distinctAuthors: async () => ROWS } });
    expect(r.authors).toHaveLength(3);
  });
});

describe('search.shelf by_person', () => {
  const run = async (tools) => { const seen = []; const s = mk({ named_person: 'Augustine' }, { fused_search: async (i) => { seen.push(i.filters); return { passages: [] }; }, ...tools }); await ELEMENTS['search.shelf'].run(s, { by_person: true }); return seen[0]; };
  it('passes the resolved author array', async () => {
    const f = await run({ author_lookup: async () => ({ authors: [{ author: 'Augustine of Hippo' }, { author: 'Saint Augustine' }] }) });
    expect(f.author).toEqual(['Augustine of Hippo', 'Saint Augustine']);
  });
  it('falls back to the raw name when none resolve or the lookup fails', async () => {
    expect((await run({ author_lookup: async () => ({ authors: [] }) })).author).toBe('Augustine');
    expect((await run({ author_lookup: async () => { throw new Error('down'); } })).author).toBe('Augustine');
  });
});
