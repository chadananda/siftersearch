import { describe, it, expect } from 'vitest';
import { buildUser, parseReview } from '../../api/lib/catalog-review.js';

describe('catalog review seam', () => {
  it('numbers records with their evidence', () => {
    const u = buildUser([{ name: 'Centre of the Covenant', aliases: ['the Master'], summary: 'Title of ‘Abdu’l-Bahá', claims: ['x — y'], mentions: 3 }]);
    expect(u).toMatch(/^RECORDS:\n1\. "Centre of the Covenant" \| aliases: the Master \| summary: Title of/);
  });
  it('parses kinds; same_as only for title_of; unknown kinds rejected', () => {
    const v = parseReview('{"records":[{"n":1,"kind":"title_of","same_as":"‘Abdu’l-Bahá","confidence":0.95},{"n":2,"kind":"group","same_as":"x"},{"n":3,"kind":"maybe"}]}', 3);
    expect(v[0]).toMatchObject({ kind: 'title_of', same_as: '‘Abdu’l-Bahá', confidence: 0.95 });
    expect(v[1]).toMatchObject({ kind: 'group', same_as: null });
    expect(v[2]).toBeNull();
  });
});
