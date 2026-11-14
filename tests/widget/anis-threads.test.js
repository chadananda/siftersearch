// Anís thread store (src/widget/threads.js): titles, ordering, grouping by day, search, pruning, legacy migration.
import { describe, it, expect } from 'vitest';
import {
  threadTitle, upsertThread, removeThread, pruneThreads, groupThreads, filterThreads, messagesText, firstQuestion,
  openStore, loadIndex, saveIndex, loadMessages, saveMessages, dropThreadData, idxKey, threadKey, activeKey, legacyKey, newThreadId, isFirstVisit, markSeen, seenKey,
} from '../../src/widget/threads.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };

describe('threadTitle', () => {
  it('keeps a short question whole, one line', () => expect(threadTitle('  What is   the\nIqan? ')).toBe('What is the Iqan?'));
  it('cuts a long question at a word boundary with an ellipsis', () => {
    const t = threadTitle('What did ‘Abdu’l-Bahá say about the oneness of humanity in his talks in Paris and London in 1911?');
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith('…')).toBe(true);
    expect(t).toBe('What did ‘Abdu’l-Bahá say about the oneness of humanity in…');
  });
  it('cuts a single huge word hard', () => expect(threadTitle('x'.repeat(100)).length).toBe(60));
  it('empty → New conversation', () => expect(threadTitle('')).toBe('New conversation'));
});

describe('index ops', () => {
  it('upsert merges and sorts newest first', () => {
    let ix = upsertThread([], { id: 'a', title: 'A', updated: 1 });
    ix = upsertThread(ix, { id: 'b', title: 'B', updated: 2 });
    ix = upsertThread(ix, { id: 'a', updated: 3 });
    expect(ix.map((t) => t.id)).toEqual(['a', 'b']);
    expect(ix[0].title).toBe('A');
  });
  it('remove', () => expect(removeThread([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }]));
  it('prune drops the oldest unpinned', () => {
    const ix = [{ id: 'a', updated: 1, pinned: true }, { id: 'b', updated: 2 }, { id: 'c', updated: 3 }, { id: 'd', updated: 4 }];
    const r = pruneThreads(ix, 2);
    expect(r.dropped).toEqual(['b', 'c']);
    expect(r.index.map((t) => t.id)).toEqual(['d', 'a']);
    expect(pruneThreads(ix, 10).dropped).toEqual([]);
  });
});

describe('groupThreads', () => {
  const now = new Date(2026, 10, 13, 15, 0).getTime();
  const at = (d, h = 12) => new Date(2026, 10, d, h).getTime();
  it('groups by local day, pinned first, empty groups left out', () => {
    const g = groupThreads([
      { id: 't', updated: at(13, 1) }, { id: 'y', updated: at(12, 23) }, { id: 'w', updated: at(8) },
      { id: 'o', updated: at(1) }, { id: 'p', updated: at(1), pinned: true },
    ], now);
    expect(g.map((x) => [x.label, x.items.map((t) => t.id)])).toEqual([
      ['Pinned', ['p']], ['Today', ['t']], ['Yesterday', ['y']], ['Previous 7 days', ['w']], ['Older', ['o']],
    ]);
  });
  it('none → []', () => expect(groupThreads([], now)).toEqual([]));
});

describe('filterThreads', () => {
  const ix = [{ id: 'a', title: 'Justice in the Hidden Words' }, { id: 'b', title: 'Kitáb-i-Íqán' }];
  const text = { a: 'O Son of Spirit', b: 'the station of the Manifestation' };
  it('blank query → all', () => expect(filterThreads(ix, '  ', () => '')).toBe(ix));
  it('matches title, accent-insensitive', () => expect(filterThreads(ix, 'iqan').map((t) => t.id)).toEqual(['b']));
  it('matches message text; every word required', () => {
    expect(filterThreads(ix, 'manifestation', (id) => text[id]).map((t) => t.id)).toEqual(['b']);
    expect(filterThreads(ix, 'spirit justice', (id) => text[id]).map((t) => t.id)).toEqual(['a']);
    expect(filterThreads(ix, 'spirit iqan', (id) => text[id])).toEqual([]);
  });
  it('messagesText / firstQuestion', () => {
    const ms = [{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'q1' }, { role: 'user', content: 'q2' }];
    expect(messagesText(ms)).toBe('hi\nq1\nq2');
    expect(firstQuestion(ms)).toBe('q1');
  });
});

describe('storage', () => {
  it('saveMessages keeps settled messages, last 40', () => {
    const s = mem();
    const ms = Array.from({ length: 45 }, (_, i) => ({ role: 'user', content: String(i) }));
    saveMessages(s, 'tok', 'x', [...ms, { role: 'assistant', content: '', pending: true }]);
    const back = loadMessages(s, 'tok', 'x');
    expect(back.length).toBe(40);
    expect(back[0].content).toBe('5');
    expect(back.some((m) => m.pending)).toBe(false);
    dropThreadData(s, 'tok', 'x');
    expect(loadMessages(s, 'tok', 'x')).toEqual([]);
  });
  it('index round-trips; junk reads as empty', () => {
    const s = mem({ [idxKey('tok')]: '{bad' });
    expect(loadIndex(s, 'tok')).toEqual([]);
    saveIndex(s, 'tok', [{ id: 'a', updated: 1 }, { id: 'b', updated: 2 }]);
    expect(loadIndex(s, 'tok').map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('migrates the old single transcript into thread #1 and removes the old key', () => {
    const legacy = [{ role: 'assistant', content: 'Welcome' }, { role: 'user', content: 'Who was Táhirih?' }, { role: 'assistant', content: 'A poet…' }];
    const s = mem({ [legacyKey('tok')]: JSON.stringify(legacy) });
    const { index, active } = openStore(s, 'tok', 1000);
    expect(index).toEqual([{ id: active, title: 'Who was Táhirih?', updated: 1000 }]);
    expect(loadMessages(s, 'tok', active)).toEqual(legacy);
    expect(s.getItem(legacyKey('tok'))).toBe(null);
    expect(s.getItem(activeKey('tok'))).toBe(active);
    expect(openStore(s, 'tok').index.length).toBe(1);   // idempotent
  });
  it('a greeting-only transcript is not migrated; a fresh id is given', () => {
    const s = mem({ [legacyKey('tok')]: JSON.stringify([{ role: 'assistant', content: 'Welcome' }]) });
    const { index, active } = openStore(s, 'tok');
    expect(index).toEqual([]);
    expect(active).toBeTruthy();
    expect(s.getItem(legacyKey('tok'))).toBe(null);
  });
  it('remembers the active thread, even one not yet in the index', () => {
    const s = mem({ [activeKey('tok')]: 'fresh', [idxKey('tok')]: JSON.stringify([{ id: 'a', updated: 1 }]) });
    expect(openStore(s, 'tok').active).toBe('fresh');
    expect(threadKey('tok', 'a')).toBe('anis-thread:tok:a');
  });
  it('newThreadId is unique and fits the edge limit (64)', () => {
    const a = newThreadId(), b = newThreadId();
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(64);
  });
});

describe('introduce once (isFirstVisit / markSeen)', () => {
  it('a fresh device is a first visit; after markSeen it is not', () => {
    const s = mem();
    expect(isFirstVisit(s, 't')).toBe(true);
    markSeen(s, 't');
    expect(s.getItem(seenKey('t'))).toBe('1');
    expect(isFirstVisit(s, 't')).toBe(false);
    expect(isFirstVisit(s, 'other')).toBe(true);   // per deployment token
  });
  it('a reader from before the flag (threads listed) is returning', () => {
    const s = mem({ [idxKey('t')]: JSON.stringify([{ id: 'a', title: 'A', updated: 1 }]) });
    expect(isFirstVisit(s, 't')).toBe(false);
  });
  it('storage that throws reads as a first visit; markSeen never throws', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
    expect(isFirstVisit(bad, 't')).toBe(true);
    expect(() => markSeen(bad, 't')).not.toThrow();
  });
});
