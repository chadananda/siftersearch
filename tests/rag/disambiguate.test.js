// enrich/disambiguate — pure helpers + the run() flow on fake ports (no DB, no network).
import { describe, it, expect } from 'vitest';
import { parseNote, gateResolves, renderNote, buildSystem, buildUser } from '../../api/lib/rag/enrich/disambiguate.js';
import { fakeLLM, fakeProfiler, makeRag } from './kit.js';

describe('disambiguate — pure helpers', () => {
  it('parseNote requires an idea and keeps only "name = handle" resolves', () => {
    expect(parseNote('{"place":"Shíráz","era":"1844","idea":"the Declaration","resolve":["He = the Báb","junk"]}'))
      .toEqual({ place: 'Shíráz', era: '1844', idea: 'the Declaration', resolve: ['He = the Báb'] });
    expect(parseNote('```json\n{"idea":"x"}\n``` trailing prose')).toMatchObject({ idea: 'x', resolve: [] });
    expect(parseNote('{"place":"x"}')).toBeNull();          // no idea → not a valid note
    expect(parseNote('not json at all')).toBeNull();
  });

  it('gateResolves drops a resolution whose name is absent from the passage', () => {
    const passage = 'Mullá Ḥusayn arrived at the fort.';
    const kept = gateResolves(['Mullá Ḥusayn = first believer', 'Quddús = the last Letter'], passage);
    expect(kept).toEqual(['Mullá Ḥusayn = first believer']);  // invented "Quddús" removed
  });

  it('renderNote formats the stored string with quoted surfaces', () => {
    expect(renderNote({ place: 'Shíráz', era: '1844', idea: 'the Declaration', resolve: ['He = the Báb'] }))
      .toBe('@Shíráz, ~1844 — the Declaration · "He" = the Báb');
    expect(renderNote({ place: '', era: '', idea: 'a thread', resolve: [] })).toBe('@?, ~? — a thread');
  });

  it('buildSystem embeds book meta + cast and flags a non-English source', () => {
    const sys = buildSystem(fakeProfiler({ lang: 'fa', script: 'arabic', genre: 'history' })({}), { title: 'Ẓuhúru\'l-Ḥaqq', author: 'Mázandarání' }, 'Vaḥíd ≠ Vaḥíd of Nayríz');
    expect(sys).toContain('Ẓuhúru');
    expect(sys).toContain('Persian');
    expect(sys).toContain('Vaḥíd ≠');
  });

  it('buildSystem instructs SCENE COREFERENCE — bind an in-scene role/epithet to the named anchor (P0)', () => {
    const sys = buildSystem(fakeProfiler({ genre: 'history' })({}), { title: 'The Dawn-Breakers', author: 'Nabíl' }, '');
    expect(sys).toMatch(/SCENE COREFERENCE/);
    expect(sys).toMatch(/governor of Zanján = Amír Aslán Khán/);   // co-referring forms collapse to ONE identity
    expect(sys).toMatch(/points? OUTSIDE the scene|pointing OUTSIDE the scene/i); // an out-of-scene ref stays "?"
  });
});

describe('disambiguate — run() on fake ports', () => {
  const seedParas = [
    { id: 1, pid: 'p1', text: 'Mullá Ḥusayn reached Shíráz.', heading: 'Ch1' },
    { id: 2, pid: 'p2', text: 'Mullá Ḥusayn then departed Shíráz.', heading: 'Ch1' },
  ];
  // The model always returns one valid + one invented resolution.
  const note = '{"place":"Shíráz","era":"1844 [pin]","idea":"arrival","resolve":["Mullá Ḥusayn = first Letter of the Living","Quddús = the Last Letter"]}';

  it('disambiguates each paragraph, drops invented names, and writes the rendered note', async () => {
    const { rag, store } = makeRag({ seed: { docs: { 9: { id: 9 } }, paras: { 9: seedParas } }, llm: fakeLLM([{ content: note, finishReason: 'stop' }]) });
    const stats = await rag.disambiguate(9, { version: 'v1' });
    expect(stats).toMatchObject({ paras: 2, done: 2, failed: 0, dropped: 2 }); // one invented name dropped per paragraph
    expect(store.saved).toHaveLength(2);
    expect(store.saved[0].note).toContain('"Mullá Ḥusayn" = first Letter of the Living');
    expect(store.saved[0].note).not.toContain('Quddús');    // invented resolution gated out
    expect(store.saved[0]).toMatchObject({ paragraphId: 1, methodVersion: 'v1' });
  });

  // "Carrying the version" means stamp AND note: a stamp whose note is gone is NOT done (see
  // tests/api/grounding-verify-deadlock.test.js — a stamp-only skip strands the book at its next gate).
  it('RESUME skips paragraphs already carrying the current method version', async () => {
    const done = seedParas.map((p) => ({ ...p, context: '@Shíráz, ~1844 — arrival', contextModel: 'v1' }));
    const { rag, store } = makeRag({ seed: { paras: { 9: done } }, llm: fakeLLM([{ content: note, finishReason: 'stop' }]) });
    const stats = await rag.disambiguate(9, { version: 'v1' });
    expect(stats.done).toBe(0);
    expect(store.saved).toHaveLength(0);
  });
});

// Coverage-deadlock fix: every paragraph must end a clean run with SOME note (real or terminal),
// or the 99% gate loops the book forever (the ~19-book primary-tail plateau, 2026-08-08).
describe('disambiguate — terminal disposition + shared floor', () => {
  const note = '{"place":"Shíráz","era":"1844 [pin]","idea":"arrival","resolve":[]}';

  it('stamps sub-floor fragments with a terminal note WITHOUT a model call', async () => {
    const paras = [
      { id: 1, pid: 'p1', text: '4. Smyrna.' },                                        // TOC debris, below floor
      { id: 2, pid: 'p2', text: 'Mullá Ḥusayn reached Shíráz and there unfolded his whole errand.' },
    ];
    const llm = fakeLLM([{ content: note, finishReason: 'stop' }]);
    const { rag, store } = makeRag({ seed: { paras: { 9: paras } }, llm });
    const stats = await rag.disambiguate(9, { version: 'v1' });
    expect(stats).toMatchObject({ done: 1, failed: 0, tiny: 1, terminal: 0 });
    const frag = store.saved.find((s) => s.paragraphId === 1);
    expect(frag.note).toMatch(/^@\?, ~\? — \[fragment/);
    expect(frag.methodVersion).toBe('v1');
    expect(llm.calls).toHaveLength(1);                     // the fragment never reached the model
  });

  it('retries an unparseable paragraph once, then writes a terminal note so coverage can close', async () => {
    const paras = [
      { id: 1, pid: 'p1', text: 'Mullá Ḥusayn reached Shíráz and there unfolded his whole errand.' },
      { id: 2, pid: 'p2', text: 'O Thou Glory of the All-Glorious, Exalted One of the Most Exalted realm of eternity.' },
    ];
    // p2's content never yields a valid note — the model ANSWERS, but with no idea (parse-null).
    const llm = fakeLLM((opts, i, messages) =>
      messages.some((m) => m.content.includes('Mullá Ḥusayn'))
        ? { content: note, finishReason: 'stop' }
        : { content: '{"place":"?"}', finishReason: 'stop' });
    const { rag, store } = makeRag({ seed: { paras: { 9: paras } }, llm });
    const stats = await rag.disambiguate(9, { version: 'v1' });
    expect(stats).toMatchObject({ done: 1, terminal: 1 });
    const term = store.saved.find((s) => s.paragraphId === 2);
    expect(term.note).toMatch(/^@\?, ~\? — \[unresolvable/);
    expect(term.methodVersion).toBe('v1');
  });

  // ~40s real time: the kernel ladder runs 5-try exponential backoff per attempt across primary AND
  // fallback before surfacing a transport failure. The slow path IS the behavior under test.
  it('never terminalizes on transport errors — a provider outage leaves paragraphs un-noted for the book retry', { timeout: 120000 }, async () => {
    const paras = [{ id: 1, pid: 'p1', text: 'Mullá Ḥusayn reached Shíráz and there unfolded his whole errand.' }];
    const llm = { calls: [], chat: async () => { throw new Error('socket hang up'); } };
    const { rag, store } = makeRag({ seed: { paras: { 9: paras } }, llm });
    const stats = await rag.disambiguate(9, { version: 'v1' });
    expect(stats).toMatchObject({ done: 0, failed: 1, terminal: 0 });
    expect(store.saved).toHaveLength(0);                   // nothing stamped — the queue's retry handles it
  });
});
