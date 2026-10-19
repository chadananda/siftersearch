// The benchmark's scenario transforms must produce the scenario they claim (Dewey benchmark, planning/dewey-benchmark-plan.md)
import { describe, it, expect } from 'vitest';
import * as V from '../../scripts/dewey-bench/variants.mjs';

const TEXT = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}: Bahá’u’lláh revealed in Baghdád a Tablet concerning the oneness of mankind and the station of the Manifestations, and the believers rejoiced at its arrival, number ${i}.`).join('\n\n');
const words = (t) => t.split(/\s+/).filter(Boolean).length;

describe('dewey-bench variants', () => {
  it('are deterministic for a seed', () => {
    expect(V.ocrNoise(TEXT, { seed: 9 })).toBe(V.ocrNoise(TEXT, { seed: 9 }));
    expect(V.retype(TEXT, { seed: 9 })).not.toBe(V.retype(TEXT, { seed: 10 }));
  });
  it('OCR noise and retyping change the text but keep its length', () => {
    const o = V.ocrNoise(TEXT, { rate: 0.05 }), r = V.retype(TEXT);
    expect(o).not.toBe(TEXT);
    expect(Math.abs(words(o) - words(TEXT)) / words(TEXT)).toBeLessThan(0.1);
    expect(r).not.toMatch(/á|’/);
    expect(r).toMatch(/Baha'?u'?llah/);
  });
  it('abridged keeps ~40% in order; an excerpt is contiguous; front matter is the start', () => {
    const a = V.abridge(TEXT), e = V.excerpt(TEXT, { share: 0.1 });
    expect(V.paras(a).length).toBeGreaterThan(10);
    expect(V.paras(a).length).toBeLessThan(40);
    const nums = V.paras(e).map((p) => Number(p.match(/Paragraph (\d+)/)[1]));
    expect(nums.every((n, i) => !i || n === nums[i - 1] + 1)).toBe(true);
    expect(V.frontOnly(TEXT, 3)).toMatch(/^Paragraph 0:/);
  });
  it('an edition adds a preface and an index; a superset wraps the whole text; same-title puts the held title on other text', () => {
    expect(V.edition(TEXT, { title: 'Gleanings' })).toMatch(/^PREFACE TO THE NEW EDITION[\s\S]*INDEX/);
    const s = V.superset(TEXT, 'New one.\n\nNew two.\n\nNew three.\n\nNew four.');
    expect(s).toContain(TEXT);
    expect(V.sameTitle('Gleanings', 'Shoghi Effendi', 'Other words entirely.')).toMatch(/^GLEANINGS\n\nby Shoghi Effendi\n\nOther words/);
  });
  it('a compilation quotes held texts between new prose; commentary quotes about the share asked', () => {
    const c = V.compilation([TEXT], 'Fresh prose one.\n\nFresh prose two.', { n: 6 });
    expect((c.match(/“/g) || []).length).toBe(6);
    const m = V.commentary(TEXT, Array.from({ length: 20 }, (_, i) => `New commentary sentence ${i} about many things here today.`).join('\n\n'), { share: 0.3 });
    const quoted = (m.match(/“[^”]*”/g) || []).join(' ');
    expect(words(quoted) / words(m)).toBeGreaterThan(0.2);
  });
});
