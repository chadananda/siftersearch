// Scene extraction seam: parse, proof check, and participant binding (the model is not called).
import { describe, it, expect } from 'vitest';
import { parseScenes, proofInParagraph, bindParticipant } from '../../api/lib/scenes.js';

describe('scenes', () => {
  it('parses scenes with ≥2 participants and drops the rest', () => {
    const s = parseScenes('{"scenes":[{"place":"Karbilá","summary":"x","proof":"struck dumb","participants":[{"name":"A","role":"host"},{"name":"B"}]},{"proof":"p","participants":[{"name":"C"}]}]}');
    expect(s).toHaveLength(1);
    expect(s[0].participants).toEqual([{ name: 'A', role: 'host' }, { name: 'B', role: null }]);
  });
  it('proof must be the paragraph’s own words', () => {
    const text = 'And the preacher who occupied the pulpit was momentarily struck dumb. He could not utter a word.';
    expect(proofInParagraph('the preacher who occupied the pulpit was momentarily struck dumb', text)).toBe(true);
    expect(proofInParagraph('Mullá Ḥusayn met the Báb in Karbilá', text)).toBe(false);
  });
  it('binds a participant only to a single matching candidate in the paragraph', () => {
    const cands = [{ id: 1, name: 'the Báb' }, { id: 5, name: 'Mullá Ḥusayn' }, { id: 6, name: 'Mullá Ḥusayn (marksman of Nayríz)' }];
    const m = (n, c) => c.name.toLowerCase().startsWith(n.toLowerCase());
    expect(bindParticipant('the Báb', cands, m)).toBe(1);
    expect(bindParticipant('Mullá Ḥusayn', cands, m)).toBeNull();   // two candidates → unbound, never guessed
  });
});
