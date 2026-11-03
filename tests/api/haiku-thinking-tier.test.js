// Chad 11-03: Haiku runs WITHOUT thinking unless a caller asks (fast + cheap), and never silently in the 5× long-context tier.
import { describe, it, expect, vi, afterEach } from 'vitest';

const sent = [];
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { constructor() { this.messages = { create: async (p) => { sent.push(p); return { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, output_tokens: 1 } }; } }; } },
}));

import { thinkingParam, longContextThreshold } from '../../api/lib/model-registry.js';
import { shapeParams, thinkingFields, roleCreate } from '../../api/lib/role-client.js';
import { assertUnderLongContext, guardLongContext, notePaidLongContext, promptChars } from '../../api/lib/anthropic-policy.js';

const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5';
afterEach(() => { vi.restoreAllMocks(); delete process.env.LONG_CONTEXT_THRESHOLD_CLAUDE_HAIKU_5_5; });

describe('Haiku thinking is OFF by default', () => {
  it('registry: unset → disabled for Haiku, the model default for others; an explicit ask wins', () => {
    expect(thinkingParam(HAIKU)).toEqual({ type: 'disabled' });
    expect(thinkingParam(HAIKU, true)).toBeUndefined();                       // the caller asked: Haiku's own thinking
    expect(thinkingParam(HAIKU, { type: 'adaptive' })).toEqual({ type: 'adaptive' });
    expect(thinkingParam(SONNET)).toBeUndefined();
    expect(thinkingParam(SONNET, false)).toEqual({ type: 'disabled' });
  });
  it('OpenAI-compatible requests (role-client, craft, reading) carry the top-level thinking field', () => {
    expect(shapeParams({ messages: [], max_tokens: 10 }, { provider: 'anthropic', model: HAIKU }).thinking).toEqual({ type: 'disabled' });
    expect(shapeParams({ messages: [], thinking: true }, { provider: 'anthropic', model: HAIKU })).not.toHaveProperty('thinking');
    expect(shapeParams({ messages: [] }, { provider: 'anthropic', model: SONNET })).not.toHaveProperty('thinking');
    expect(thinkingFields('deepseek', 'deepseek-v4-flash')).toEqual({ thinking: { type: 'disabled' } });
    expect(thinkingFields('gemini', 'gemini-3.5-flash-lite')).toEqual({});
  });
  it('ai.js chatCompletion sends thinking disabled to Haiku unless thinking:true', async () => {
    process.env.ANTHROPIC_API_KEY ||= 'test';
    const { chatCompletion } = await import('../../api/lib/ai.js');
    await chatCompletion([{ role: 'user', content: 'hi' }], { provider: 'anthropic', model: HAIKU, maxTokens: 10, caller: 't' });
    expect(sent.at(-1).thinking).toEqual({ type: 'disabled' });
    await chatCompletion([{ role: 'user', content: 'hi' }], { provider: 'anthropic', model: HAIKU, maxTokens: 10, thinking: true, caller: 't' });
    expect(sent.at(-1)).not.toHaveProperty('thinking');
  });
});

describe('the cheap price tier (Haiku 5.5: 5× past 100k prompt tokens)', () => {
  it('the boundary comes from the registry, overridable by env', () => {
    expect(longContextThreshold(HAIKU)).toBe(100000);
    process.env.LONG_CONTEXT_THRESHOLD_CLAUDE_HAIKU_5_5 = '200000';
    expect(longContextThreshold(HAIKU)).toBe(200000);
    expect(longContextThreshold(SONNET)).toBeNull();
  });
  it('estimates with the MEASURED tokenizer rates (English 2.5, Arabic 1.5 chars/token)', () => {
    expect(assertUnderLongContext({ model: HAIKU, chars: 200000, threshold: 100000 })).toBe(80000);
    expect(() => assertUnderLongContext({ model: HAIKU, chars: 250000, threshold: 100000 })).toThrow(/long-context/);   // 3.5/token passed this
    expect(assertUnderLongContext({ model: HAIKU, chars: 120000, arabicChars: 120000, threshold: 100000 })).toBe(80000);
    expect(() => assertUnderLongContext({ model: HAIKU, chars: 150000, arabicChars: 150000, threshold: 100000 })).toThrow(/long-context/);
    expect(promptChars([{ content: 'abc' }, { content: 'بسم' }])).toEqual({ chars: 6, arabicChars: 3 });
  });
  it('a refusal names the caller and is code LONG_CONTEXT', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let err;
    try { guardLongContext({ model: HAIKU, messages: [{ content: 'x'.repeat(300000) }], caller: 'media-meta' }); } catch (e) { err = e; }
    expect(err?.code).toBe('LONG_CONTEXT');
    expect(warn.mock.calls[0][0]).toMatch(/"caller":"media-meta"/);
    expect(guardLongContext({ model: SONNET, messages: [{ content: 'x'.repeat(300000) }], caller: 'c' })).toBe(0);
  });
  it('roleCreate refuses before any request leaves', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(roleCreate('assistant-term', { messages: [{ role: 'user', content: 'x'.repeat(300000) }] })).rejects.toMatchObject({ code: 'LONG_CONTEXT' });
  });
  it('a BILLED prompt past the boundary warns with the caller', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(notePaidLongContext({ model: HAIKU, promptTokens: 100001, caller: 'bio-timeline' })).toBe(true);
    expect(warn.mock.calls[0][0]).toMatch(/PAID.*"caller":"bio-timeline"/);
    expect(notePaidLongContext({ model: HAIKU, promptTokens: 99000, caller: 'x' })).toBe(false);
    expect(notePaidLongContext({ model: SONNET, promptTokens: 500000, caller: 'x' })).toBe(false);
  });
});
