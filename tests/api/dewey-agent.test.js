// Dewey's chat turn: what was sent is checked BEFORE the model speaks; the model streams and may call tools.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/dewey/identify.js', () => ({
  identifyPhotos: vi.fn(async () => ({ title: 'The Chosen Highway', author: 'Lady Blomfield', from: 'photo' })),
  identifyUrl: vi.fn(), identifyFile: vi.fn(), identifyText: (t) => ({ printed_lines: [t], from: 'text' }),
}));
const items = [];
vi.mock('../../api/lib/repos/dewey-repo.js', () => ({
  createItem: vi.fn(async (o) => { const i = { id: items.length + 1, state: 'wanted', ...o }; items.push(i); return i; }),
  findOpenByTitle: vi.fn(async () => null), listItems: vi.fn(async () => items), getItem: vi.fn(), updateItem: vi.fn(),
}));
vi.mock('../../api/lib/repos/ops-report-repo.js', () => ({ enqueue: vi.fn(async () => ({})) }));
const { deweyTurn, summarize } = await import('../../api/lib/dewey/agent.js');

// a model stream: first round calls add_to_wanted, second round answers in two pieces
function fakeModel() {
  let round = 0;
  const seen = [];
  const create = async (role, params) => {
    seen.push(params.messages);
    const r = round++;
    return (async function* () {
      if (r === 0) {
        yield { choices: [{ delta: { content: 'Not in the library. ' } }] };
        yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'add_to_wanted', arguments: '{"title":"The Chosen' } }] } }] };
        yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ' Highway","author":"Lady Blomfield"}' } }] } }] };
      } else {
        yield { choices: [{ delta: { content: 'Added to the wanted list' } }] };
        yield { choices: [{ delta: { content: ' — send a PDF to start.' } }] };
      }
    })();
  };
  return { create, seen };
}

describe('dewey chat turn', () => {
  it('a photo is checked at once, then the reply streams and a tool puts the work on the wanted list', async () => {
    const events = [];
    const m = fakeModel();
    await deweyTurn({ messages: [{ role: 'user', content: 'add this' }], attach: { images: ['data:image/jpeg;base64,xx'] }, emit: (e) => events.push(e),
      create: m.create, check: async () => ({ verdict: 'not-held', candidates: [] }) });
    expect(events[0]).toMatchObject({ type: 'holdings', verdict: 'not-held', identified: { title: 'The Chosen Highway' } });
    expect(m.seen[0].some((x) => x.role === 'system' && String(x.content).includes('Holdings check of what they just sent (1 photo(s))'))).toBe(true);
    expect(events.filter((e) => e.type === 'item')[0].item).toMatchObject({ title: 'The Chosen Highway', author: 'Lady Blomfield' });
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toContain('Added to the wanted list — send a PDF to start.');
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(m.seen[1].find((x) => x.role === 'tool').content).toContain('"added":true');
  });
  it('summarize keeps the model’s view small', () => {
    const s = JSON.parse(summarize({ identified: { title: 'T' }, verdict: 'held', candidates: [{ id: 1, title: 'T', evidence: [{ kind: 'title', detail: 'T' }] }] }));
    expect(s).toMatchObject({ verdict: 'held', candidates: [{ id: 1, evidence: 'title: T' }] });
  });
});
