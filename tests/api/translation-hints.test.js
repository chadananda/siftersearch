// Jafar hint formatting — CTAI returns rendering_spectrum as [{en, count}].
import { describe, it, expect } from 'vitest';
import { formatJafarHints, jafarChunks } from '../../api/lib/translation-subagent.js';

describe('formatJafarHints', () => {
  it('shows the corpus renderings CTAI returns as {en, count}', () => {
    const out = formatJafarHints({ enriched_terms: [{ term: 'قدم', transliteration: 'q-d-m', literal: 'ancient',
      se_rendering: '', rendering_spectrum: [{ en: 'ancient', count: 63 }, { en: 'eternity', count: 9 }] }] });
    expect(out).toContain('"ancient"×63');
    expect(out).not.toContain('undefined');
  });
  it("privileges Shoghi Effendi's rendering and drops stop words", () => {
    const out = formatJafarHints({ enriched_terms: [
      { term: 'مظهر', root: 'ظ-ه-ر', se_rendering: 'Manifestation', rendering_spectrum: [] },
      { term: 'و', is_stop: true, rendering_spectrum: [{ en: 'and', count: 900 }] }] });
    expect(out).toContain('Shoghi Effendi: "Manifestation"');
    expect(out).not.toContain('and');
  });
});

describe('jafarChunks', () => {
  it('keeps each request under the ~50-word limit past which CTAI returns no terms', () => {
    const text = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ');
    const chunks = jafarChunks(text);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.split(' ').length <= 35)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });
});
