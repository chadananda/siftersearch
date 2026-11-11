// creditFallback: a provider out of credit → the second model; a group spend cap still throws (11-10).
import { describe, it, expect } from 'vitest';
import { creditFallback } from '../../api/lib/assistant/judges.js';
import { SpendCapError } from '../../api/lib/spend-caps.js';

describe('creditFallback', () => {
  it('out of credit → the second call answers', async () => {
    const f = creditFallback(async () => { throw new SpendCapError({ group: 'anthropic-credit', spent: 0, cap: 0, caller: 'anthropic', credit: true }); }, async (m) => ({ content: `ok ${m}` }));
    expect((await f('x')).content).toBe('ok x');
  });
  it('a group cap or another error is thrown, never rerouted', async () => {
    const second = async () => ({ content: 'should not run' });
    await expect(creditFallback(async () => { throw new SpendCapError({ group: 'improve', spent: 5, cap: 5, caller: 'x' }); }, second)()).rejects.toThrow(/spend cap/);
    await expect(creditFallback(async () => { throw new Error('boom'); }, second)()).rejects.toThrow('boom');
  });
});
