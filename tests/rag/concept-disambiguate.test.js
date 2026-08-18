// concepts/disambiguate — the ARGUMENT-CARRYING disambiguation variant (conceptual-track §7). For doctrinal
// texts the note must carry the running argument so a back-reference ("this Will", "the aforementioned
// station") resolves standing alone. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { parseNote, renderNote, buildSystem, buildUser, carryState, run } from '../../api/lib/rag/concepts/disambiguate.js';
import { makeRag } from './kit.js';

describe('concepts/disambiguate — pure helpers', () => {
  it('parseNote REQUIRES the running argument — that is the carrier the whole stage exists for', () => {
    expect(parseNote('{"argument":"the Covenant secures unity after the Manifestation","resolve":[]}'))
      .toMatchObject({ argument: 'the Covenant secures unity after the Manifestation' });
    expect(parseNote('{"resolve":[]}')).toBeNull();
    expect(parseNote('junk')).toBeNull();
  });
  it('parseNote keeps back-reference resolutions as phrase -> antecedent pairs', () => {
    const n = parseNote('{"argument":"a","resolve":[{"phrase":"this Will","refersTo":"the Will and Testament of Abdu-l-Baha"}]}');
    expect(n.resolve[0]).toMatchObject({ phrase: 'this Will', refersTo: 'the Will and Testament of Abdu-l-Baha' });
  });
  it('renderNote produces a self-contained note carrying argument AND resolutions', () => {
    const note = renderNote({ argument: 'the station of the Interpreter is distinct from the Manifestation',
      resolve: [{ phrase: 'that station', refersTo: 'the station of the Interpreter' }] });
    expect(note).toMatch(/station of the Interpreter/);
    expect(note).toMatch(/that station/);
  });
  it('an empty note is still a DONE note — the stage looked and found nothing to carry', () => {
    expect(renderNote({ argument: '', resolve: [] })).toBe('');
  });
  it('the system prompt forbids inventing doctrine and demands under-resolution', () => {
    const s = buildSystem({ title: 'The World Order of Baha-u-llah', author: 'Shoghi Effendi' }, {});
    expect(s).toMatch(/under-resolve|do not resolve|leave.*unresolved/i);
    expect(s).toMatch(/never invent|not invent|no.*invent/i);
    expect(s).toMatch(/antecedent/i);
  });
  it('the system prompt is STABLE across paragraphs and the user message carries the variable tail', () => {
    const meta = { title: 'T', author: 'A' };
    expect(buildSystem(meta, {})).toBe(buildSystem(meta, {}));
    const u1 = buildUser({ text: 'para one' }, 'running argument so far');
    expect(u1).toMatch(/para one/);
    expect(u1).toMatch(/running argument so far/);
  });
  it('carryState forwards the LATEST argument so the next paragraph resolves against it', () => {
    expect(carryState({ argument: 'second' }, 'first')).toBe('second');
    expect(carryState(null, 'first')).toBe('first');            // a failed paragraph must not wipe the thread
  });
});

describe('concepts/disambiguate — run() on fake ports', () => {
  const paras = [
    { pid: 'p1', text: 'The Covenant of Baha-u-llah is the axis of unity.' },
    { pid: 'p2', text: 'That Covenant, as aforementioned, secures the Faith against schism.' },
  ];
  const llm = () => ({ content: '{"argument":"the Covenant is the axis of unity and guards against schism","resolve":[{"phrase":"That Covenant","refersTo":"the Covenant of Baha-u-llah"}]}' });

  it('writes one argument-carrying note per paragraph', async () => {
    const { store } = makeRag({ llm, seed: { paras: { 7: paras }, docs: { 7: { id: 7, title: 'T', author: 'A' } } } });
    const saved = [];
    const spy = { ...store, saveContext: async (pid, note, v) => { saved.push({ pid, note, v }); } };
    const model = { runLadder: async ({ user }) => ({ parsed: parseNote(llm(user).content) }) };
    const stats = await run({ store: spy, model, config: {}, log: {} }, 7);
    expect(stats.written).toBe(2);
    expect(saved[0].note).toMatch(/axis of unity/);
    expect(saved[1].note).toMatch(/That Covenant = the Covenant of Baha-u-llah/);
  });

  it('dry-run writes nothing', async () => {
    const { store } = makeRag({ llm, seed: { paras: { 7: paras }, docs: { 7: { id: 7 } } } });
    const saved = [];
    const spy = { ...store, saveContext: async (...a) => { saved.push(a); } };
    await run({ store: spy, model: { runLadder: async () => ({ parsed: parseNote(llm().content) }) }, config: {}, log: {} }, 7, { dryRun: true });
    expect(saved).toHaveLength(0);
  });
});
