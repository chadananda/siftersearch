// Anís widget sharing helpers (P3): the conversation's turns to share (reply-actions.js shareTurns), a shared discussion back into
// a thread (fromShared), share records on the thread index (threads.js addShare / dropShares).
import { describe, it, expect } from 'vitest';
import { shareTurns, fromShared } from '../../src/widget/reply-actions.js';
import { addShare, dropShares } from '../../src/widget/threads.js';

describe('shareTurns', () => {
  it('from the first question on; answers as clean markdown; unfinished replies left out', () => {
    const ms = [{ role: 'assistant', content: 'Hello!' }, { role: 'user', content: 'What is prayer?' },
      { role: 'assistant', content: 'Communion.\n\n<!-- widget:w1 -->\n{{quote P1}}', done: true }, { role: 'user', content: 'More?' }, { role: 'assistant', content: '', pending: true }];
    expect(shareTurns(ms)).toEqual([{ role: 'user', content: 'What is prayer?' }, { role: 'assistant', content: 'Communion.' }, { role: 'user', content: 'More?' }]);
  });
  it('null when nothing has been answered', () => {
    expect(shareTurns([{ role: 'assistant', content: 'Hello!' }])).toBeNull();
    expect(shareTurns([{ role: 'user', content: 'q' }])).toBeNull();
    expect(shareTurns(null)).toBeNull();
  });
});

describe('fromShared', () => {
  it('turns → finished messages, answers marked with the slug; junk dropped', () => {
    expect(fromShared({ slug: 'a-b', turns: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }, { role: 'system', content: 'x' }, { role: 'user' }] }))
      .toEqual([{ role: 'user', content: 'q', done: true }, { role: 'assistant', content: 'a', done: true, shared: 'a-b' }]);
    expect(fromShared(null)).toEqual([]);
  });
});

describe('share records', () => {
  const idx = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
  it('addShare keeps one record per slug on the right thread; dropShares forgets them', () => {
    let i = addShare(idx, 't1', { slug: 's-1', url: 'u', key: 'k' });
    i = addShare(i, 't1', { slug: 's-1', url: 'u2', key: 'k2' });
    i = addShare(i, 't1', { slug: 's-2', url: 'v', key: 'k3' });
    expect(i[0].shares.map((x) => x.url)).toEqual(['u2', 'v']);
    expect(i[1].shares).toBeUndefined();
    expect(addShare(idx, 'nope', { slug: 's' })).toEqual(idx);
    expect(dropShares(i, 't1')[0]).toEqual({ id: 't1', title: 'A' });
  });
});
