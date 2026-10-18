// Dewey's chat turn: what was sent is checked BEFORE the model speaks; the model streams and may call tools.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/dewey/identify.js', () => ({
  identifyPhotos: vi.fn(async () => ({ title: 'The Chosen Highway', author: 'Lady Blomfield', from: 'photo' })),
  identifyUrl: vi.fn(), identifyFile: vi.fn(async () => ({ title: 'A Rare Pamphlet', kind: 'file', from: 'file' })), identifyText: (t) => ({ printed_lines: [t], from: 'text' }),
}));
const items = [];
vi.mock('../../api/lib/repos/dewey-repo.js', () => ({
  createItem: vi.fn(async (o) => { const i = { id: items.length + 1, state: 'wanted', ...o }; items.push(i); return i; }),
  findOpenByTitle: vi.fn(async () => null), listItems: vi.fn(async () => items), getItem: vi.fn(),
  updateItem: vi.fn(async (id, f) => Object.assign(items.find((i) => i.id === id) || {}, f)),
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
    // the checks ride IN the member's turn (a 2nd system message is hoisted above the conversation and was missed, 10-17)
    const turn = m.seen[0].filter((x) => x.role === 'user').at(-1);
    expect(turn.content).toContain('Holdings check of what they just sent (1 photo(s))');
    expect(turn.content).toContain('Appraisal from web research');
    expect(m.seen[0].filter((x) => x.role === 'system')).toHaveLength(1);
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

describe('an upload we lack is OFFERED, never imported unasked (Chad 10-17)', () => {
  const quiet = async () => (async function* () { yield { choices: [{ delta: { content: 'ok' } }] }; })();
  const archive = async () => ({ path: '/originals/x.pdf', sha256: 'abc', bytes: 1024 });
  it('appraised from its own text, kept as an offered item with the recommended shelf; nothing queued', async () => {
    const attached = [], events = [];
    const attachSource = async (id, src) => { attached.push({ id, src }); return { id }; };
    const appraiseDoc = async () => ({ title: 'Shoghi Effendi in Torquay', shelf: { religion: "Baha'i", collection: 'Pilgrim Notes' }, recommendation: 'add',
      recommendation_line: 'It looks like this belongs in our Bahá’í › Pilgrim Notes collection.' });
    await deweyTurn({ messages: [{ role: 'user', content: '' }], attach: { file: { name: 'p.docx', data: 'eA==' } }, emit: (e) => events.push(e), attachSource, create: quiet, archive, appraiseDoc,
      identifyCheck: async () => ({ identified: { title: 'p', kind: 'file' }, result: { verdict: 'not-held', candidates: [], compared: { words: 900, probes: 30, documents: 3 } }, sha256: 'x', bytes: 1 }),
      appraise: async () => { throw new Error('no web appraisal for an upload'); } });
    expect(attached).toHaveLength(0);
    const offer = events.find((e) => e.type === 'item')?.item;
    expect(offer).toMatchObject({ state: 'offered', title: 'Shoghi Effendi in Torquay', original_path: '/originals/x.pdf', identified: { shelf: { collection: 'Pilgrim Notes' } } });
  });
  it('a held upload is neither offered nor appraised', async () => {
    const events = [];
    await deweyTurn({ messages: [{ role: 'user', content: '' }], attach: { file: { name: 'p.pdf', data: 'eA==' } }, emit: (e) => events.push(e), attachSource: async () => { throw new Error('no'); }, create: quiet, archive,
      identifyCheck: async () => ({ identified: { title: 'A Rare Pamphlet' }, result: { verdict: 'held', candidates: [{ id: 1, title: 'A Rare Pamphlet', evidence: [] }] } }), appraiseDoc: async () => { throw new Error('not called'); } });
    expect(events.some((e) => e.type === 'item')).toBe(false);
  });
  it('a file READ IN PLACE on the server (a Dropbox path) is offered with that path as its original — no copy, no upload', async () => {
    const events = [];
    let archived = false;
    await deweyTurn({ messages: [{ role: 'user', content: '' }], attach: { path: '/tank/dropbox/Ocean2.0 Supplemental/x/Big Book.pdf' }, emit: (e) => events.push(e), create: quiet,
      archive: async () => { archived = true; return {}; }, pathOk: (p) => p,
      appraiseDoc: async () => ({ title: 'A Big Book', shelf: { religion: "Baha'i", collection: 'Books' } }),
      identifyCheck: async ({ path }) => ({ identified: { title: 'A Big Book', kind: 'file' }, result: { verdict: 'not-held', candidates: [] }, sha256: 'abc', bytes: 280e6, _path: path }) });
    expect(archived).toBe(false);
    expect(events.find((e) => e.type === 'item')?.item).toMatchObject({ state: 'offered', original_path: '/tank/dropbox/Ocean2.0 Supplemental/x/Big Book.pdf', sha256: 'abc' });
  });
  it('a path spelled in the other Unicode form (macOS NFD vs Linux NFC) still finds the file', async () => {
    const { allowedPath } = await import('../../api/lib/dewey/paths.js');
    const { mkdtempSync, writeFileSync, realpathSync } = await import('fs');
    const { tmpdir } = await import('os');
    const root = realpathSync(mkdtempSync(`${tmpdir()}/dewey-`));
    writeFileSync(`${root}/Bah\u00e1.doc`, 'x');   // composed, as on tower
    // (macOS's filesystem matches either spelling and echoes the one given; Linux needs the composed one — compare normalized)
    expect(allowedPath(`${root}/Baha\u0301.doc`, [root]).normalize('NFC')).toBe(`${root}/Bah\u00e1.doc`.normalize('NFC'));
  });
  it('a path outside the allowed folders is refused', async () => {
    const { allowedPath } = await import('../../api/lib/dewey/paths.js');
    expect(() => allowedPath('/etc/passwd', ['/tank/dropbox/Ocean2.0 Supplemental'])).toThrow(/outside the folders/);
    expect(() => allowedPath('/tmp/../etc/passwd', ['/tmp'])).toThrow(/outside the folders/);
  });
  it('add_offered imports on yes, item by item', async () => {
    const { makeTools } = await import('../../api/lib/dewey/agent.js');
    const accepted = [];
    const tools = makeTools({ by: 'chad', emit: () => {}, accept: async (id) => { accepted.push(id); return { id, state: 'source' }; } });
    expect(JSON.parse(await tools.add_offered({ item_ids: [4, 5] })).accepted).toEqual([{ id: 4, state: 'source' }, { id: 5, state: 'source' }]);
    expect(accepted).toEqual([4, 5]);
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
