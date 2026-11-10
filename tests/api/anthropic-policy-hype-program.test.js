// The HyPE program's quality check (Chad 11-10 "so unblock"): the judge model may check program questions on any book,
// but only as the program (stage hype-judge + caller hype-program) and only with the hype-judge role model — nothing wider.
import { describe, it, expect } from 'vitest';
import { assertAnthropicAllowed, isHypeProgramJudgeAllowed } from '../../api/lib/anthropic-policy.js';
import { modelFor } from '../../api/lib/model-roles.js';

const JUDGE = modelFor('hype-judge').model;
const ok = { provider: 'anthropic', model: JUDGE, stage: 'hype-judge', caller: 'hype-program' };

describe('isHypeProgramJudgeAllowed', () => {
  it('allows the program check on an English-only book (no docId, no original)', () => {
    expect(isHypeProgramJudgeAllowed(ok)).toBe(true);
    expect(() => assertAnthropicAllowed(ok)).not.toThrow();
    expect(() => assertAnthropicAllowed({ ...ok, docId: 999999999 })).not.toThrow();
  });
  it('refuses any other caller, stage or model', () => {
    for (const bad of [{ caller: 'hype-batch' }, { caller: 'improve' }, { caller: undefined }, { stage: 'hype' }, { stage: 'concept-extract' }, { model: 'claude-opus-5-5' }]) {
      expect(isHypeProgramJudgeAllowed({ ...ok, ...bad })).toBe(false);
      expect(() => assertAnthropicAllowed({ ...ok, ...bad, docId: 999999999 })).toThrow();
    }
  });
});
