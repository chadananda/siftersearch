// A bare book title → the book at once: link first, summary (cached, written once), a follow-up question; no Jev (Chad 11-09).
import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.ANIS_WORK_SUMMARIES = join(tmpdir(), `work-summaries-${process.pid}.json`);
import { titleOnly, titleAnswer, workSummary, namedWork } from '../../api/lib/assistant/title-answer.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { emptyState } from '../../api/lib/assistant/units.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const GPB = { doc: { id: 21310, title: 'God Passes By', author: 'Shoghi Effendi', religion: "Baha'i", paragraph_count: 900 }, others: [] };

describe('title-answer', () => {
  it('only a bare title reaches the title index, and only core works', async () => {
    const find = vi.fn(async () => GPB);
    expect(await titleOnly('“God Passes By”', { find })).toBe(GPB);
    expect(find).toHaveBeenCalledWith('“God Passes By”', { coreOnly: true });
    find.mockClear();
    expect(await titleOnly('What does God Passes By say about the martyrdom of the Báb?', { find })).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });
  it('summary first, then the book (a card event + the linked line), then the follow-up question', async () => {
    const ev = [];
    const r = await titleAnswer(GPB, { onEvent: (e) => ev.push(e), links: async () => new Map([[21310, 'https://oceanlibrary.com/god-passes-by_shoghi-effendi']]), summary: async () => 'A history of the first century.' });
    expect(ev[0]).toMatchObject({ type: 'book', book: { id: 21310, title: 'God Passes By', url: 'https://oceanlibrary.com/god-passes-by_shoghi-effendi' } });
    expect(r.reply.indexOf('A history of the first century.')).toBe(0);
    expect(r.reply).toContain('[*God Passes By*](https://oceanlibrary.com/god-passes-by_shoghi-effendi)');
    expect(r.reply).toMatch(/something particular I can help you find in the book, or would you like to discuss it\?$/);
    expect(ev[0].book.follow_up).toMatch(/discuss it\?$/);
    expect(r.citations[0].document_id).toBe(21310);
  });
  it('the document\'s own description is the summary — no model call', async () => {
    const complete = vi.fn();
    expect(await workSummary({ id: 1, title: 'X', description: 'Its own summary.' }, { complete })).toBe('Its own summary.');
    expect(complete).not.toHaveBeenCalled();
  });
  it('the card cover is absolute on the site (the image service), never relative to the api host a widget calls', async () => {
    const ev = [];
    const doc = { ...GPB.doc, cover_url: '/img/covers/21310?v=3aebc7aba314' };
    await titleAnswer({ doc, others: [] }, { onEvent: (e) => ev.push(e), links: async () => new Map(), summary: async () => null });
    expect(ev[0].book.cover_url).toBe('https://siftersearch.com/img/covers/21310?v=3aebc7aba314');
  });
  it('the summary is written once per book, then served from the cache', async () => {
    const doc = { id: 990000001 + Math.floor(Math.random() * 1e6), title: 'T', author: 'A' };
    const complete = vi.fn(async () => ({ content: 'Short summary.' }));
    const read = async () => [{ text: 'Opening words.' }];
    expect(await workSummary(doc, { read, complete })).toBe('Short summary.');
    expect(await workSummary(doc, { read, complete })).toBe('Short summary.');
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('the turn answers a bare title without triage or strategy', async () => {
    const triage = vi.fn(), strategy = vi.fn(), events = [];
    const r = await anisTurn({ messages: [{ role: 'user', content: '“God Passes By”' }], onEvent: (e) => events.push(e),
      deps: { titleOnly: async () => GPB, titleAnswer: async (w, { onEvent }) => { onEvent({ type: 'text', content: 'LINK' }); return { reply: 'LINK', citations: [] }; },
        triage, strategy, open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, strikes: { inTarpit: () => false } } });
    expect(r.reply).toBe('LINK'); expect(r.plan.work).toBe(21310);
    expect(triage).not.toHaveBeenCalled(); expect(strategy).not.toHaveBeenCalled();
  });
  const jevTurn = (strat, named) => {
    const calls = { respond: 0, named: [] }, tri = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 },
      outcome: { choice: 'search', confidence: 0.9 }, features: { first: true, turn: 0, words: 1, short: true } };
    const deps = { titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} },
      namedWork: async (n) => { calls.named.push(n); return named; }, titleAnswer: async (w) => ({ reply: `CARD ${w.doc.id}`, citations: [] }),
      respond: async () => { calls.respond++; return { reply: 'researched', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    return { calls, run: () => anisTurn({ messages: [{ role: 'user', content: 'Gleanings' }], participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps }) };
  };
  it('Jev\'s book strategy with only a named work → the card answer, no research', async () => {
    const h = jevTurn({ strategy: { choice: 'book', confidence: 0.9 }, sides: [], sources: {}, decisions: [], units: { named_work: 'Gleanings' } }, GPB);
    const r = await h.run();
    expect(r.reply).toBe('CARD 21310'); expect(h.calls.named).toEqual(['Gleanings']); expect(h.calls.respond).toBe(0);
  });
  it('a named person or topic beside the work, or no copy found → the strategy runs as before', async () => {
    for (const [units, named] of [[{ named_work: 'Gleanings', topic: 'justice' }, GPB], [{ named_work: 'Gleanings' }, null]]) {
      const h = jevTurn({ strategy: { choice: 'book', confidence: 0.9 }, sides: [], sources: {}, decisions: [], units }, named);
      expect((await h.run()).reply).toBe('researched');
    }
  });
  it('namedWork: only a real book (20+ paragraphs)', async () => {
    expect((await namedWork('Gleanings', { find: async () => GPB })).doc).toBe(GPB.doc);
    expect(await namedWork('X', { find: async () => ({ doc: { id: 1, paragraph_count: 3 } }) })).toBeNull();
    const g = { doc: { id: 2, title: 'Gleanings from the Writings of Bahá’u’lláh', paragraph_count: 900 },
      others: [{ id: 3, title: 'Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing)' }, { id: 4, title: 'Gleanings among the Sheaves' }] };
    expect((await namedWork('Gleanings', { find: async () => g })).others.map((o) => o.id)).toEqual([3]);
  });
});
