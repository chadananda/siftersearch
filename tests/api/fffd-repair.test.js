// In-place repair of «��» (chunk-split UTF-8) from the source file, keeping the paragraph row.
import { describe, it, expect } from 'vitest';
import { repairParagraph } from '../../api/lib/fffd-repair.js';

const source = '---\ntitle: x\n---\n\nThe Kitáb-i-Íqán was revealed by Bahá’u’lláh in Baghdád.\n\nقل یا قوم اتّقوا اللّه\n';

describe('repairParagraph', () => {
  it('restores a Latin letter split into two replacement characters', () => {
    const r = repairParagraph('The Kit��b-i-Íqán was revealed by Bahá’u’lláh', source);
    expect(r).toEqual({ text: 'The Kitáb-i-Íqán was revealed by Bahá’u’lláh', fixed: 1, unresolved: 0 });
  });
  it('restores several runs, Arabic script included, ignoring sentence markers', () => {
    const r = repairParagraph('⁅s1⁆قل یا ق��م اتّقوا ال��ه⁅/s1⁆', source);
    expect(r.text).toBe('⁅s1⁆قل یا قوم اتّقوا اللّه⁅/s1⁆');
    expect(r.fixed).toBe(2);
  });
  it('refuses to guess when the source does not settle it', () => {
    const r = repairParagraph('Something �� not in the source at all', source);
    expect(r.text).toBeNull();
    expect(r.unresolved).toBe(1);
  });
  it('refuses when two different fills fit the same context', () => {
    const r = repairParagraph('a � b', 'a x b and a y b');
    expect(r.text).toBeNull();
  });
});
