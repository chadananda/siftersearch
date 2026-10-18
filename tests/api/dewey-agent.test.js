// Dewey's chat turn: what was sent is checked BEFORE the model speaks; the model streams and may call tools.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/dewey/identify.js', () => ({
  identifyPhotos: vi.fn(async () => ({ title: 'The Chosen Highway', author: 'Lady Blomfield', from: 'photo' })),
  identifyUrl: vi.fn(), identifyFile: vi.fn(async () => ({ title: 'A Rare Pamphlet', kind: 'file', from: 'file' })), identifyText: (t) => ({ printed_lines: [t], from: 'text' }),
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
      create: m.create, check: async () => ({ verdict: 'not-held', candidates: [] }),
      appraise: async (id, line, { emit }) => { emit({ type: 'appraisal', title: id.title, in_scope: 'yes', value: 'high' }); return { in_scope: 'yes', value: 'high', shelf: { religion: "Baha'i", collection: 'Books' } }; } });
    expect(events[0]).toMatchObject({ type: 'status', text: 'Reading your photo…' });
    expect(events.find((e) => e.type === 'holdings')).toMatchObject({ verdict: 'not-held', identified: { title: 'The Chosen Highway' } });
    expect(events.find((e) => e.type === 'appraisal')).toMatchObject({ in_scope: 'yes', value: 'high' });   // not held → appraised at once
    expect(events.findIndex((e) => e.type === 'appraisal')).toBeLessThan(events.findIndex((e) => e.type === 'delta'));
    expect(m.seen[0].some((x) => x.role === 'system' && String(x.content).includes('Holdings check of what they just sent (1 photo(s))'))).toBe(true);
    expect(m.seen[0].some((x) => x.role === 'system' && String(x.content).includes('Appraisal from web research'))).toBe(true);
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

describe('upload is one step', () => {
  const quiet = async () => (async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })();
  it('a file we lack that belongs here is imported at once; a held one is not', async () => {
    const attached = [];
    const attachSource = async (id, src) => { attached.push({ id, src }); return { id, state: 'source', title: 'A Rare Pamphlet' }; };
    const events = [];
    await deweyTurn({ messages: [{ role: 'user', content: '' }], attach: { file: { name: 'p.pdf', data: 'eA==' } }, emit: (e) => events.push(e), attachSource, create: quiet,
      check: async () => ({ verdict: 'not-held', candidates: [] }), appraise: async () => ({ in_scope: 'yes', recommendation: 'add' }) });
    expect(attached).toHaveLength(1);
    expect(attached[0].src.file.name).toBe('p.pdf');
    expect(events.some((e) => e.type === 'item' && e.item.state === 'source')).toBe(true);
    attached.length = 0;
    await deweyTurn({ messages: [{ role: 'user', content: '' }], attach: { file: { name: 'p.pdf', data: 'eA==' } }, emit: () => {}, attachSource, create: quiet,
      check: async () => ({ verdict: 'held', candidates: [{ id: 1, title: 'A Rare Pamphlet', evidence: [] }] }), appraise: async () => { throw new Error('not called'); } });
    expect(attached).toHaveLength(0);
  });
});

describe('appraisal', async () => {
  const { appraiseWork } = await import('../../api/lib/dewey/appraise.js');
  it('fast research shows first, the judgment keeps only an existing shelf, sources are collected', async () => {
    const events = [];
    const a = await appraiseWork({ title: 'The Chosen Highway', author: 'Lady Blomfield' }, 'not-held', {
      emit: (e) => events.push(e),
      pplx: async () => ({ text: 'A memoir of Bahá’í history. Used copies $15–30.', citations: [{ title: 'x', url: 'https://a' }] }),
      parallel: async () => ({ text: 'Published 1940 by Bahá’í Publishing Trust.', citations: [{ title: 'y', url: 'https://b' }] }),
      shelves: () => ({ "Baha'i": ['Books', 'Pilgrim Notes'] }),
      create: async () => ({ choices: [{ message: { content: JSON.stringify({ in_scope: 'yes', shelf: { religion: "Baha'i", collection: 'Pilgrim Notes' }, value: 'high', price: '$15–30 used', recommendation: 'add' }) } }] }),
    });
    expect(events.map((e) => e.type)).toEqual(['status', 'research', 'status', 'research', 'status', 'appraisal']);
    expect(a).toMatchObject({ shelf: { religion: "Baha'i", collection: 'Pilgrim Notes' }, price: '$15–30 used', recommendation: 'add' });
    expect(a.sources.map((s) => s.url)).toEqual(['https://a', 'https://b']);
  });
  it('a shelf that does not exist is dropped', async () => {
    const a = await appraiseWork({ title: 'X' }, 'not-held', { pplx: async () => null, parallel: async () => null, shelves: () => ({ Islam: ['Hadith'] }),
      create: async () => ({ choices: [{ message: { content: '{"in_scope":"maybe","shelf":{"religion":"Islam","collection":"Invented"}}' } }] }) });
    expect(a.shelf).toBeNull();
  });
});
