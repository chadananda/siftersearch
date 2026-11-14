// A bare book title → the book at once: link first, summary (cached, written once), a follow-up question; no Jev (Chad 11-09).
import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.ANIS_WORK_SUMMARIES = join(tmpdir(), `work-summaries-${process.pid}.json`);
import { titleOnly, titleAnswer, sectionAnswer, cardFields, editionOf, workSummary, namedWork } from '../../api/lib/assistant/title-answer.js';
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
    const r = await titleAnswer(GPB, { onEvent: (e) => ev.push(e), links: async () => new Map([[21310, 'https://oceanlibrary.com/god-passes-by_shoghi-effendi']]), summary: async () => 'A history of the first century.', card: async (d) => d });
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
    expect(ev[0].book.cover_url).toBe('https://anis.oceanlibrary.com/img/covers/21310?v=3aebc7aba314');
  });
  it('a thin row from the book fast path (no cover field) gets its cover by one read — 11-11 Dhammapada card had none', async () => {
    const thin = { id: 20925, title: 'The Dhammapada', author: 'Siddhartha Buddha', paragraph_count: 450 };
    const read = vi.fn(async () => ({ id: 20925, cover_url: '/img/covers/20925?v=01cb4171cd2d', year: null, encumbered: 0 }));
    const ev = [];
    await titleAnswer({ doc: thin, others: [] }, { onEvent: (e) => ev.push(e), links: async () => new Map(), summary: async () => 'Verses.', card: (d) => cardFields(d, { read }) });
    expect(read).toHaveBeenCalledWith(20925);
    expect(ev[0].book.cover_url).toBe('https://anis.oceanlibrary.com/img/covers/20925?v=01cb4171cd2d');
    const sev = [];
    await sectionAnswer({ sec: { doc_id: 20925, book: 'The Dhammapada', author: 'Siddhartha Buddha', title: 'The Twin Verses', start_index: 0, end_index: 20 } },
      { onEvent: (e) => sev.push(e), link: async () => 'https://x/y', card: (d) => cardFields(d, { read }) });
    expect(sev[0].book.cover_url).toBe('https://anis.oceanlibrary.com/img/covers/20925?v=01cb4171cd2d');
  });
  it('cardFields reads nothing when the row already carries its cover and edition fields (even null), and keeps the row on a failed read', async () => {
    const read = vi.fn(async () => { throw new Error('db'); });
    const has = { id: 1, title: 'T', cover_url: null, translators: null };
    expect(await cardFields(has, { read })).toBe(has);
    expect(read).not.toHaveBeenCalled();
    const thin = { id: 2, title: 'U' };
    expect(await cardFields(thin, { read })).toBe(thin);
  });
  it('editionOf: the copy\'s translators, publisher and year from its catalogue row; nothing recorded → null', () => {
    expect(editionOf({ translators: JSON.stringify([{ name: 'Shoghi Effendi', basis: 'catalogue' }]), publisher: "Bahá'í Publishing Trust", pub_year: 1974 }))
      .toEqual({ translators: ['Shoghi Effendi'], publisher: "Bahá'í Publishing Trust", year: 1974, edition: null });
    expect(editionOf({ translators: '[]' })).toBe(null);
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
      bookPick: async ({ names }) => { calls.named.push(...names); return named ? { kind: 'work', work: named } : null; }, titleAnswer: async (w) => ({ reply: `CARD ${w.doc.id}`, citations: [] }),
      respond: async () => { calls.respond++; return { reply: 'researched', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    return { calls, run: () => anisTurn({ messages: [{ role: 'user', content: 'Gleanings' }], participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps }) };
  };
  it('Jev\'s book strategy with only a named work → the card answer, no research', async () => {
    const h = jevTurn({ strategy: { choice: 'book', confidence: 0.9 }, sides: [], sources: {}, decisions: [], units: { named_work: 'Gleanings' } }, GPB);
    const r = await h.run();
    expect(r.reply).toBe('CARD 21310'); expect(h.calls.named).toEqual(['Gleanings']); expect(h.calls.respond).toBe(0);
  });
  it('no copy found, or another strategy → the research runs as before; a topic beside the work does not block the card (11-10)', async () => {
    expect((await jevTurn({ strategy: { choice: 'book', confidence: 0.9 }, sides: [], sources: {}, decisions: [], units: { named_work: 'Gleanings' } }, null).run()).reply).toBe('researched');
    expect((await jevTurn({ strategy: { choice: 'understanding', confidence: 0.9 }, sides: [], sources: {}, decisions: [], units: { named_work: 'Gleanings' } }, GPB).run()).reply).toBe('researched');
    expect((await jevTurn({ strategy: { choice: 'book', confidence: 0.9 }, sides: [], sources: {}, decisions: [], units: { named_work: 'Gleanings', topic: 'do you have it' } }, GPB).run()).reply).toBe('CARD 21310');
  });
  it('namedWork: only a real book (20+ paragraphs)', async () => {
    expect((await namedWork('Gleanings', { find: async () => GPB })).doc).toBe(GPB.doc);
    expect(await namedWork('X', { find: async () => ({ doc: { id: 1, paragraph_count: 3 } }) })).toBeNull();
    const g = { doc: { id: 2, title: 'Gleanings from the Writings of Bahá’u’lláh', paragraph_count: 900 },
      others: [{ id: 3, title: 'Gleanings from the Writings of Bahá’u’lláh — original (CTAI paragraphing)' }, { id: 4, title: 'Gleanings among the Sheaves' }] };
    expect((await namedWork('Gleanings', { find: async () => g })).others.map((o) => o.id)).toEqual([3]);
  });
});
