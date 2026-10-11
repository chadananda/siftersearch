import { describe, it, expect } from 'vitest';
import { languageMatches, summarize, recommend } from '../../api/lib/bakeoff/score.js';

describe('bake-off scoring', () => {
  it('language match by script and by function words', () => {
    expect(languageMatches('fa', 'روح انسان پس از مرگ باقی می‌ماند و ترقی می‌کند.')).toBe(true);
    expect(languageMatches('fa', 'The soul continues to progress after death.')).toBe(false);
    expect(languageMatches('he', 'השבת היא יום מנוחה')).toBe(true);
    expect(languageMatches('fr', "Les écrits disent que l'égalité est essentielle et que les femmes et les hommes")).toBe(true);
    expect(languageMatches('fr', 'The writings say that the equality of women and men is essential')).toBe(false);
  });
  it('summarize ranks by quality per dollar; recommend needs no-worse quality + language and a lower price', () => {
    const rs = [];
    for (let i = 0; i < 4; i++) {
      rs.push({ model: 'cur', lang: 'en', ms: 900, usd: 0.002, quality: 8, language_ok: true });
      rs.push({ model: 'cheap', lang: 'en', ms: 700, usd: 0.0005, quality: 7.9, language_ok: true });
      rs.push({ model: 'bad', lang: 'en', ms: 500, usd: 0.0001, quality: 5, language_ok: false });
    }
    const s = summarize(rs);
    expect(s[0].model).toBe('bad');                         // best raw value…
    expect(recommend(s, 'cur').model).toBe('cheap');        // …but only 'cheap' is a safe switch
  });
});
