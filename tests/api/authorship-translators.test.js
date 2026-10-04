import { describe, it, expect } from 'vitest';
import { canonicalTranslator, interpreterOf, titleTranslator, frontmatterTranslators } from '../../api/lib/authorship/translators.js';

describe('translators', () => {
  it('folds spelling variants to one name', () => {
    for (const v of ['Dr. Ameen U. Faríd', 'Ameen U. Fareed', 'Dr. Ameen Fareed (for most tablets)', "Aminu'llah Farid", 'Dr. Farid'])
      expect(canonicalTranslator(v)).toBe('Ameen U. Faríd');
    expect(canonicalTranslator('Ahmad Sohrab')).toBe('Mírzá Aḥmad Sohrab');
    expect(canonicalTranslator('Shoghi Effendi (Shoghi Rabbani)')).toBe('Shoghi Effendi');
    expect(canonicalTranslator('Unknown')).toBe(null);
    expect(canonicalTranslator('Dr. Stephen Lambden')).toBe('Stephen Lambden');
  });
  it('reads interpreter lines', () => {
    expect(interpreterOf('Dr. Ameen U. Faríd, Interpreter')).toBe('Ameen U. Faríd');
    expect(interpreterOf('Mrs. Merryman, Palo Alto \tAḥmad Sohrab, interpreter')).toBe('Mírzá Aḥmad Sohrab');
    expect(interpreterOf('Translated by Mírzá Aḥmad Sohrab from his Persian notes')).toBe('Mírzá Aḥmad Sohrab');
    expect(interpreterOf('Interpreted by Dr. Ameen U. Fareed; stenographic notes by Edna McKinney')).toBe('Ameen U. Faríd');
    expect(interpreterOf('San Francisco, October 4, 1912, 8. P. M.')).toBe(null);
  });
  it('reads titles and frontmatter', () => {
    expect(titleTranslator('Ozymandius - tr William McCants')).toBe('William McCants');
    expect(titleTranslator('Lawh-i-Hikmat (trans. Juan Cole)')).toBe('Juan Cole');
    expect(titleTranslator('Gleanings from the Writings of Bahá’u’lláh')).toBe(null);
    expect(frontmatterTranslators('Shoghi Effendi')).toEqual(['Shoghi Effendi']);
    expect(frontmatterTranslators('Ruhi Afnan (Rúḥí M. Afnán)')).toEqual(['Ruhi Afnan']);
  });
});
