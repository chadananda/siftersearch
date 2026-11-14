// Yes/no gate: refused unless the model marks the item `closed` (Chad 11-13: "Some few questions are legitimately yes/no").
import { describe, it, expect } from 'vitest';
import { questionFault, parseHype } from '../../api/lib/rag/enrich/retrieval.js';

describe('closed yes/no', () => {
  it('refuses an unmarked yes/no in every tier', () => {
    expect(questionFault("Do Bahá'í teachings offer a pattern for future society?", 'X')).toBe('yesNo');
    expect(questionFault('Is there life after death?', 'X', { seeker: true })).toBe('yesNo');
  });
  it('keeps a yes/no the model marked closed', () => {
    expect(questionFault('Can people of any religion pray in a House of Worship?', 'X', { closed: true })).toBeNull();
  });
  it('closed does not excuse the other faults', () => {
    expect(questionFault('Is this passage about prayer?', 'X', { closed: true })).toBe('selfReference');
  });
  it('parseHype carries closed only when it is literally true', () => {
    const j = parseHype(JSON.stringify({ questions: [{ q: 'Can anyone pray there?', a: 'open to all', closed: true }, { q: 'Is it open?', a: 'x', closed: 'yes' }, { q: 'What is prayer?', a: 'y' }] }));
    const by = Object.fromEntries(j.items.map((i) => [i.q, i]));
    expect(by['Can anyone pray there?'].closed).toBe(true);
    expect(by['Is it open?'].closed).toBeUndefined();
    expect(by['What is prayer?'].closed).toBeUndefined();
  });
});
