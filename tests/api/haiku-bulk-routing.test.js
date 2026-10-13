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
  it('Haiku 5.5 is allowed for any stage on any book (10-13: "update all model use"); Sonnet only where gated', () => {
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'en', docId: 21310, stage: 'hype' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'ar', docId: 1, stage: 'concept-extract' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-5-5', lang: 'en', docId: 21310, stage: 'hype' })).toThrow(/REFUSED/);
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'en', docId: 21310, stage: 'disambiguate' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-5-5', stage: 'interactive:jafar-research' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-opus-5-5', stage: 'interactive:jafar-research' })).toThrow(/REFUSED/);
    expect(isBulkHaikuAllowed({ stage: 'hype', model: 'claude-haiku-5-5' })).toBe(true);
  });
  it('a prompt near the 100k long-context threshold is refused; a normal one passes', () => {
    expect(assertUnderLongContext({ model: 'claude-haiku-5-5', chars: 20000, threshold: 100000 })).toBeGreaterThan(0);
    expect(() => assertUnderLongContext({ model: 'claude-haiku-5-5', chars: 340000, threshold: 100000 })).toThrow(/long-context/);
    expect(assertUnderLongContext({ model: 'x', chars: 9e9, threshold: undefined })).toBe(0);
  });
});

// the rag adapter's own gate (it aborts a grounding run fatally) must agree with anthropic-policy
import { assertSpendAllowed } from '../../api/lib/rag-adapter/usage.js';
describe('rag-adapter spend gate', () => {
  it('lets Haiku 5.5 run in English and Arabic; still refuses other paid models', () => {
    expect(() => assertSpendAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'en', stage: 'hype', docId: 21310 })).not.toThrow();
    expect(() => assertSpendAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'ar', stage: 'concept-extract', docId: 5 })).not.toThrow();
    expect(() => assertSpendAllowed({ provider: 'anthropic', model: 'claude-sonnet-5-5', lang: 'en', stage: 'hype', docId: 21310 })).toThrow(/Persian-only/);
    expect(() => assertSpendAllowed({ provider: 'anthropic', model: 'claude-haiku-5-5', lang: 'en', stage: 'disambiguate', docId: 21310 })).not.toThrow();
  });
});

// role-client: every legacy call site gets its model from the role table, shaped for that model's API
import { shapeParams } from '../../api/lib/role-client.js';
describe('shapeParams', () => {
  it('drops temperature for 5.5 models, keeps max_tokens, drops response_format on Anthropic', () => {
    const p = shapeParams({ messages: [], temperature: 0.4, max_tokens: 700, response_format: { type: 'json_object' } }, { provider: 'anthropic', model: 'claude-haiku-5-5' });
    expect(p).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 700 });
    expect(p.temperature).toBeUndefined();
    expect(p.response_format).toBeUndefined();
  });
  it('keeps temperature and JSON mode where the model takes them; DeepSeek thinking off', () => {
    const p = shapeParams({ messages: [], temperature: 0.2, max_tokens: 100, response_format: { type: 'json_object' } }, { provider: 'deepseek', model: 'deepseek-v4-flash' });
    expect(p).toMatchObject({ temperature: 0.2, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } });
  });
});
