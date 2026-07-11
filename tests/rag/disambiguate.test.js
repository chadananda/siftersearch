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

  it('renderNote formats the stored string', () => {
    expect(renderNote({ place: 'Shíráz', era: '1844', idea: 'the Declaration', resolve: ['He = the Báb'] }))
      .toBe('@Shíráz, ~1844 — the Declaration · He = the Báb');
    expect(renderNote({ place: '', era: '', idea: 'a thread', resolve: [] })).toBe('@?, ~? — a thread');
  });

  it('buildSystem embeds book meta + cast and flags a non-English source', () => {
    const sys = buildSystem(fakeProfiler({ lang: 'fa', script: 'arabic', genre: 'history' })({}), { title: 'Ẓuhúru\'l-Ḥaqq', author: 'Mázandarání' }, 'Vaḥíd ≠ Vaḥíd of Nayríz');
    expect(sys).toContain('Ẓuhúru');
    expect(sys).toContain('Persian');
    expect(sys).toContain('Vaḥíd ≠');
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
    expect(store.saved[0].note).toContain('Mullá Ḥusayn = first Letter of the Living');
    expect(store.saved[0].note).not.toContain('Quddús');    // invented resolution gated out
    expect(store.saved[0]).toMatchObject({ paragraphId: 1, methodVersion: 'v1' });
  });

  it('RESUME skips paragraphs already carrying the current method version', async () => {
    const done = seedParas.map((p) => ({ ...p, contextModel: 'v1' }));
    const { rag, store } = makeRag({ seed: { paras: { 9: done } }, llm: fakeLLM([{ content: note, finishReason: 'stop' }]) });
    const stats = await rag.disambiguate(9, { version: 'v1' });
    expect(stats.done).toBe(0);
    expect(store.saved).toHaveLength(0);
  });
});
