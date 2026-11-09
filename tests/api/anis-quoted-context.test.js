// Quotation as CONTEXT of a question (w8:db-27, 11-04): "In the Dawn-Breakers the Báb tells the Letters of the Living: "O My
// beloved friends! …" Please explain this farewell address" was routed to the source template (869 chars, no explanation) and
// named a provisional translation, not the book the reader named. Covers: Jev's kind/strategy descriptions (class wording, no
// keyword rule), the hunt as evidence under a strategy, the named work as origin, provisional translations ranked last.
import { describe, it, expect } from 'vitest';
import { KINDS, LOOKUP_Q } from '../../api/lib/assistant/triage.js';
import { STRATEGIES } from '../../api/lib/assistant/strategy-choice.js';
import { rankOrigins, isProvisional } from '../../api/lib/source-hunt.js';
import { preferOwnWork } from '../../api/lib/assistant/own-source.js';
import { toPassage } from '../../api/lib/assistant/tools.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';

const BAB = 'The Báb', B = "Baha'i";
const WORDS = 'O My beloved friends! You are the bearers of the name of God in this Day. You have been chosen as the repositories of His mystery.';
const PROVISIONAL = { id: 1, title: 'Farewell address to the Letters of the Living (provisional translation)', book_author: BAB, writer: BAB, ownWork: true,
  collection: 'Tablet Translations', religion: B, source_site: 'phelps', url: 'https://portlandiator.github.io/PI_browser/?id=BBU0001', overlap: 1, holds: true };
const DAWN = { id: 2, title: 'The Dawn-Breakers', book_author: 'Nabil Zarandi', writer: BAB, ownWork: false, collection: '', religion: B,
  source_site: 'oceanlibrary.com', translator: 'Shoghi Effendi', overlap: 1, holds: true };
const COMMENTARY = { id: 3, title: 'Dawn Over Mount Hira', book_author: 'Marzieh Gail', writer: BAB, ownWork: false, collection: "Baha'i Books", religion: B, overlap: 1, holds: true };

describe('what Jev is told: a quotation followed by a question about it is research, not a source lookup', () => {
  it('source_lookup is only "where is it from" (or a bare quotation); asking what a passage means is not in it', () => {
    expect(KINDS.source_lookup).toMatch(/only where it comes from/);
    expect(KINDS.source_lookup).not.toMatch(/what a pasted passage means/);
    expect(KINDS.source_lookup).toMatch(/any other question about it .* is research/);
  });
  it('research names the class: a question about a quoted passage, even one naming its book', () => {
    expect(KINDS.research).toMatch(/question ABOUT a passage the person quotes/);
    expect(KINDS.research).toMatch(/even when it names the book/);
    expect(LOOKUP_Q).toMatch(/passage quoted as the context of a question/);
  });
  it('the understanding strategy takes a quoted passage to explain; other keeps only a quote to locate', () => {
    expect(STRATEGIES.understanding).toMatch(/passage the person quotes and asks to have explained/);
    expect(STRATEGIES.quote_trace).toMatch(/quotation, or a few words of one, and wants to know where it comes from/);
    expect(STRATEGIES.unmatched).toBe('none of these');
  });
});

describe('source attribution: a provisional translation loses to a published holder of standing', () => {
  it('isProvisional: the marked title, the Phelps site; a published book is not', () => {
    expect(isProvisional(PROVISIONAL)).toBe(true);
    expect(isProvisional({ title: 'Some tablet', url: 'https://portlandiator.github.io/PI_browser/?id=X' })).toBe(true);
    expect(isProvisional({ source_title: 'Tablet to X (provisional translation)' })).toBe(true);
    expect(isProvisional(DAWN)).toBe(false);
  });
  it('The Dawn-Breakers (the Báb\'s words in Shoghi Effendi\'s translation) outranks the provisional own-work translation', () => {
    expect(rankOrigins([PROVISIONAL, DAWN, COMMENTARY], BAB).map((c) => c.id)).toEqual([2, 1, 3]);
  });
  it('a commentary of no standing does not jump the provisional translation', () => {
    expect(rankOrigins([COMMENTARY, PROVISIONAL], BAB)[0].id).toBe(1);
  });
  it('a pool with no provisional translation keeps its order (own work first)', () => {
    const own = { ...PROVISIONAL, title: 'Selections from the Writings of the Báb', source_site: 'oceanlibrary.com', url: 'https://oceanlibrary.com/x' };
    expect(rankOrigins([DAWN, own], BAB)[0].title).toBe('Selections from the Writings of the Báb');
  });
});

describe('own source: a published passage is never traded for a provisional translation', () => {
  const quoting = toPassage({ id: 309, document_id: 21308, paragraph_index: 309, title: 'The Dawn-Breakers', author: BAB, book_author: 'Nabil Zarandi',
    religion: B, source_site: 'oceanlibrary.com', blocktype: 'paragraph', source_url: 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_309', text: `“${WORDS}”` });
  const prov = { id: 33076360, document_id: 957201, doc_id: 957201, paragraph_index: 0, title: PROVISIONAL.title, author: BAB, book_author: BAB,
    religion: B, source_site: 'phelps', source_url: PROVISIONAL.url, blocktype: 'paragraph', text: WORDS };
  it('the provisional "own work" holding the span verbatim is not a swap target', async () => {
    const r = await preferOwnWork([quoting], { search: async () => [prov], shape: toPassage });
    expect(r.passages.map((p) => p.id)).toEqual([309]);
    expect(r.swapped).toEqual([]);
  });
});

describe('respond: under a strategy Jev chose, the hunt is evidence; the named work is preferred', () => {
  const Q = `In the Dawn-Breakers the Báb tells the Letters of the Living: "${WORDS}" Please explain this farewell address — what did He ask of them?`;
  const origin = { religion: B, title: 'The Dawn-Breakers', author: BAB, text: WORDS, url: 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_309' };
  const deps = (calls) => ({
    search: async () => { calls.search++; return { passages: [{ text: 'They were to arise and teach.', title: 'God Passes By', source_url: 'https://oceanlibrary.com/gpb/?paraId=p1', document_id: 5 }], _plan: { shape: 'fact' } }; },
    craft: async (x) => { calls.quotes = x?.retrieved_quotes; return 'ok'; }, companion: async () => ({}), phrases: async () => null, upgradeLinks: async (x) => x,
    plan: async () => ({ shape: 'fact', drawFrom: { name: 'the Dawn-Breakers', confidence: 0.9 } }),
    sourceHunt: async (q, _d, opts) => { calls.hunt++; calls.opts = opts; return { origin, citedBy: [] }; } });
  it('a non-lookup strategy Jev chose no longer hunts (the hunt is quote_trace\'s, not Unmatched\'s); the ordinary pipeline answers', async () => {
    const calls = { search: 0, hunt: 0 };
    const r = await anisRespond({ messages: [{ role: 'user', content: Q }], deps: deps(calls),
      direction: { kind: 'source_lookup', strategy: { strategy: { choice: 'understanding', confidence: 0.9 }, sides: [] } } });
    expect(calls.hunt).toBe(0);
    expect(r.format?.id).not.toBe('source');
    expect(r.plan?.shape).not.toBe('source');
  });
  it('the book the reader named reaches the hunt as a preference that accepts it, and not the provisional translation', async () => {
    const calls = { search: 0, hunt: 0 };
    await anisRespond({ messages: [{ role: 'user', content: Q }], deps: deps(calls), direction: { kind: 'source_lookup', strategy: { strategy: { choice: 'quote_trace', confidence: 0.9 }, sides: [] } } });
    expect(typeof calls.opts?.prefer).toBe('function');
    expect(calls.opts.prefer(DAWN)).toBe(true);
    expect(calls.opts.prefer(PROVISIONAL)).toBe(false);
  });
});
