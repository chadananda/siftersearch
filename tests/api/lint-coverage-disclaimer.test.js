// Coverage disclaimer at the exit: dropped when the reply cites a source (11-11 email, Quddús).
import { describe, it, expect } from 'vitest';
import { formPass, dropCoverageDisclaimer } from '../../api/lib/assistant/lint.js';

const ANSWER = 'As recorded in [*The Dawn-Breakers*](https://oceanlibrary.com/dawn-breakers_nabil), he was born in Bárfurúsh.';
describe('a coverage disclaimer never opens an answer', () => {
  it('drops "The texts I can search here do not provide a full account" and keeps the "but" clause', () => {
    const r = formPass(`Hello!\n\nThe texts I can search here do not provide a full account of Quddús, but they do preserve a record of his early life.\n\n${ANSWER}`);
    expect(r.text).not.toMatch(/full account/);
    expect(r.text).toMatch(/They do preserve a record of his early life\./);
    expect(r.repairs.coverage_disclaimer).toBe(1);
  });
  it('a whole disclaimer sentence goes', () => {
    expect(dropCoverageDisclaimer(`The sources I found don't give a complete biography of him.\n\n${ANSWER}`).text).toBe(ANSWER);
  });
  it('a reply with no cited source keeps it; a quotation never counts', () => {
    expect(dropCoverageDisclaimer('The texts I can search do not provide a full account of him.').dropped).toBe(0);
    const q = `He wrote: “the texts I have do not give a full account of the siege.”\n\n${ANSWER}`;
    expect(dropCoverageDisclaimer(q).dropped).toBe(0);
  });
});
