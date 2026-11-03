// Writing-step variants (internal A/B via /api/v1/anis/draft): evidence, plan and format run ONCE; the writer runs once per
// variant on the same evidence. format 'none' drops a chosen template; writer swaps the model (research path too).
import { describe, it, expect } from 'vitest';
import { anisRespond, variantList, variantFormat } from '../../api/lib/assistant/respond.js';

const passages = [
  { text: 'The earth is but one country, and mankind its citizens.', title: 'Gleanings', author: 'Bahá’u’lláh', religion: "Baha'i", document_id: 8312, paragraph_index: 117, source_url: 'https://x/g#117' },
];
function deps(over = {}) {
  const calls = { search: [], craft: [], format: [] };
  return {
    calls,
    search: async (args) => { calls.search.push(args); return { passages, _plan: { shape: 'topic' } }; },
    chooseFormat: async (a) => { calls.format.push(a); return { id: 'range_of_voices', by: 'jev', how: 'TEMPLATE: several voices, each quoted.' }; },
    craft: async (args) => { calls.craft.push(args); args.onChunk(`${args.llm.model} says `); args.onUsage?.({ promptTokens: 1000, completionTokens: 100 }); return `${args.llm.model}: the earth is ["but one country"](https://x/g#117).`; },
    companion: async () => ({ append: '', plan: null, offer: false }),
    ...over,
  };
}
const q = [{ role: 'user', content: 'what did Bahá’u’lláh say about the earth being one country' }];

describe('anisRespond variants', () => {
  it('retrieves and chooses the format ONCE, then writes once per variant; format none passes no template', async () => {
    const d = deps();
    const r = await anisRespond({ messages: q, deps: d, llm: { provider: 'gemini', model: 'flash' },
      variants: [{ id: 'tmpl', format: 'auto' }, { id: 'none', format: 'none' }] });
    expect(d.calls.search).toHaveLength(1);
    expect(d.calls.format).toHaveLength(1);
    expect(d.calls.craft).toHaveLength(2);
    const [tmpl, none] = d.calls.craft;
    expect(tmpl.direction.format.how).toMatch(/TEMPLATE/);
    expect(none.direction.format).toMatchObject({ id: 'none', how: null, template: 'range_of_voices' });
    expect(tmpl.retrieved_quotes).toBe(none.retrieved_quotes);   // identical evidence
    expect(r.variants.map((v) => v.id)).toEqual(['tmpl', 'none']);
    expect(r.variants[1]).toMatchObject({ format_id: 'none', template: 'range_of_voices', format_stripped: true, links: 1 });
    expect(r.variants[0].words).toBeGreaterThan(3);
    expect(r.reply).toBe(r.variants[0].reply);   // the normal reply = the first variant
  });

  it('each writer variant gets its own model; on the research path the brief (a recipe, not a template) is kept', async () => {
    const d = deps({ research: async () => ({ passages, brief: 'P1 says the earth is one country.', steps: [], ms: 5 }) });
    const r = await anisRespond({ messages: q, deps: d, direction: { research: true },
      variants: [{ id: 'sonnet', writer: 'anthropic:big-model' }, { id: 'light', writer: 'gemini:small-model', format: 'none' }] });
    expect(d.calls.search).toHaveLength(0);   // the researcher's passages, once
    expect(d.calls.craft.map((c) => c.llm.model)).toEqual(['big-model', 'small-model']);
    expect(d.calls.craft[1].llm.caller).toBe('anis-craft-variant');
    for (const c of d.calls.craft) expect(c.direction.format).toMatchObject({ id: 'research' });
    expect(r.variants.map((v) => v.writer)).toEqual(['anthropic:big-model', 'gemini:small-model']);
    expect(r.variants[1].format_stripped).toBe(false);
  });

  it('only the first variant streams; without variants the result has none', async () => {
    const ev = [];
    await anisRespond({ messages: q, deps: deps(), onEvent: (e) => e.type === 'text' && ev.push(e.content),
      variants: [{ id: 'a', writer: 'anthropic:m-a' }, { id: 'b', writer: 'anthropic:m-b' }] });
    expect(ev.join('')).toMatch(/m-a/);
    expect(ev.join('')).not.toMatch(/m-b/);
    const plain = await anisRespond({ messages: q, deps: deps() });
    expect(plain.variants).toBeUndefined();
  });

  it('variantList caps at 4, de-duplicates ids and ignores a writer without a provider; variantFormat keeps recipes', () => {
    const v = variantList([{ id: 'x' }, { id: 'x', writer: 'nomodel' }, {}, {}, {}]);
    expect(v).toHaveLength(4);
    expect(v.map((x) => x.id)).toEqual(['x', 'x-2', 'v3', 'v4']);
    expect(v[1].writer).toBeNull();
    expect(variantList(null)).toEqual([null]);
    const recipe = { id: 'source', by: 'sourcehunt', how: 'hunt' };
    expect(variantFormat(recipe, 'none')).toBe(recipe);
    expect(variantFormat({ id: 'direct_answer', by: 'code', how: 'T\nASK' }, 'none', 'ASK')).toMatchObject({ id: 'none', how: 'ASK' });
  });
});
