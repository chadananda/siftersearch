import { describe, it, expect, afterEach } from 'vitest';
import { MODEL_ROLES, modelFor } from '../../api/lib/model-roles.js';
import { MODEL_REGISTRY } from '../../api/lib/model-registry.js';
import { reviewRoles } from '../../api/lib/model-review.js';

afterEach(() => { delete process.env.MODEL_ROLE_ANIS_TERM; });

describe('model roles', () => {
  it('every role names a provider, model, review date and reason; unknown role throws', () => {
    for (const [role, r] of Object.entries(MODEL_ROLES)) expect(r, role).toMatchObject({ provider: expect.any(String), model: expect.any(String), reviewed: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), why: expect.any(String) });
    expect(() => modelFor('no-such-role')).toThrow(/unknown role/);
  });
  it('env override per role', () => {
    process.env.MODEL_ROLE_ANIS_TERM = 'anthropic:claude-haiku-5-5';
    expect(modelFor('assistant-term')).toEqual({ provider: 'anthropic', model: 'claude-haiku-5-5' });
  });
  it('review flags stale reviews, deprecated models and newer cheaper candidates', () => {
    const registry = {
      old: { type: 'chat', pricing: { input: 1, output: 1 }, released: '2025-01-01', deprecated: true },
      a: { type: 'chat', pricing: { input: 1, output: 1 }, released: '2025-01-01' },
      b: { type: 'chat', pricing: { input: 0.1, output: 0.5 }, released: '2026-10-07' },
    };
    const rows = reviewRoles({ x: { provider: 'p', model: 'a', reviewed: '2026-01-01' }, y: { provider: 'p', model: 'old', reviewed: '2026-10-10' } },
      registry, { now: new Date('2026-10-11') });
    expect(rows[0].flags.join('|')).toMatch(/review \d+ days old.*newer & cheaper: b/);
    expect(rows[1].flags).toContain('model deprecated');
  });
  it('the real table reviews without throwing', () => {
    expect(reviewRoles(MODEL_ROLES, MODEL_REGISTRY).length).toBe(Object.keys(MODEL_ROLES).length);
  });
});
