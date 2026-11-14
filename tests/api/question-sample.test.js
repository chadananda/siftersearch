// sampleQuestions: random legacy STATED questions per fault for hand scoring. Fake windows (no DB): one question per window, fault filter, dropped slots, n cap.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/db.js', () => ({ queryAll: vi.fn(async () => []), queryOne: vi.fn(async () => null), query: vi.fn(), transaction: vi.fn() }));
const { sampleQuestions } = await import('../../api/lib/implied/service.js');

const row = (id, qs, title = 'Book') => ({ id, doc_id: Math.floor(id / 100), paragraph_index: id % 100, text: `para ${id}`, hyp_questions: JSON.stringify(qs), d_title: title, d_slug: 'b', d_religion: "Baha'i", d_collection: 'C' });
// every window = 50 neighbouring paragraphs, each with a yes/no and an open question, plus a dropped slot
const window = async (from) => Array.from({ length: 50 }, (_, i) => row(from + i, [{ q: '', dropped: 'selfReference' }, 'Is God forgiving?', 'How is wealth shared?']));
const fault = (q) => (/^is\b/i.test(q) ? 'yesNo' : null);
let seed = 1; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const deps = { window, fault, rand, maxId: async () => 1_000_000 };

describe('sampleQuestions', () => {
  it('takes one question per window, so a sample is not one run of neighbouring paragraphs', async () => {
    const calls = []; const w = async (from, n) => { calls.push(from); return window(from, n); };
    const { items } = await sampleQuestions({ fault: 'any', n: 10, skipScored: false }, { ...deps, window: w });
    expect(items).toHaveLength(10);
    expect(calls).toHaveLength(10);
    const near = items.filter((a) => items.some((b) => b !== a && Math.abs(a.paraId - b.paraId) < 50));
    expect(near.length).toBeLessThan(3);
  });
  it('keeps only the asked fault and never a dropped slot; k is the slot position', async () => {
    const { items } = await sampleQuestions({ fault: 'yesNo', n: 5, skipScored: false }, deps);
    expect(items.every((i) => i.question === 'Is God forgiving?' && i.k === 1 && i.fault === 'yesNo')).toBe(true);
    const any = await sampleQuestions({ fault: 'any', n: 30, skipScored: false }, deps);
    expect(any.items.every((i) => i.question && i.k > 0)).toBe(true);
  });
  it('rejects an unknown fault and caps n at 200', async () => {
    await expect(sampleQuestions({ fault: 'nonsense' }, deps)).rejects.toMatchObject({ statusCode: 400 });
    const { items } = await sampleQuestions({ fault: 'any', n: 999, skipScored: false }, deps);
    expect(items.length).toBe(200);
  });
});
