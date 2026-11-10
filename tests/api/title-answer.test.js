// A bare book title → the book at once: link first, summary (cached, written once), offer; no Jev (Chad 11-09).
import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.ANIS_WORK_SUMMARIES = join(tmpdir(), `work-summaries-${process.pid}.json`);
import { titleOnly, titleAnswer, workSummary } from '../../api/lib/assistant/title-answer.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';

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
  it('streams the link first, then the summary, then the offer', async () => {
    const ev = [];
    const r = await titleAnswer(GPB, { onEvent: (e) => ev.push(e), links: async () => new Map([[21310, 'https://oceanlibrary.com/god-passes-by_shoghi-effendi']]), summary: async () => 'A history of the first century.' });
    const texts = ev.filter((e) => e.type === 'text').map((e) => e.content);
    expect(texts[0]).toContain('[*God Passes By*](https://oceanlibrary.com/god-passes-by_shoghi-effendi)');
    expect(texts[1]).toContain('A history of the first century.');
    expect(r.reply).toContain('read it with you');
    expect(r.citations[0].document_id).toBe(21310);
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
});
