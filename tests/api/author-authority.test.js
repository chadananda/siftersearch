// A paragraph's own writer carries that writer's authority (curly or straight apostrophes).
import { describe, it, expect } from 'vitest';
import { authorAuthority } from '../../api/lib/authority.js';

describe('authorAuthority', () => {
  it('normalises apostrophes and returns null for writers not in the table', () => {
    expect(authorAuthority('Bahá’u’lláh')).toBe(8);
    expect(authorAuthority('‘Abdu’l-Bahá')).toBe(7);
    expect(authorAuthority('Shoghi Effendi')).toBe(7);
    expect(authorAuthority('Adib Taherzadeh')).toBe(null);
    expect(authorAuthority(null)).toBe(null);
  });
});
