// Out-of-credit alarm: exhaustion is recognised per vendor wording, a per-minute rate limit is not, and the email goes
// out once per provider per quiet window (stamp file), with [ACTION REQUIRED] in the subject.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isExhaustion, noteProviderError } from '../../api/lib/spend-alerts.js';

describe('isExhaustion', () => {
  it('recognises out-of-credit errors', () => {
    expect(isExhaustion({ status: 402, message: 'Insufficient Balance' })).toBe(true);
    expect(isExhaustion({ message: 'You exceeded your current quota, please check your plan and billing details.' })).toBe(true);
    expect(isExhaustion({ message: 'Your credit balance is too low to access the Anthropic API.' })).toBe(true);
    expect(isExhaustion({ status: 429, message: 'RESOURCE_EXHAUSTED: Quota exceeded for metric generate_content requests per day' })).toBe(true);
    expect(isExhaustion({ message: 'you have used up your daily free allocation of 10,000 neurons' })).toBe(true);
  });
  it('ignores rate limits and ordinary failures', () => {
    expect(isExhaustion({ status: 429, message: 'Quota exceeded for metric embed_content requests per minute' })).toBe(false);
    expect(isExhaustion({ status: 429, message: 'Rate limit reached for requests' })).toBe(false);
    expect(isExhaustion({ status: 500, message: 'internal error' })).toBe(false);
  });
});

describe('noteProviderError', () => {
  it('emails once per provider within the quiet window, flagged ACTION REQUIRED', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alerts-'));
    const sent = [];
    const deps = { dir, to: 'chad@example.org', sendEmail: async (m) => sent.push(m), now: 1_000_000 };
    const err = { status: 402, message: 'Insufficient Balance' };
    expect(await noteProviderError('DeepSeek', err, deps)).toBe(true);
    expect(await noteProviderError('DeepSeek', err, { ...deps, now: 1_000_000 + 3600_000 })).toBe(false);    // 1 h later: quiet
    expect(await noteProviderError('Gemini', err, deps)).toBe(true);                                          // other provider
    expect(await noteProviderError('DeepSeek', err, { ...deps, now: 1_000_000 + 7 * 3600_000 })).toBe(true); // 7 h later
    expect(sent).toHaveLength(3);
    expect(sent[0].subject).toBe('[ACTION REQUIRED] SifterSearch: DeepSeek is out of credit');
    expect(await noteProviderError('DeepSeek', { status: 429, message: 'requests per minute' }, { ...deps, now: 9e9 })).toBe(false);
  });
});
