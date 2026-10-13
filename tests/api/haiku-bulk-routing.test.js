// HyPE + concept extraction on Haiku 5.5 for every language (Chad 10-13), inside the 100k long-context price threshold.
import { describe, it, expect } from 'vitest';
import { assertAnthropicAllowed, isBulkHaikuAllowed, assertUnderLongContext } from '../../api/lib/anthropic-policy.js';
import { detectProfile } from '../../api/lib/pipeline/profile.js';

describe('routing', () => {
  it('HyPE and concept extraction use Haiku 5.5 in every language; disambiguation and historical extraction are unchanged', () => {
    for (const id of [21310]) {
      const p = detectProfile({ id, lang: 'en' });
      expect(p.models.hype).toBe('claude-haiku-5-5');
      expect(p.models.concept).toBe('claude-haiku-5-5');
      expect(p.models.disambig).toBe('deepseek-v4-flash');
      expect(p.models.extract).toBe('deepseek-v4-flash');
    }
    expect(detectProfile({ id: 15228 }).models.hype).toBe('claude-haiku-5-5');   // Persian
  });
});

describe('spend policy', () => {
  it('Haiku 5.5 is allowed for hype and concept-extract on any book; nothing else widens', () => {
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'en', docId: 21310, stage: 'hype' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'ar', docId: 1, stage: 'concept-extract' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-5-5', lang: 'en', docId: 21310, stage: 'hype' })).toThrow(/REFUSED/);
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'en', docId: 21310, stage: 'disambiguate' })).toThrow(/REFUSED/);
    expect(isBulkHaikuAllowed({ stage: 'hype', model: 'claude-haiku-5-5' })).toBe(true);
  });
  it('a prompt near the 100k long-context threshold is refused; a normal one passes', () => {
    expect(assertUnderLongContext({ model: 'claude-haiku-5-5', chars: 20000, threshold: 100000 })).toBeGreaterThan(0);
    expect(() => assertUnderLongContext({ model: 'claude-haiku-5-5', chars: 340000, threshold: 100000 })).toThrow(/long-context/);
    expect(assertUnderLongContext({ model: 'x', chars: 9e9, threshold: undefined })).toBe(0);
  });
});
