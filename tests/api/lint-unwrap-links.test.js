// unwrapLinks: "[[*Title*](url)]" → "[*Title*](url)" at the exit (11-10 Letters of the Living reply).
import { describe, it, expect } from 'vitest';
import { unwrapLinks, formPass } from '../../api/lib/assistant/lint.js';

describe('unwrapLinks', () => {
  it('drops the brackets around a whole link', () => {
    const r = unwrapLinks("H.M. Balyuzi’s [[*The Báb*](https://oceanlibrary.com/the-bab_balyuzi)], record that");
    expect(r.text).toBe("H.M. Balyuzi’s [*The Báb*](https://oceanlibrary.com/the-bab_balyuzi), record that");
    expect(r.fixed).toBe(1);
  });
  it('leaves an ordinary link and a nested link label alone', () => {
    const t = 'See [*Gleanings*](https://oceanlibrary.com/gleanings) and [[1]](https://x.org/a).';
    expect(unwrapLinks(t).text).toBe(t);
  });
  it('runs in the exit form pass', () => {
    expect(formPass('As [[*Some Answered Questions*](https://oceanlibrary.com/saq)] says.').text).toContain('As [*Some Answered Questions*](https://oceanlibrary.com/saq) says.');
  });
});
