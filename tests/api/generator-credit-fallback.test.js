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

describe('Jev backup when Anthropic is out of credit', () => {
  it('asks the credit role once; a group cap still throws', async () => {
    const { defaultLlm, BACKUP_ROLE, CREDIT_ROLE } = await import('../../api/lib/assistant/jev-backup.js');
    const asked = [];
    const create = async (role) => { asked.push(role); if (role === BACKUP_ROLE) throw new SpendCapError({ group: 'anthropic-credit', spent: 0, cap: 0, caller: 'anthropic', credit: true }); return { choices: [{ message: { content: '{"a":1}' } }] }; };
    expect((await defaultLlm({ system: 's', user: 'u' }, create)).text).toBe('{"a":1}');
    expect(asked).toEqual([BACKUP_ROLE, CREDIT_ROLE]);
    const capped = async () => { throw new SpendCapError({ group: 'anis', spent: 20, cap: 20, caller: 'x' }); };
    await expect(defaultLlm({ system: 's', user: 'u' }, capped)).rejects.toThrow(/spend cap/);
  });
});
