// addWanted: dedup by open title, create + queue research, title required.
import { describe, it, expect, vi } from 'vitest';
import { addWanted } from '../../api/lib/dewey/wanted.js';

describe('addWanted', () => {
  it('returns the open item with the same title instead of a duplicate', async () => {
    const repo = { findOpenByTitle: vi.fn(async () => ({ id: 7 })), createItem: vi.fn() }, enqueue = vi.fn();
    expect(await addWanted({ title: 'Qamus' }, 'chad', { repo, enqueue })).toEqual({ item: { id: 7 }, existing: true });
    expect(repo.createItem).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled();
  });
  it('creates a wanted item and queues research only', async () => {
    const repo = { findOpenByTitle: vi.fn(async () => null), createItem: vi.fn(async (a) => ({ id: 9, ...a })) }, enqueue = vi.fn();
    const r = await addWanted({ title: 'Qamus', author: 'Ishraq-Khavari', kind: 'book' }, 'internal', { repo, enqueue });
    expect(r.item).toMatchObject({ id: 9, title: 'Qamus', author: 'Ishraq-Khavari', kind: 'book', by: 'internal' });
    expect(enqueue).toHaveBeenCalledWith('dewey-research', { id: 9 }, 'internal');
  });
  it('needs a title', async () => {
    await expect(addWanted({}, 'x', { repo: {}, enqueue: vi.fn() })).rejects.toMatchObject({ statusCode: 400 });
  });
});
