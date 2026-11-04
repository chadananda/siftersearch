// Passage text cuts (11-04): executeSearch cuts at a sentence and marks it for external callers; Anís gets the whole
// paragraph; the agent's tool output shares its 12,000-character budget so every passage arrives.
import { describe, it, expect, vi } from 'vitest';

const LONG = 'The first sentence of the footnote runs on for a while. '.repeat(12)
  + 'The Ten Year Crusade ended in 1963 with the first election of the Universal House of Justice on 21 April.';
vi.mock('../../api/lib/search.js', async (importOriginal) => ({
  ...(await importOriginal()),
  multiIndexSearch: vi.fn(async () => ({ hits: [{ id: 1, doc_id: 1, paragraph_index: 0, text: LONG, title: 'T' }] })),
  hybridSearch: vi.fn(async () => ({ hits: [] })),
  keywordSearch: vi.fn(async () => ({ hits: [] })),
}));
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(async () => ({ rows: [] })), queryAll: vi.fn(async () => []), queryOne: vi.fn(async () => null) }));
vi.mock('../../api/lib/auth.js', () => ({ optionalAuthenticate: () => {} }));
vi.mock('../../api/lib/logger.js', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));

const { executeSearch, executeTool, SEARCH_TEXT_CHARS } = await import('../../api/routes/chat.js');
const { anisSearch } = await import('../../api/lib/assistant/respond.js');
const { toolRunner, fitLengths, TOOL_CHARS } = await import('../../api/lib/assistant/researcher.js');
const { headOf } = await import('../../api/lib/text/head-of.js');

describe('executeSearch text cut', () => {
  it('default: cut at a sentence end, marked " …", never mid-word', async () => {
    const t = (await executeSearch({ query: 'q', mode: 'passages' })).passages[0].text;
    expect(LONG.length).toBeGreaterThan(SEARCH_TEXT_CHARS);
    expect(t.length).toBeLessThanOrEqual(SEARCH_TEXT_CHARS + 2);
    expect(t).toMatch(/\. …$/);
    expect(LONG.startsWith(t.slice(0, -2))).toBe(true);
  });
  it('a model\'s or caller\'s textChars never widens the tool cut', async () => {
    const t = (await executeTool('search', { query: 'q', textChars: 99999 })).passages[0].text;
    expect(t.length).toBeLessThanOrEqual(SEARCH_TEXT_CHARS + 2);
  });
  it('Anís gets the full paragraph (the date past character 500 included)', async () => {
    const t = (await anisSearch(executeSearch)({ query: 'q', mode: 'passages' })).passages[0].text;
    expect(t).toBe(LONG);
    expect(t).toContain('21 April');
  });
  it('anisSearch passes textChars: Infinity and keeps the caller\'s args', async () => {
    const seen = [];
    await anisSearch(async (a) => seen.push(a))({ query: 'x', limit: 8 });
    expect(seen[0]).toEqual({ query: 'x', limit: 8, textChars: Infinity });
  });
});

describe('headOf', () => {
  it('falls back to a word break when no sentence ends late enough', () => {
    const t = headOf('word '.repeat(200), 100);
    expect(t).toMatch(/word …$/);
    expect(t.length).toBeLessThanOrEqual(102);
  });
});

describe('agent tool output: every passage fits the budget', () => {
  const para = (i) => ({ id: i, text: `${'Words of a long paragraph that keeps going. '.repeat(60)}End ${i}.`, document_id: i, paragraph_index: 0,
    title: `A rather long book title number ${i} with a subtitle that goes on and on for a while`, author: 'Some Author' });
  it('8 long passages (2,700+ chars each) all reach the model, each sentence-cut', () => {
    const { add, show } = toolRunner({});
    const out = show(Array.from({ length: 8 }, (_, i) => add(para(i + 1))));
    expect(out.length).toBeLessThanOrEqual(TOOL_CHARS);
    expect(out.match(/^\[P\d+\]/gm)).toHaveLength(8);
    for (const block of out.split('\n\n')) expect(block).toMatch(/\. …$/);
  });
  it('a translation (4,000) beside 7 long passages still leaves room for all 8', () => {
    const { add, show } = toolRunner({});
    const refs = [add({ ...para(1), translation: 'authorized — Shoghi Effendi' }), ...Array.from({ length: 7 }, (_, i) => add(para(i + 2)))];
    const out = show(refs);
    expect(out.length).toBeLessThanOrEqual(TOOL_CHARS);
    expect(out.match(/^\[P\d+\]/gm)).toHaveLength(8);
  });
  it('short passages are untouched', () => {
    const { add, show } = toolRunner({});
    const out = show([add({ id: 1, text: 'Short one.', title: 'T', author: 'A' }), add({ id: 2, text: 'Short two.', title: 'T', author: 'A' })]);
    expect(out).toBe('[P1] T — A\nShort one.\n\n[P2] T — A\nShort two.');
  });
  it('fitLengths: short items keep their length; long ones share the rest evenly', () => {
    expect(fitLengths([100, 200], 1000)).toEqual([100, 200]);
    expect(fitLengths([100, 1300, 1300], 1100)).toEqual([100, 500, 500]);
  });
});
