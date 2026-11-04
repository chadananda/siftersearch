// The English beside an original-language hit is that work's translation, not whichever copy linked first (11-04 digest
// #147, writer half). A compilation or a quoting letter is the fallback and is named by its class. Several works, not one.
import { describe, it, expect } from 'vitest';
import { pickRendering, renderingTitle } from '../../api/lib/assistant/researcher.js';

const bahaullah = 'Bahá’u’lláh';
const gleanings = { id: 1, title: 'Gleanings from the Writings of Bahá’u’lláh', author: bahaullah, religion: 'Bahá’í' };
const iqan = { id: 2, title: 'The Kitáb-i-Íqán', author: bahaullah, religion: 'Bahá’í' };
const selections = { id: 3, title: 'Selections from the Writings of the Báb', author: 'The Báb', religion: 'Bahá’í' };
const compilation = { id: 4, title: 'Compilation on Consultation', author: bahaullah, religion: 'Bahá’í' };
const quoting = { id: 5, title: 'The Advent of Divine Justice', author: 'Shoghi Effendi', religion: 'Bahá’í' };

describe('pickRendering', () => {
  it('Shoghi Effendi\'s translation of the work wins over a compilation listed first (Gleanings, Íqán)', () => {
    expect(pickRendering([compilation, gleanings]).t).toBe(gleanings);
    expect(pickRendering([quoting, compilation, iqan]).t).toBe(iqan);
    expect(pickRendering([compilation, iqan]).rendering).toBe(true);
  });
  it('with only a compilation or a quoting letter, that copy is the fallback, not called a translation', () => {
    const c = pickRendering([quoting, selections]);
    expect(c.t).toBe(selections);
    expect(c.cls).toBe('compilation');
    expect(c.rendering).toBe(false);
    const q = pickRendering([quoting]);
    expect(q.cls).toBe('quoted-authoritative');
    expect(renderingTitle(quoting.title, 'P2', q)).toBe('The Advent of Divine Justice (quoted authoritative copy of the original P2 — not its own translation)');
  });
  it('equal classes keep the link order (best first)', () => {
    const g2 = { ...gleanings, id: 9 };
    expect(pickRendering([gleanings, g2]).t).toBe(gleanings);
  });
  it('nothing linked → null; a translation keeps the plain head', () => {
    expect(pickRendering([])).toBeNull();
    expect(pickRendering(undefined)).toBeNull();
    expect(renderingTitle(iqan.title, 'P1', pickRendering([iqan]))).toBe('The Kitáb-i-Íqán (English translation of the original P1)');
    expect(renderingTitle('Inline English', 'P4', null)).toBe('Inline English (English translation of the original P4)');
  });
});
