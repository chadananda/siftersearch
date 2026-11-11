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
  it('a quotation in link brackets with no link loses the brackets', () => {
    expect(unwrapLinks('the Báb: [*“Seventeen Letters were enrolled.”*] Lists').text).toBe('the Báb: *“Seventeen Letters were enrolled.”* Lists');
    const linked = '[*“Seventeen Letters.”*](https://oceanlibrary.com/x)';
    expect(unwrapLinks(linked).text).toBe(linked);
  });
  it('an opening bracket nothing closes on its line is dropped', () => {
    expect(unwrapLinks('these disciples [*“found the Báb” (The Báb, #105)*. Next').text).toBe('these disciples *“found the Báb” (The Báb, #105)*. Next');
    const ok = 'See [*A*](https://x.org/a) and [[PASSAGES]] here.\n[*B*](https://x.org/b)';
    expect(unwrapLinks(ok).text).toBe(ok);
  });
  it('a link opened over a multi-line quotation: the orphan close goes, the verse rejoins the quote, the url moves to the attribution', () => {
    const w = 'In Pickthall:\n\n> [*"Lo! We have given thee Abundance;*\n> *So pray unto thy Lord, and sacrifice.*\n\n*Lo! it is thy insulter."*](https://oceanlibrary.com/q/?paraId=para_6529)\n\n> — *The Meaning of the Glorious Qur’án*';
    const out = unwrapLinks(w).text;
    expect(out).toBe('In Pickthall:\n\n> *"Lo! We have given thee Abundance;*\n> *So pray unto thy Lord, and sacrifice.*\n>\n> *Lo! it is thy insulter."*\n\n> — [*The Meaning of the Glorious Qur’án*](https://oceanlibrary.com/q/?paraId=para_6529)');
    const ok = 'A [*b*](https://x.org/b) and ](not a link)';
    expect(unwrapLinks(ok).text).toBe(ok);
  });
  it('runs in the exit form pass', () => {
    expect(formPass('As [[*Some Answered Questions*](https://oceanlibrary.com/saq)] says.').text).toContain('As [*Some Answered Questions*](https://oceanlibrary.com/saq) says.');
  });
});
