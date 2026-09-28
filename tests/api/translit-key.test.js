// skeletonKeys — the lookup's recall key. A name must never produce NO key: it is then unfindable by its own name.
import { describe, it, expect } from 'vitest';
import { skeletonKeys } from '../../api/lib/translit-key.js';

describe('skeletonKeys', () => {
  // MEASURED 2026-09-28: "Yaḥyá" (y counts as a vowel → skeleton "h") produced no key, so Mírzá Yaḥyá — 2,162
  // mentions — returned nothing from the lookup, and neither did any other Yaḥyá.
  it('a long name whose consonant skeleton vanishes still gets its vowel-kept key', () => {
    expect([...skeletonKeys('Mírzá Yaḥyá')]).toEqual(['~yahya']);
    expect(skeletonKeys('Yahya').has('~yahya')).toBe(true);
    expect(skeletonKeys('Ayyúb').has('~ayyub')).toBe(true);
  });
  it('ordinary names are unchanged', () => {
    expect([...skeletonKeys('Karbila')]).toEqual(['Krbl']);
    expect([...skeletonKeys('Subh-i-Azal')]).toEqual(['Sbh', '~subh', 'Zl', '~azal']);
  });
});
