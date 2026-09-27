// The verifier's prompt/parse seam (the model is not called here).
import { describe, it, expect } from 'vitest';
import { buildUser, parseVerdicts } from '../../api/lib/verify-encounters.js';

describe('verify-encounters', () => {
  it('numbers the claims against the paragraph', () => {
    const u = buildUser({ title: 'God Passes By', text: 'a woman … never attained the presence of the Báb' },
      [{ subject: 'Ṭáhirih', object: 'the Báb', statement: 'Ṭáhirih — met the Báb' }]);
    expect(u).toMatch(/PARAGRAPH \(God Passes By\)/);
    expect(u).toMatch(/1\. SUBJECT: Ṭáhirih \| OBJECT: the Báb/);
  });
  it('parses verdicts by number and rejects unknown verdicts', () => {
    const v = parseVerdicts('{"verdicts":[{"n":2,"verdict":"met","quote":"q"},{"n":1,"verdict":"maybe"}]}', 2);
    expect(v).toEqual([null, { verdict: 'met', quote: 'q', reason: '' }]);
    expect(parseVerdicts('no json', 1)).toBeNull();
  });
});
