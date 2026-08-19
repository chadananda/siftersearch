// HyPE must be able to read the CONCEPT layer, not only person claims (conceptual-track §7: HyPE is the
// retrieval level of the same idea the lexicon holds). Without it, questions on a doctrinal passage restate
// the passage's wording — measured on the Íqán's clouds/Matthew-24 passage, the design's own worked example.
// RED-FIRST.
import { describe, it, expect } from 'vitest';
import { buildUser } from '../../api/lib/rag/enrich/retrieval.js';

const para = { pid: 'p1', text: 'they shall see the Son of man coming in the clouds of heaven', context: '@Kitáb-i-Íqán — interpretation of the signs' };

describe('buildUser — concept layer', () => {
  it('injects authoritative interpretations so questions can name the CONCEPT, not echo the wording', () => {
    const u = buildUser(para, null, null, [
      'the clouds = that which veils people from recognizing the Manifestation',
      'the return = the reappearance of the same reality in a new person',
    ]);
    expect(u).toMatch(/veils people from recognizing/);
    expect(u).toMatch(/the return/);
  });
  it('labels them as interpretations to ASK ABOUT, distinct from the reference-only context', () => {
    const u = buildUser(para, null, null, ['the clouds = veils to recognition']);
    // the context block is explicitly "for resolving references only"; concepts must NOT inherit that framing
    const ctxIdx = u.indexOf('for resolving references only');
    const conIdx = u.indexOf('veils to recognition');
    expect(ctxIdx).toBeGreaterThan(-1);
    expect(conIdx).toBeGreaterThan(-1);
    expect(conIdx).not.toBe(ctxIdx);
  });
  it('changes NOTHING when there is no concept layer — an empty lexicon must not alter existing prompts', () => {
    expect(buildUser(para, null, null, [])).toBe(buildUser(para, null, null));
    expect(buildUser(para, null, null, null)).toBe(buildUser(para, null, null));
  });
  it('still carries person facts alongside concepts — the two layers coexist', () => {
    const u = buildUser(para, ['Bahaullah revealed the Iqan in Baghdad'], null, ['the clouds = veils to recognition']);
    expect(u).toMatch(/ESTABLISHED FACTS/);
    expect(u).toMatch(/veils to recognition/);
  });
  it('bounds the block so a large lexicon cannot crowd out the paragraph', () => {
    const many = Array.from({ length: 40 }, (_, i) => `concept ${i} = meaning ${i}`);
    const u = buildUser(para, null, null, many);
    expect(u).not.toMatch(/concept 39/);
  });
});
