// Jev timeouts (11-10, conv_bdf9ee76 turn 1): "yes, can you search it for "private property"?" after the God Passes By card timed
// out in triage AND strategy → fail-open research essay. Now: one Haiku call answers the same typed options → in_work on the work in focus.
import { describe, it, expect, vi } from 'vitest';
import { anisTurn, focusWork, workPatch } from '../../api/lib/assistant/turn.js';
import { jevBackup, backupQuestions, readBackup } from '../../api/lib/assistant/jev-backup.js';
import { findInWorkAnswer, inWorkSearch } from '../../api/lib/assistant/find-in-work.js';
import { emptyState, applyPatch } from '../../api/lib/assistant/units.js';
import { LOOKUP_KINDS } from '../../api/lib/assistant/triage.js';
import { jevTimeoutStats, anisJevTimeoutsReport } from '../../api/lib/ops/anis-jev-timeouts.js';
import { REPORTS } from '../../api/lib/ops/reports.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const GPB = { id: 21310, title: 'God Passes By', author: 'Shoghi Effendi' };
const URL868 = 'https://oceanlibrary.com/link/QfGEx/god-passes-by_shoghi-effendi/';
const P868 = 'Its views on the institution of private property, on the relations between capital and labour, are set forth in its laws.';
const rows = [{ id: 9868, paragraph_index: 867, text: P868, heading: null, blocktype: 'paragraph' }];
const searchDeps = { getDoc: async (id) => (id === 21310 ? GPB : null), paragraphTexts: async (id) => (id === 21310 ? rows : []),
  paragraphsByIds: async (ids) => ids.map((id) => ({ ...rows.find((r) => r.id === id), doc_id: 21310, document_id: 21310, title: GPB.title, author: GPB.author })),
  withLinks: async (ps) => ps.map((p) => ({ ...p, url: URL868 })) };
const THREAD = [
  { role: 'user', content: 'God Passes By' },
  { role: 'assistant', content: '[*God Passes By*](https://oceanlibrary.com/x) by Shoghi Effendi … Is there something particular I can help you find in the book, or would you like to discuss it?' },
  { role: 'user', content: 'yes, can you search it for "private property"?' },
];
const stateAfterCard = applyPatch(emptyState(), workPatch({ turn: 0, strategy: 'book', id: 21310, title: 'God Passes By' }), { turn: 0 });
const timedOut = (call, ms) => ({ call, value: null, attempts: 2, timeouts: [{ attempt: 1, ms }, { attempt: 2, ms }], timeoutMs: ms, error: null, ms: 2 * ms });

const turn = ({ backup, state = stateAfterCard, triageOk = null } = {}) => {
  const calls = { respond: 0, find: [], backup: [], book: 0 }, closed = [];
  const d = { titleOnly: async () => null,
    triage: async (m, { onJev }) => { if (triageOk) return triageOk; onJev(timedOut('triage', 1500)); return null; },
    strategy: async (m, { onJev }) => { onJev(timedOut('strategy', 1000)); return null; },
    state: { load: async () => state, append: async () => {} },
    jevBackup: async (a) => { calls.backup.push(a); return backup; },
    bookPick: async () => { calls.book++; return null; },
    lookup: vi.fn(async () => null),
    findInWork: async (a) => { calls.find.push(a); return findInWorkAnswer({ ...a, search: (x) => inWorkSearch(x, { deps: searchDeps }) }); },
    respond: async () => { calls.respond++; return { reply: 'researched', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
    open: async () => ({ conversationId: 'c', round: 1 }), close: async (x) => { closed.push(x); }, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
  return { calls, closed, d, run: () => anisTurn({ messages: [...THREAD], participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps: d }) };
};
const HAIKU_IN_WORK = { tri: readBackup({ kind: { choice: 'research', confidence: 0.9 }, lookup: { choice: 'in_work', confidence: 0.92 }, outcome: { choice: 'search', confidence: 0.9 }, depth: { choice: 'answer', confidence: 0.9 } },
  { questions: backupQuestions({ triage: true, first: false }), messages: THREAD }).tri, strategy: null, ms: 900 };

describe('Jev timed out → Haiku decides the same typed options; "it" = the work in focus', () => {
  it('the live turn: both Jev calls time out → backup in_work → the code-built list on God Passes By, no research, no writer', async () => {
    const h = turn({ backup: HAIKU_IN_WORK });
    const r = await h.run();
    expect(h.calls.respond).toBe(0);
    expect(h.calls.book).toBe(0);   // the work in focus: no book finder
    expect(h.calls.backup[0]).toMatchObject({ triage: true, strategy: true, focus: { id: 21310, title: 'God Passes By' } });
    expect(r.reply).toMatch(/^> “…?.*\*\*private property\*\*.*”\n>\n> — Shoghi Effendi, \[\*God Passes By\*/);
    expect(r.reply).toContain(URL868);
    expect(r.reply).not.toMatch(/discuss|essay/i);
    const p = h.closed[0].path;
    expect(p).toMatchObject({ route: 'in_work', work: 21310, find: 'private property', mode: 'literal', via: 'focus', jev_fallback: { calls: ['triage', 'strategy'], by: 'haiku', lookup: 'in_work' } });
    expect(p.decisions.map((x) => x.point)).toEqual(expect.arrayContaining(['jev:timeout', 'jev:fallback', 'in-work:focus']));
  });
  it('the backup gives nothing → fail open to research, recorded as such', async () => {
    const h = turn({ backup: null });
    const r = await h.run();
    expect(r.reply).toBe('researched');
    expect(h.closed[0].path.jev_fallback).toMatchObject({ by: 'fail open' });
  });
  it('triage answered, strategy timed out → the backup is asked the strategy only', async () => {
    const tri = { ...HAIKU_IN_WORK.tri, by: undefined };
    const h = turn({ backup: HAIKU_IN_WORK, triageOk: tri });
    await h.run();
    expect(h.calls.backup[0]).toMatchObject({ triage: false, strategy: true });
  });
  it('no work in focus (an older thread), Jev refers back and names the work → in_work through the book finder, not research', async () => {
    const h = turn({ backup: null, state: emptyState(), triageOk: { ...HAIKU_IN_WORK.tri, by: undefined } });
    h.d.strategy = async () => ({ strategy: { choice: 'unmatched', confidence: 0.4 }, refersBack: true, units: { named_work: 'God Passes By' } });
    h.d.bookPick = async () => { h.calls.book++; return { kind: 'work', work: { doc: GPB } }; };
    const r = await h.run();
    expect(h.calls.respond).toBe(0);
    expect(r.reply).toMatch(/^> “…?.*\*\*private property\*\*.*”\n>\n> — Shoghi Effendi, \[\*God Passes By\*/);
  });
  it('in_work with no work in focus and none named → the book finder as before', async () => {
    const h = turn({ backup: HAIKU_IN_WORK, state: emptyState() });
    await h.run();
    expect(h.calls.book).toBe(1);
  });
});

describe('the pieces', () => {
  it('focusWork: only the previous turn, only a book / in_work turn that gave a title', () => {
    expect(focusWork(stateAfterCard)).toEqual({ id: 21310, title: 'God Passes By' });
    const later = applyPatch(stateAfterCard, { thread: [{ turn: 1, strategy: 'understanding', topic: 'grace' }] }, { turn: 1 });
    expect(focusWork(later)).toBeNull();
    expect(focusWork(emptyState())).toBeNull();
  });
  it('readBackup keeps only valid option keys; the strategy carries a named work', () => {
    const q = backupQuestions({ triage: true, strategies: { book: 'a book', unmatched: 'other' }, first: false });
    const out = readBackup({ kind: { choice: 'research', confidence: 2 }, lookup: { choice: 'nonsense', confidence: 0.9 }, strategy: { choice: 'book', confidence: 0.8 }, named_work: 'Gleanings' }, { questions: q, messages: THREAD });
    expect(out.tri.kind).toMatchObject({ choice: 'research', confidence: 1, by: 'haiku' });
    expect(out.tri.lookup).toBeNull();
    expect(out.strategy).toMatchObject({ strategy: { choice: 'book' }, units: { named_work: 'Gleanings' } });
  });
  it('jevBackup: one call with the thread, the focus and the same option texts Jev reads', async () => {
    const llm = vi.fn(async () => ({ text: '{"kind":{"choice":"research","confidence":0.9},"lookup":{"choice":"in_work","confidence":0.9}}' }));
    const r = await jevBackup({ messages: THREAD, focus: { id: 21310, title: 'God Passes By' }, triage: true, llm });
    expect(llm).toHaveBeenCalledTimes(1);
    const { user } = llm.mock.calls[0][0];
    expect(user).toContain('THE WORK IN FOCUS');
    expect(user).toContain(LOOKUP_KINDS.in_work);
    expect(r.tri.lookup.choice).toBe('in_work');
  });
  it('the in_work option says the work may be the one the conversation is on', () => {
    expect(LOOKUP_KINDS.in_work).toMatch(/search it for X/);
  });
});

describe('anis-jev-timeouts report', () => {
  const rows = [
    { day: '2026-11-10', timeouts: JSON.stringify([{ call: 'triage', outcome: 'fail open', ms: 3002 }, { call: 'strategy', outcome: 'fail open', ms: 2001 }]), fallback: JSON.stringify({ by: 'haiku' }) },
    { day: '2026-11-10', timeouts: JSON.stringify([{ call: 'strategy', outcome: 'answered on retry', ms: 1400 }]), fallback: null },
    { day: '2026-11-10', timeouts: null, fallback: null },
    { day: '2026-11-09', timeouts: null, fallback: null },
  ];
  it('per day: turns, timeout turns, rate, by call × outcome, backup use', () => {
    const s = jevTimeoutStats(rows);
    expect(s.days[0]).toMatchObject({ day: '2026-11-10', turns: 3, timeout_turns: 2, failed_open_turns: 1, rate_pct: 66.7, fail_open_pct: 33.3,
      by_call: { triage: { 'fail open': 1 }, strategy: { 'fail open': 1, 'answered on retry': 1 } }, fallback: { haiku: 1 } });
    expect(s.totals).toMatchObject({ turns: 4, timeout_turns: 2 });
  });
  it('is a registered ops report reading through the repo', async () => {
    expect(typeof REPORTS['anis-jev-timeouts']).toBe('function');
    const r = await anisJevTimeoutsReport({ days: 2 }, { rowsFn: async ({ days }) => (days === 2 ? rows : []) });
    expect(r).toMatchObject({ window_days: 2, totals: { turns: 4 } });
  });
});
