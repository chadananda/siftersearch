// The "[linked…]" history marker never reaches the reader (11-10 Deepening reply).
import { describe, it, expect } from 'vitest';
import { dropBriefMarkers } from '../../api/lib/assistant/lint.js';

describe('dropBriefMarkers', () => {
  it('drops [linked] and [linked: …]', () => {
    expect(dropBriefMarkers('(Deepening) [linked: Deepening compilation, Shoghi Effendi passage]\n\nNext')).toBe('(Deepening)\n\nNext');
    expect(dropBriefMarkers('the Íqán [linked] says')).toBe('the Íqán says');
  });
  it('keeps ordinary brackets', () => {
    expect(dropBriefMarkers('a [sic] word')).toBe('a [sic] word');
  });
});
