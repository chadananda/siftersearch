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
  it('rejects prose and strips dates', () => {
    expect(interpreterOf('which was interpreted by ’Abdu’l-Bahá to mean the Covenant')).toBe(null);
    expect(interpreterOf('Translated by Díyá M. Baghdádí, 14 August 1922, Chicago, Illinois')).toBe('Díyá M. Baghdádí');
    expect(interpreterOf('Translated by Mirza Yuhanna Dawud, August 15, 1911')).toBe('Mirza Yuhanna Dawud');
    expect(canonicalTranslator('Amín U. Faríd')).toBe('Ameen U. Faríd');
    expect(canonicalTranslator('a Mullá in our')).toBe(null);
  });
  it('cuts a place after the name', () => {
    expect(canonicalTranslator('Bozorgzadeh E. Kahn. Pittsburgh')).toBe('Bozorgzadeh E. Kahn');
    expect(canonicalTranslator('Dr. Ameen U. Faríd')).toBe('Ameen U. Faríd');
  });
});
